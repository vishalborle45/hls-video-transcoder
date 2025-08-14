import { redisClient, s3client, prisma } from "./config";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { pipeline } from "stream";
import util from "util";
import mime from "mime-types";

const streamPipeline = util.promisify(pipeline);

const resolutions = [
  { label: "144p", size: "256x144" },
  { label: "240p", size: "426x240" },
  { label: "360p", size: "640x360" },
  { label: "720p", size: "1280x720" },
  { label: "1080p", size: "1920x1080" },
];

async function uploadToS3(localPath: string, s3Key: string) {
  await s3client.send(
    new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME!,
      Key: s3Key,
      Body: fs.createReadStream(localPath),
      ContentType: mime.lookup(localPath) || "application/octet-stream",
    })
  );
}

async function processJob(job: { videoId: number; key: string }) {
  console.log(`🎬 Processing job:`, job);

  const tmpDir = `/tmp/${Date.now()}_${job.videoId}`;
  fs.mkdirSync(tmpDir);

  const originalFile = path.join(tmpDir, "original.mp4");

  // 1️⃣ Download original video
  const getCommand = new GetObjectCommand({
    Bucket: process.env.BUCKET_NAME!,
    Key: job.key,
  });
  const s3Response = await s3client.send(getCommand);
  await streamPipeline(
    s3Response.Body as any,
    fs.createWriteStream(originalFile)
  );

  // 2️⃣ Generate HLS for each resolution
  for (const res of resolutions) {
    const resDir = path.join(tmpDir, res.label);
    fs.mkdirSync(resDir);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(originalFile)
        .outputOptions([
          "-vf",
          `scale=${res.size}`, // scale to target resolution
          "-c:a",
          "aac", // audio codec
          "-c:v",
          "h264", // video codec
          "-hls_time",
          "6", // each chunk = 6 seconds
          "-hls_playlist_type",
          "vod", // playlist type for video-on-demand
          "-hls_segment_filename",
          path.join(resDir, "segment_%03d.ts"),
        ])
        .output(path.join(resDir, "index.m3u8"))
        .on("end", () => resolve())
        .on("error", () => reject())
        .run();
    });

    // Upload playlist + segments
    for (const file of fs.readdirSync(resDir)) {
      await uploadToS3(
        path.join(resDir, file),
        `hls/${job.videoId}/${res.label}/${file}`
      );
    }

    // Save resolution info in DB
    await prisma.videoResolution.create({
      data: {
        videoId: job.videoId,
        resolution: res.label,
        s3Key: `hls/${job.videoId}/${res.label}/index.m3u8`,
      },
    });
  }

  // 3️⃣ Create master playlist
  const masterPlaylist = resolutions
    .map(
      (res) =>
        `#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=${res.size}\nhls/${job.videoId}/${res.label}/index.m3u8`
    )
    .join("\n");

  fs.writeFileSync(
    path.join(tmpDir, "master.m3u8"),
    `#EXTM3U\n${masterPlaylist}`
  );

  await uploadToS3(
    path.join(tmpDir, "master.m3u8"),
    `hls/${job.videoId}/master.m3u8`
  );

  // Update DB video status
  await prisma.video.update({
    where: { id: job.videoId },
    data: { status: "ready", masterPlaylist: `hls/${job.videoId}/master.m3u8` },
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
}

async function main() {
  console.log("⏳ Waiting for jobs...");
  while (true) {
    const jobTuple = await redisClient.blpop("video_jobs", 0);
    if (jobTuple) {
      const [, jobJson] = jobTuple;
      try {
        const job = await JSON.parse(jobJson);
        console.log("calling process for ", job);
        await processJob(job);
      } catch (err) {
        console.error("❌ Error processing job:", err);
      }
    } else {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

main();

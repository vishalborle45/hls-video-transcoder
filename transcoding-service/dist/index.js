"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client_s3_1 = require("@aws-sdk/client-s3");
const stream_1 = require("stream");
const util_1 = __importDefault(require("util"));
const mime_types_1 = __importDefault(require("mime-types"));
const streamPipeline = util_1.default.promisify(stream_1.pipeline);
const resolutions = [
    { label: "144p", size: "256x144" },
    { label: "240p", size: "426x240" },
    { label: "360p", size: "640x360" },
    { label: "720p", size: "1280x720" },
    { label: "1080p", size: "1920x1080" },
];
async function uploadToS3(localPath, s3Key) {
    await config_1.s3client.send(new client_s3_1.PutObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: s3Key,
        Body: fs_1.default.createReadStream(localPath),
        ContentType: mime_types_1.default.lookup(localPath) || "application/octet-stream",
    }));
}
async function processJob(job) {
    console.log(`🎬 Processing job:`, job);
    const tmpDir = `/tmp/${Date.now()}_${job.videoId}`;
    fs_1.default.mkdirSync(tmpDir);
    const originalFile = path_1.default.join(tmpDir, "original.mp4");
    // 1️⃣ Download original video
    const getCommand = new client_s3_1.GetObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: job.key,
    });
    const s3Response = await config_1.s3client.send(getCommand);
    await streamPipeline(s3Response.Body, fs_1.default.createWriteStream(originalFile));
    // 2️⃣ Generate HLS for each resolution
    for (const res of resolutions) {
        const resDir = path_1.default.join(tmpDir, res.label);
        fs_1.default.mkdirSync(resDir);
        await new Promise((resolve, reject) => {
            (0, fluent_ffmpeg_1.default)(originalFile)
                .outputOptions([
                "-vf", `scale=${res.size}`, // scale to target resolution
                "-c:a", "aac", // audio codec
                "-c:v", "h264", // video codec
                "-hls_time", "6", // each chunk = 6 seconds
                "-hls_playlist_type", "vod", // playlist type for video-on-demand
                "-hls_segment_filename", path_1.default.join(resDir, "segment_%03d.ts"),
            ])
                .output(path_1.default.join(resDir, "index.m3u8"))
                .on("end", () => resolve())
                .on("error", () => reject())
                .run();
        });
        // Upload playlist + segments
        for (const file of fs_1.default.readdirSync(resDir)) {
            await uploadToS3(path_1.default.join(resDir, file), `hls/${job.videoId}/${res.label}/${file}`);
        }
        // Save resolution info in DB
        await config_1.prisma.videoResolution.create({
            data: {
                videoId: job.videoId,
                resolution: res.label,
                s3Key: `hls/${job.videoId}/${res.label}/index.m3u8`,
            },
        });
    }
    // 3️⃣ Create master playlist
    const masterPlaylist = resolutions
        .map((res) => `#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=${res.size}\nhls/${job.videoId}/${res.label}/index.m3u8`)
        .join("\n");
    fs_1.default.writeFileSync(path_1.default.join(tmpDir, "master.m3u8"), `#EXTM3U\n${masterPlaylist}`);
    await uploadToS3(path_1.default.join(tmpDir, "master.m3u8"), `hls/${job.videoId}/master.m3u8`);
    // Update DB video status
    await config_1.prisma.video.update({
        where: { id: job.videoId },
        data: { status: "ready", masterPlaylist: `hls/${job.videoId}/master.m3u8` },
    });
    fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
}
async function main() {
    console.log("⏳ Waiting for jobs...");
    while (true) {
        const jobTuple = await config_1.redisClient.blpop("video_jobs", 0);
        if (jobTuple) {
            const [, jobJson] = jobTuple;
            try {
                await processJob(JSON.parse(jobJson));
            }
            catch (err) {
                console.error("❌ Error processing job:", err);
            }
        }
        else {
            await new Promise((r) => setTimeout(r, 2000));
        }
    }
}
main();
//# sourceMappingURL=index.js.map
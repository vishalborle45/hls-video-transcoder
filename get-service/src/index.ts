import express, {  NextFunction,  Request, Response , RequestHandler } from "express";
import cors from "cors";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma, redisClient, s3client } from "./config.js";
import { Readable } from "stream";

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.BUCKET_NAME) {
  throw new Error("BUCKET_NAME must be set in env");
}

const BUCKET = process.env.BUCKET_NAME;


const rate_limit_size = 60
const max_requests = 10


const rateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  //@ts-ignore
  const ip= req.ip;
  const key = `rate:${ip}`;

  const requests = await redisClient.incr(key);

  if (requests === 1) {
    await redisClient.expire(key, rate_limit_size);
  }

  if (requests > max_requests) {
  //@ts-ignore
    return res.status(429).json({ error: "Too many requests" });
  }

  next();
};
  

// Helper: read S3 stream to string
const streamToString = async (stream : any) => {
  if (stream instanceof Readable) {
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf-8");
  }
  throw new Error("S3 Body is not a stream");
};

// Helper: presign a key
const getSignedVideoUrl = async (key : any, expiresIn = 60 * 60) => {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return await getSignedUrl(s3client, cmd, { expiresIn });
};

// 1️⃣ Get all videos with resolutions
app.get("/videos", rateLimiter, async (req, res) => {
  try {
    const videos = await prisma.video.findMany({
      include: { resolutions: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(videos);
  } catch (error) {
    console.error("❌ Error fetching videos:", error);
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});

// 2️⃣ Get signed & rewritten master playlist
app.get("/videos/:id/master", async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10);
    const video = await prisma.video.findUnique({ where: { id: videoId } });

    if (!video || !video.masterPlaylist) {
      return res.status(404).json({ error: "Video or master playlist not found" });
    }

    // Get master playlist content
    const masterCmd = new GetObjectCommand({
      Bucket: BUCKET,
      Key: video.masterPlaylist,
    });
    const masterData = await s3client.send(masterCmd);
    let masterText = await streamToString(masterData.Body);

    // Sign each variant .m3u8 path
    const lines = await Promise.all(
      masterText.split("\n").map(async (line) => {
        if (line.trim().endsWith(".m3u8")) {
          const signedUrl = await getSignedVideoUrl(line.trim());
          return signedUrl;
        }
        return line;
      })
    );

    const signedMaster = lines.join("\n");

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(signedMaster);
  } catch (error) {
    console.error("❌ Error generating signed master playlist:", error);
    res.status(500).json({ error: "Failed to get master playlist" });
  }
});

// 3️⃣ Get signed resolution playlist & rewrite .ts segment paths
app.get("/videos/:id/resolution/:res", async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10);
    const resolution = req.params.res;

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { resolutions: true },
    });

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }
    //@ts-ignore
    const resObj = video.resolutions.find((r) => r.resolution === resolution);
    if (!resObj) {
      return res.status(404).json({ error: "Resolution not found" });
    }

    // Get resolution playlist content
    const resCmd = new GetObjectCommand({
      Bucket: BUCKET,
      Key: resObj.s3Key,
    });
    const resData = await s3client.send(resCmd);
    let playlistText = await streamToString(resData.Body);

    // Sign each .ts segment path
    const lines = await Promise.all(
      playlistText.split("\n").map(async (line) => {
        if (line.trim().endsWith(".ts")) {
          const signedSeg = await getSignedVideoUrl(line.trim());
          return signedSeg;
        }
        return line;
      })
    );

    const signedPlaylist = lines.join("\n");

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(signedPlaylist);
  } catch (error) {
    console.error("❌ Error generating resolution playlist URL:", error);
    res.status(500).json({ error: "Failed to get resolution playlist" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

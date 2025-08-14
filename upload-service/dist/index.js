import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3client, redisClient, prisma } from "./config.js";
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const rate_limit_size = 60;
const max_requests = 10;
const rateLimiter = async (req, res, next) => {
    //@ts-ignore
    const ip = req.ip;
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
app.post("/upload", rateLimiter, async (req, res) => {
    const { key, title } = req.body;
    if (!key)
        return res.status(400).json({ message: "Key is required" });
    try {
        const video = await prisma.video.create({
            data: { key, title, status: "pending" },
        });
        const command = new PutObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: key,
            ContentType: "video/mp4",
        });
        const uploadUrl = await getSignedUrl(s3client, command, {
            expiresIn: 3600,
        });
        res.json({ uploadUrl, videoId: video.id });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to generate upload URL" });
    }
});
app.post("/queue-job", async (req, res) => {
    console.log("job is added to queue");
    const { videoId, key } = req.body;
    await redisClient.lpush("video_jobs", JSON.stringify({ videoId, key }));
    res.json({ message: "Job queued" });
});
app.listen(3000, () => console.log("📦 Upload service running on 3000"));
//# sourceMappingURL=index.js.map
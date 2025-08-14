import { S3Client } from "@aws-sdk/client-s3";
import { Redis } from "ioredis";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
export const s3client = new S3Client({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
    region: process.env.AWS_REGION || "ap-south-1",
});
export const redisClient = new Redis(process.env.REDIS);
export const prisma = new PrismaClient();
//# sourceMappingURL=config.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = exports.redisClient = exports.s3client = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const ioredis_1 = require("ioredis");
require("dotenv/config");
const client_1 = require("@prisma/client");
exports.s3client = new client_s3_1.S3Client({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
    region: process.env.AWS_REGION || "ap-south-1",
});
exports.redisClient = new ioredis_1.Redis(process.env.REDIS);
exports.prisma = new client_1.PrismaClient();
//# sourceMappingURL=config.js.map
import { S3Client } from "@aws-sdk/client-s3";
import { Redis } from "ioredis";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
export declare const s3client: S3Client;
export declare const redisClient: Redis;
export declare const prisma: PrismaClient<import("@prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
//# sourceMappingURL=config.d.ts.map
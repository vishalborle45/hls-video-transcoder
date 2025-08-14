-- CreateTable
CREATE TABLE "public"."Video" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VideoResolution" (
    "id" SERIAL NOT NULL,
    "resolution" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "videoId" INTEGER NOT NULL,

    CONSTRAINT "VideoResolution_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."VideoResolution" ADD CONSTRAINT "VideoResolution_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "public"."Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

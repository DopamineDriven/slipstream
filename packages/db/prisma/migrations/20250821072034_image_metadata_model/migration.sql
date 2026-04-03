/*
  Warnings:

  - A unique constraint covering the columns `[s3ObjectId]` on the table `Attachment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `s3ObjectId` to the `Attachment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."ChecksumAlgo" AS ENUM ('CRC32', 'CRC32C', 'SHA1', 'SHA256', 'CRC64NVME');

-- CreateEnum
CREATE TYPE "public"."ImageFormat" AS ENUM ('apng', 'jpeg', 'png', 'webp', 'avif', 'heic', 'gif', 'tiff', 'bmp', 'svg', 'unknown');

-- CreateEnum
CREATE TYPE "public"."ColorSpace" AS ENUM ('srgb', 'display_p3', 'adobe_rgb', 'prophoto_rgb', 'rec2020', 'rec709', 'cmyk', 'lab', 'xyz', 'gray', 'unknown');

-- DropIndex
DROP INDEX "public"."Attachment_bucket_key_conversationId_key";

-- AlterTable
ALTER TABLE "public"."Attachment" ADD COLUMN     "cacheControl" TEXT,
ADD COLUMN     "checksumAlgo" "public"."ChecksumAlgo" NOT NULL DEFAULT 'SHA256',
ADD COLUMN     "contentDisposition" TEXT,
ADD COLUMN     "contentEncoding" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "s3LastModified" TIMESTAMP(3),
ADD COLUMN     "s3ObjectId" TEXT NOT NULL,
ADD COLUMN     "sseAlgorithm" TEXT,
ADD COLUMN     "sseKmsKeyId" TEXT,
ADD COLUMN     "storageClass" TEXT,
ALTER COLUMN "meta" DROP NOT NULL;

-- CreateTable
CREATE TABLE "public"."ImageMetadata" (
    "attachmentId" TEXT NOT NULL,
    "format" "public"."ImageFormat" NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "aspectRatio" DECIMAL(6,4) NOT NULL,
    "frames" INTEGER NOT NULL DEFAULT 1,
    "hasAlpha" BOOLEAN,
    "animated" BOOLEAN NOT NULL DEFAULT false,
    "orientation" SMALLINT,
    "colorSpace" "public"."ColorSpace",
    "exifDateTimeOriginal" TIMESTAMP(3),
    "cameraMake" TEXT,
    "cameraModel" TEXT,
    "lensModel" TEXT,
    "gpsLat" DECIMAL(10,7),
    "gpsLon" DECIMAL(10,7),
    "dominantColorHex" VARCHAR(7),
    "iccProfile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageMetadata_pkey" PRIMARY KEY ("attachmentId")
);

-- CreateIndex
CREATE INDEX "ImageMetadata_format_idx" ON "public"."ImageMetadata"("format");

-- CreateIndex
CREATE INDEX "ImageMetadata_width_height_idx" ON "public"."ImageMetadata"("width", "height");

-- CreateIndex
CREATE INDEX "ImageMetadata_animated_idx" ON "public"."ImageMetadata"("animated");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_s3ObjectId_key" ON "public"."Attachment"("s3ObjectId");

-- CreateIndex
CREATE INDEX "Attachment_conversationId_idx" ON "public"."Attachment"("conversationId");

-- CreateIndex
CREATE INDEX "Attachment_bucket_key_idx" ON "public"."Attachment"("bucket", "key");

-- AddForeignKey
ALTER TABLE "public"."ImageMetadata" ADD CONSTRAINT "ImageMetadata_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "public"."Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

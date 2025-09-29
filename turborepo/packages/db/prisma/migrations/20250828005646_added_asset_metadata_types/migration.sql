-- CreateEnum
CREATE TYPE "public"."AssetType" AS ENUM ('DOCUMENT', 'IMAGE', 'VIDEO', 'AUDIO', 'UNKNOWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."ImageFormat" ADD VALUE 'ico';
ALTER TYPE "public"."ImageFormat" ADD VALUE 'jxl';
ALTER TYPE "public"."ImageFormat" ADD VALUE 'jp2';
ALTER TYPE "public"."ImageFormat" ADD VALUE 'jpx';
ALTER TYPE "public"."ImageFormat" ADD VALUE 'jxr';
ALTER TYPE "public"."ImageFormat" ADD VALUE 'jls';
ALTER TYPE "public"."ImageFormat" ADD VALUE 'raw';
ALTER TYPE "public"."ImageFormat" ADD VALUE 'dng';
ALTER TYPE "public"."ImageFormat" ADD VALUE 'cr2';
ALTER TYPE "public"."ImageFormat" ADD VALUE 'nef';
ALTER TYPE "public"."ImageFormat" ADD VALUE 'arw';
ALTER TYPE "public"."ImageFormat" ADD VALUE 'hdr';
ALTER TYPE "public"."ImageFormat" ADD VALUE 'pic';
ALTER TYPE "public"."ImageFormat" ADD VALUE 'rgbe';
ALTER TYPE "public"."ImageFormat" ADD VALUE 'xyze';

-- AlterTable
ALTER TABLE "public"."Attachment" ADD COLUMN     "assetType" "public"."AssetType" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "public"."ImageMetadata" ALTER COLUMN "format" SET DEFAULT 'unknown';

-- CreateTable
CREATE TABLE "public"."VideoMetadata" (
    "attachmentId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "aspectRatio" DECIMAL(6,4) NOT NULL,
    "duration" INTEGER NOT NULL,
    "frameRate" DECIMAL(5,2),
    "bitrate" INTEGER,
    "codec" TEXT,
    "hasAudio" BOOLEAN NOT NULL DEFAULT false,
    "resolution" TEXT,
    "orientation" SMALLINT,
    "rotation" INTEGER,
    "thumbnailCount" INTEGER DEFAULT 0,
    "keyframeTimes" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoMetadata_pkey" PRIMARY KEY ("attachmentId")
);

-- CreateTable
CREATE TABLE "public"."AudioMetadata" (
    "attachmentId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "bitrate" INTEGER,
    "sampleRate" INTEGER,
    "channels" INTEGER,
    "codec" TEXT,
    "title" TEXT,
    "artist" TEXT,
    "album" TEXT,
    "year" SMALLINT,
    "genre" TEXT,
    "waveformPeaks" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioMetadata_pkey" PRIMARY KEY ("attachmentId")
);

-- CreateTable
CREATE TABLE "public"."DocumentMetadata" (
    "attachmentId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "pageCount" INTEGER,
    "wordCount" INTEGER,
    "language" TEXT,
    "title" TEXT,
    "author" TEXT,
    "subject" TEXT,
    "keywords" TEXT[],
    "pdfVersion" TEXT,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "isSearchable" BOOLEAN NOT NULL DEFAULT true,
    "encoding" TEXT,
    "lineCount" INTEGER,
    "textPreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentMetadata_pkey" PRIMARY KEY ("attachmentId")
);

-- CreateIndex
CREATE INDEX "VideoMetadata_duration_idx" ON "public"."VideoMetadata"("duration");

-- CreateIndex
CREATE INDEX "VideoMetadata_resolution_idx" ON "public"."VideoMetadata"("resolution");

-- CreateIndex
CREATE INDEX "VideoMetadata_format_idx" ON "public"."VideoMetadata"("format");

-- CreateIndex
CREATE INDEX "AudioMetadata_duration_idx" ON "public"."AudioMetadata"("duration");

-- CreateIndex
CREATE INDEX "AudioMetadata_artist_album_idx" ON "public"."AudioMetadata"("artist", "album");

-- CreateIndex
CREATE INDEX "AudioMetadata_format_idx" ON "public"."AudioMetadata"("format");

-- CreateIndex
CREATE INDEX "DocumentMetadata_pageCount_idx" ON "public"."DocumentMetadata"("pageCount");

-- CreateIndex
CREATE INDEX "DocumentMetadata_language_idx" ON "public"."DocumentMetadata"("language");

-- CreateIndex
CREATE INDEX "DocumentMetadata_format_idx" ON "public"."DocumentMetadata"("format");

-- CreateIndex
CREATE INDEX "Attachment_assetType_createdAt_idx" ON "public"."Attachment"("assetType", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."VideoMetadata" ADD CONSTRAINT "VideoMetadata_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "public"."Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AudioMetadata" ADD CONSTRAINT "AudioMetadata_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "public"."Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentMetadata" ADD CONSTRAINT "DocumentMetadata_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "public"."Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

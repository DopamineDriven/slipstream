/*
  Warnings:

  - You are about to drop the column `index` on the `ImageGenOutput` table. All the data in the column will be lost.
  - You are about to drop the column `partialIndex` on the `ImageGenOutput` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[jobId,seriesId,kind,seriesIndex]` on the table `ImageGenOutput` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `isPartial` to the `ImageGenOutput` table without a default value. This is not possible if the table is not empty.
  - Added the required column `jobIndex` to the `ImageGenOutput` table without a default value. This is not possible if the table is not empty.
  - Added the required column `seriesId` to the `ImageGenOutput` table without a default value. This is not possible if the table is not empty.
  - Added the required column `seriesIndex` to the `ImageGenOutput` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ImageGenOutput` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('AUDIO_GEN', 'COMPUTER_USE', 'IMAGE_GEN', 'TEXT', 'VIDEO_GEN');

-- DropIndex
DROP INDEX "public"."ImageGenOutput_jobId_index_kind_idx";

-- DropIndex
DROP INDEX "public"."ImageGenOutput_jobId_index_kind_partialIndex_key";

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "seriesId" TEXT;

-- AlterTable
ALTER TABLE "ImageGenOutput" DROP COLUMN "index",
DROP COLUMN "partialIndex",
ADD COLUMN     "ext" TEXT,
ADD COLUMN     "isPartial" BOOLEAN NOT NULL,
ADD COLUMN     "jobIndex" INTEGER NOT NULL,
ADD COLUMN     "seriesId" TEXT NOT NULL,
ADD COLUMN     "seriesIndex" INTEGER NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "isImageGen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "messageType" "MessageType" NOT NULL DEFAULT 'TEXT';

-- CreateIndex
CREATE INDEX "Attachment_generationGroupId_createdAt_idx" ON "Attachment"("generationGroupId", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_seriesId_idx" ON "Attachment"("seriesId");

-- CreateIndex
CREATE INDEX "ImageGenOutput_jobId_jobIndex_kind_idx" ON "ImageGenOutput"("jobId", "jobIndex", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ImageGenOutput_jobId_seriesId_kind_seriesIndex_key" ON "ImageGenOutput"("jobId", "seriesId", "kind", "seriesIndex");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Message_conversationId_isImageGen_createdAt_idx" ON "Message"("conversationId", "isImageGen", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Message_conversationId_messageType_createdAt_idx" ON "Message"("conversationId", "messageType", "createdAt" DESC);

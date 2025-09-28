/*
  Warnings:

  - You are about to drop the column `type` on the `Attachment` table. All the data in the column will be lost.
  - You are about to drop the column `url` on the `Attachment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[bucket,key]` on the table `Attachment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `bucket` to the `Attachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `key` to the `Attachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Attachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Attachment` table without a default value. This is not possible if the table is not empty.
  - Made the column `conversationId` on table `Attachment` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "public"."AssetOrigin" AS ENUM ('UPLOAD', 'REMOTE', 'GENERATED');

-- CreateEnum
CREATE TYPE "public"."AssetStatus" AS ENUM ('REQUESTED', 'PLANNED', 'UPLOADING', 'STORED', 'SCANNING', 'READY', 'FAILED', 'QUARANTINED', 'ATTACHED');

-- DropForeignKey
ALTER TABLE "public"."Attachment" DROP CONSTRAINT "Attachment_messageId_fkey";

-- AlterTable
ALTER TABLE "public"."Attachment" DROP COLUMN "type",
DROP COLUMN "url",
ADD COLUMN     "bucket" TEXT NOT NULL,
ADD COLUMN     "checksumSha256" TEXT,
ADD COLUMN     "etag" TEXT,
ADD COLUMN     "key" TEXT NOT NULL,
ADD COLUMN     "meta" JSONB,
ADD COLUMN     "mime" TEXT,
ADD COLUMN     "origin" "public"."AssetOrigin" NOT NULL DEFAULT 'UPLOAD',
ADD COLUMN     "region" TEXT NOT NULL DEFAULT 'us-east-1',
ADD COLUMN     "size" BIGINT,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "status" "public"."AssetStatus" NOT NULL DEFAULT 'REQUESTED',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "messageId" DROP NOT NULL,
ALTER COLUMN "conversationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Attachment_conversationId_createdAt_idx" ON "public"."Attachment"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_userId_createdAt_idx" ON "public"."Attachment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_status_createdAt_idx" ON "public"."Attachment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_bucket_key_key" ON "public"."Attachment"("bucket", "key");

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

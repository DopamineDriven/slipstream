/*
  Warnings:

  - You are about to drop the column `conversationId` on the `ImageGenJob` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."ImageGenJob" DROP CONSTRAINT "ImageGenJob_conversationId_fkey";

-- DropIndex
DROP INDEX "public"."ImageGenJob_conversationId_createdAt_idx";

-- AlterTable
ALTER TABLE "ImageGenJob" DROP COLUMN "conversationId";

-- CreateIndex
CREATE INDEX "ImageGenJob_requestMessageId_createdAt_idx" ON "ImageGenJob"("requestMessageId", "createdAt");

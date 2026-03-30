/*
  Warnings:

  - Made the column `conversationId` on table `TTSJob` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "TTSJob" ALTER COLUMN "conversationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "TTSJob_conversationId_idx" ON "TTSJob"("conversationId");

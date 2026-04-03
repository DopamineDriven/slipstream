-- CreateEnum
CREATE TYPE "TTSStatus" AS ENUM ('NONE', 'QUEUED', 'PROCESSING', 'COUPLED', 'FAILED');

-- CreateTable
CREATE TABLE "TTSJob" (
    "id" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userKeyId" TEXT,
    "provider" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "codec" TEXT NOT NULL,
    "sampleRate" INTEGER,
    "bitrate" INTEGER,
    "cdnUrl" TEXT,
    "charCount" INTEGER NOT NULL,
    "status" "TTSStatus" NOT NULL DEFAULT 'QUEUED',
    "durationMs" INTEGER,
    "generationMs" INTEGER,
    "sizeBytes" BIGINT,
    "error" TEXT,
    "attachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TTSJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TTSJob_sourceMessageId_key" ON "TTSJob"("sourceMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "TTSJob_attachmentId_key" ON "TTSJob"("attachmentId");

-- CreateIndex
CREATE INDEX "TTSJob_attachmentId_idx" ON "TTSJob"("attachmentId");

-- CreateIndex
CREATE INDEX "TTSJob_status_createdAt_idx" ON "TTSJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TTSJob_userId_createdAt_idx" ON "TTSJob"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TTSJob_userId_sourceMessageId_key" ON "TTSJob"("userId", "sourceMessageId");

-- AddForeignKey
ALTER TABLE "TTSJob" ADD CONSTRAINT "TTSJob_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TTSJob" ADD CONSTRAINT "TTSJob_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

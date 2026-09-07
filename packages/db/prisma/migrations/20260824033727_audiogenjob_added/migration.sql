-- CreateEnum
CREATE TYPE "AudioGenStage" AS ENUM ('QUEUED', 'PROCESSING', 'PERSISTING', 'FINALIZING', 'COMPLETED', 'REFUSAL', 'FAILED', 'ABORTED');

-- CreateTable
CREATE TABLE "AudioGenJob" (
    "id" TEXT NOT NULL,
    "requestMessageId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "model" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userKeyId" TEXT,
    "keyFingerprint" TEXT,
    "prompt" TEXT NOT NULL,
    "systemPrompt" TEXT,
    "stage" "AudioGenStage" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "etaSeconds" INTEGER,
    "durationMs" INTEGER,
    "usage" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioGenJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioGenOutput" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "mime" TEXT,
    "ext" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioGenOutput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AudioGenJob_requestMessageId_key" ON "AudioGenJob"("requestMessageId");

-- CreateIndex
CREATE INDEX "AudioGenJob_requestMessageId_createdAt_idx" ON "AudioGenJob"("requestMessageId", "createdAt");

-- CreateIndex
CREATE INDEX "AudioGenJob_provider_model_createdAt_idx" ON "AudioGenJob"("provider", "model", "createdAt");

-- CreateIndex
CREATE INDEX "AudioGenJob_stage_createdAt_idx" ON "AudioGenJob"("stage", "createdAt");

-- CreateIndex
CREATE INDEX "AudioGenJob_userId_createdAt_idx" ON "AudioGenJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AudioGenJob_userKeyId_idx" ON "AudioGenJob"("userKeyId");

-- CreateIndex
CREATE UNIQUE INDEX "AudioGenOutput_jobId_key" ON "AudioGenOutput"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "AudioGenOutput_attachmentId_key" ON "AudioGenOutput"("attachmentId");

-- AddForeignKey
ALTER TABLE "AudioGenJob" ADD CONSTRAINT "AudioGenJob_requestMessageId_fkey" FOREIGN KEY ("requestMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioGenJob" ADD CONSTRAINT "AudioGenJob_userKeyId_fkey" FOREIGN KEY ("userKeyId") REFERENCES "UserApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioGenOutput" ADD CONSTRAINT "AudioGenOutput_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AudioGenJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioGenOutput" ADD CONSTRAINT "AudioGenOutput_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

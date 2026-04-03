-- CreateEnum
CREATE TYPE "ImageGenStage" AS ENUM ('QUEUED', 'PROCESSING', 'PERSISTING', 'FINALIZING', 'COMPLETED', 'REFUSAL', 'FAILED', 'ABORTED');

-- CreateEnum
CREATE TYPE "ImageGenOutputKind" AS ENUM ('PARTIAL', 'FINAL');

-- CreateTable
CREATE TABLE "ImageGenJob" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "requestMessageId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "model" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userKeyId" TEXT,
    "keyFingerprint" TEXT,
    "prompt" TEXT NOT NULL,
    "systemPrompt" TEXT,
    "temperature" DOUBLE PRECISION,
    "topP" DOUBLE PRECISION,
    "nRequested" INTEGER NOT NULL DEFAULT 1,
    "nCompleted" INTEGER NOT NULL DEFAULT 0,
    "seed" INTEGER,
    "negativePrompt" TEXT,
    "outputSize" TEXT,
    "outputQuality" TEXT,
    "outputFormat" TEXT,
    "outputBackground" TEXT,
    "outputCompression" INTEGER,
    "partialImagesRequested" INTEGER,
    "inputFidelity" TEXT,
    "personGenertion" TEXT,
    "moderation" TEXT,
    "stage" "ImageGenStage" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "etaSeconds" INTEGER,
    "durationMs" INTEGER,
    "usage" INTEGER,
    "revisedPrompt" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageGenJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageGenOutput" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "kind" "ImageGenOutputKind" NOT NULL DEFAULT 'FINAL',
    "partialIndex" INTEGER,
    "attachmentId" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "mime" TEXT,
    "revisedPrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageGenOutput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImageGenJob_requestMessageId_key" ON "ImageGenJob"("requestMessageId");

-- CreateIndex
CREATE INDEX "ImageGenJob_conversationId_createdAt_idx" ON "ImageGenJob"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ImageGenJob_provider_model_createdAt_idx" ON "ImageGenJob"("provider", "model", "createdAt");

-- CreateIndex
CREATE INDEX "ImageGenJob_stage_createdAt_idx" ON "ImageGenJob"("stage", "createdAt");

-- CreateIndex
CREATE INDEX "ImageGenJob_userId_createdAt_idx" ON "ImageGenJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ImageGenJob_userKeyId_idx" ON "ImageGenJob"("userKeyId");

-- CreateIndex
CREATE UNIQUE INDEX "ImageGenOutput_attachmentId_key" ON "ImageGenOutput"("attachmentId");

-- CreateIndex
CREATE INDEX "ImageGenOutput_jobId_index_kind_idx" ON "ImageGenOutput"("jobId", "index", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ImageGenOutput_jobId_index_kind_partialIndex_key" ON "ImageGenOutput"("jobId", "index", "kind", "partialIndex");

-- AddForeignKey
ALTER TABLE "ImageGenJob" ADD CONSTRAINT "ImageGenJob_requestMessageId_fkey" FOREIGN KEY ("requestMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenJob" ADD CONSTRAINT "ImageGenJob_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenJob" ADD CONSTRAINT "ImageGenJob_userKeyId_fkey" FOREIGN KEY ("userKeyId") REFERENCES "UserApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenOutput" ADD CONSTRAINT "ImageGenOutput_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ImageGenJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenOutput" ADD CONSTRAINT "ImageGenOutput_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

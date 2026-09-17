-- CreateEnum
CREATE TYPE "DictationCouplingStatus" AS ENUM ('PENDING', 'DECOUPLED', 'COUPLED', 'ORPHANED', 'FAILED');

-- CreateEnum
CREATE TYPE "DictationStatus" AS ENUM ('QUEUED', 'GENERATING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "DictationVersion" AS ENUM ('v1_0');

-- CreateEnum
CREATE TYPE "DictationEncoding" AS ENUM ('PCM', 'ALAW', 'MULAW', 'OPUS');

-- CreateTable
CREATE TABLE "Dictation" (
    "id" TEXT NOT NULL,
    "messageOrdinal" INTEGER,
    "conversationId" TEXT,
    "userId" TEXT NOT NULL,
    "messageId" TEXT,
    "ordinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "draftId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "inputSampleRate" INTEGER,
    "externalId" TEXT,
    "encoding" "DictationEncoding" NOT NULL DEFAULT 'PCM',
    "language" TEXT,
    "sampleRate" INTEGER NOT NULL DEFAULT 16000,
    "keyterms" TEXT,
    "fillerWords" BOOLEAN NOT NULL DEFAULT false,
    "diarize" BOOLEAN NOT NULL DEFAULT false,
    "vadThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.08,
    "endpointing" INTEGER NOT NULL DEFAULT 400,
    "channels" INTEGER NOT NULL DEFAULT 1,
    "multichannel" BOOLEAN NOT NULL DEFAULT false,
    "interimResults" BOOLEAN NOT NULL DEFAULT false,
    "smartTurn" DOUBLE PRECISION,
    "smartTurnTimeout" INTEGER,
    "status" "DictationStatus" NOT NULL DEFAULT 'QUEUED',
    "couplingStatus" "DictationCouplingStatus" NOT NULL DEFAULT 'PENDING',
    "version" "DictationVersion" NOT NULL DEFAULT 'v1_0',

    CONSTRAINT "Dictation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dictation_draftId_key" ON "Dictation"("draftId");

-- CreateIndex
CREATE INDEX "Dictation_conversationId_createdAt_idx" ON "Dictation"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Dictation_language_idx" ON "Dictation"("language");

-- CreateIndex
CREATE INDEX "Dictation_couplingStatus_idx" ON "Dictation"("couplingStatus");

-- CreateIndex
CREATE INDEX "Dictation_status_idx" ON "Dictation"("status");

-- CreateIndex
CREATE INDEX "Dictation_batchId_conversationId_idx" ON "Dictation"("batchId", "conversationId");

-- CreateIndex
CREATE INDEX "Dictation_userId_createdAt_idx" ON "Dictation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Dictation_messageId_idx" ON "Dictation"("messageId");

-- CreateIndex
CREATE INDEX "Dictation_externalId_idx" ON "Dictation"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Dictation_batchId_ordinal_key" ON "Dictation"("batchId", "ordinal");

-- AddForeignKey
ALTER TABLE "Dictation" ADD CONSTRAINT "Dictation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dictation" ADD CONSTRAINT "Dictation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dictation" ADD CONSTRAINT "Dictation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "ChunkingState" AS ENUM ('IDLE', 'QUEUED', 'CHUNKING', 'COMPLETE', 'ERROR');

-- CreateTable
CREATE TABLE "ProviderStoreDocumentChunk" (
    "id" TEXT NOT NULL,
    "providerStoreDocId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderStoreDocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMemoryChunk" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contextStateId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "provenanceId" TEXT NOT NULL,
    "messageIdStart" TEXT NOT NULL,
    "messageIdEnd" TEXT NOT NULL,
    "chunkingError" TEXT,
    "chunkingState" "ChunkingState" NOT NULL DEFAULT 'IDLE',
    "messageTimestampStart" TIMESTAMP(3) NOT NULL,
    "messageTimestampEnd" TIMESTAMP(3) NOT NULL,
    "transcriptMarkdown" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "modelProvidersInChunkRaw" TEXT NOT NULL,
    "messageIdsRaw" TEXT NOT NULL,
    "attachmentIdsRaw" TEXT,
    "embeddingModel" TEXT NOT NULL DEFAULT 'voyage-context-3',
    "summary" TEXT,
    "summaryModelProvider" TEXT,
    "summaryGeneratedAt" TIMESTAMP(3),
    "summaryUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationMemoryChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationContextState" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "rollingSummary" TEXT,
    "rollingSummaryModels" TEXT,
    "rollingSummaryTokens" INTEGER NOT NULL DEFAULT 0,
    "rollingSummaryUpdatedAt" TIMESTAMP(3),
    "totalInputTokensCurrent" INTEGER NOT NULL DEFAULT 0,
    "lastChunkedMessageId" TEXT,
    "lastChunkedMessageIndex" INTEGER,
    "totalModels" INTEGER NOT NULL DEFAULT 0,
    "totalProviders" INTEGER NOT NULL DEFAULT 0,
    "totalTurns" INTEGER NOT NULL DEFAULT 0,
    "chunkedTurns" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationContextState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderStoreDocumentChunk_providerStoreDocId_idx" ON "ProviderStoreDocumentChunk"("providerStoreDocId");

-- CreateIndex
CREATE INDEX "ProviderStoreDocumentChunk_attachmentId_idx" ON "ProviderStoreDocumentChunk"("attachmentId");

-- CreateIndex
CREATE INDEX "ProviderStoreDocumentChunk_attachmentId_provider_idx" ON "ProviderStoreDocumentChunk"("attachmentId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderStoreDocumentChunk_providerStoreDocId_chunkIndex_key" ON "ProviderStoreDocumentChunk"("providerStoreDocId", "chunkIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMemoryChunk_provenanceId_key" ON "ConversationMemoryChunk"("provenanceId");

-- CreateIndex
CREATE INDEX "ConversationMemoryChunk_contextStateId_idx" ON "ConversationMemoryChunk"("contextStateId");

-- CreateIndex
CREATE INDEX "ConversationMemoryChunk_conversationId_idx" ON "ConversationMemoryChunk"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationMemoryChunk_conversationId_provider_idx" ON "ConversationMemoryChunk"("conversationId", "provider");

-- CreateIndex
CREATE INDEX "ConversationMemoryChunk_contextStateId_messageIdStart_idx" ON "ConversationMemoryChunk"("contextStateId", "messageIdStart");

-- CreateIndex
CREATE INDEX "ConversationMemoryChunk_messageIdStart_messageIdEnd_idx" ON "ConversationMemoryChunk"("messageIdStart", "messageIdEnd");

-- CreateIndex
CREATE INDEX "ConversationMemoryChunk_messageTimestampStart_messageTimest_idx" ON "ConversationMemoryChunk"("messageTimestampStart", "messageTimestampEnd");

-- CreateIndex
CREATE INDEX "ConversationMemoryChunk_chunkingState_idx" ON "ConversationMemoryChunk"("chunkingState");

-- CreateIndex
CREATE INDEX "ConversationContextState_totalInputTokensCurrent_idx" ON "ConversationContextState"("totalInputTokensCurrent");

-- CreateIndex
CREATE INDEX "ConversationContextState_storeId_idx" ON "ConversationContextState"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationContextState_conversationId_provider_key" ON "ConversationContextState"("conversationId", "provider");

-- AddForeignKey
ALTER TABLE "ProviderStoreDocumentChunk" ADD CONSTRAINT "ProviderStoreDocumentChunk_providerStoreDocId_fkey" FOREIGN KEY ("providerStoreDocId") REFERENCES "ProviderStoreDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMemoryChunk" ADD CONSTRAINT "ConversationMemoryChunk_contextStateId_fkey" FOREIGN KEY ("contextStateId") REFERENCES "ConversationContextState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationContextState" ADD CONSTRAINT "ConversationContextState_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "ProviderStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationContextState" ADD CONSTRAINT "ConversationContextState_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

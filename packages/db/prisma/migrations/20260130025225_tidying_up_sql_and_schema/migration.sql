/*
  Warnings:

  - You are about to drop the column `attachmentIdsRaw` on the `ConversationMemoryChunk` table. All the data in the column will be lost.
  - You are about to drop the column `contextStateId` on the `ConversationMemoryChunk` table. All the data in the column will be lost.
  - You are about to drop the column `modelProvidersInChunkRaw` on the `ConversationMemoryChunk` table. All the data in the column will be lost.
  - You are about to drop the column `provider` on the `ConversationMemoryChunk` table. All the data in the column will be lost.
  - You are about to drop the column `summaryModelProvider` on the `ConversationMemoryChunk` table. All the data in the column will be lost.
  - You are about to drop the column `summaryUpdatedAt` on the `ConversationMemoryChunk` table. All the data in the column will be lost.
  - The `chunkingState` column on the `ConversationMemoryChunk` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `ConversationContextState` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProviderStoreDocumentChunk` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `chunkIndex` to the `ConversationMemoryChunk` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contentHash` to the `ConversationMemoryChunk` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contextId` to the `ConversationMemoryChunk` table without a default value. This is not possible if the table is not empty.
  - Added the required column `modelsInChunkRaw` to the `ConversationMemoryChunk` table without a default value. This is not possible if the table is not empty.
  - Added the required column `providersInChunkRaw` to the `ConversationMemoryChunk` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeId` to the `ConversationMemoryChunk` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VisualMediaHint" AS ENUM ('animations', 'charts', 'drawings', 'images', 'mixed', 'slides');

-- CreateEnum
CREATE TYPE "LocalStoreDocState" AS ENUM ('QUEUED', 'PENDING', 'PROCESSING', 'ACTIVE', 'FAILED');

-- CreateEnum
CREATE TYPE "LocalStoreSchemaVersion" AS ENUM ('v1_0');

-- CreateEnum
CREATE TYPE "MemoryChunkingState" AS ENUM ('QUEUED', 'CHUNKING', 'EMBEDDING', 'INDEXED', 'ERROR');

-- CreateEnum
CREATE TYPE "MemoryChunkBoundaryReason" AS ENUM ('TOKEN_LIMIT', 'IDLE_TIME', 'TOPIC_SHIFT', 'SESSION_END', 'OTHER');

-- CreateEnum
CREATE TYPE "MemorySchemaVersion" AS ENUM ('v1_0');

-- DropForeignKey
ALTER TABLE "ConversationContextState" DROP CONSTRAINT "ConversationContextState_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "ConversationContextState" DROP CONSTRAINT "ConversationContextState_storeId_fkey";

-- DropForeignKey
ALTER TABLE "ConversationMemoryChunk" DROP CONSTRAINT "ConversationMemoryChunk_contextStateId_fkey";

-- DropForeignKey
ALTER TABLE "ProviderStoreDocumentChunk" DROP CONSTRAINT "ProviderStoreDocumentChunk_providerStoreDocId_fkey";

-- DropIndex
DROP INDEX "ConversationMemoryChunk_contextStateId_idx";

-- DropIndex
DROP INDEX "ConversationMemoryChunk_contextStateId_messageIdStart_idx";

-- DropIndex
DROP INDEX "ConversationMemoryChunk_conversationId_provider_idx";

-- AlterTable
ALTER TABLE "ConversationMemoryChunk" DROP COLUMN "attachmentIdsRaw",
DROP COLUMN "contextStateId",
DROP COLUMN "modelProvidersInChunkRaw",
DROP COLUMN "provider",
DROP COLUMN "summaryModelProvider",
DROP COLUMN "summaryUpdatedAt",
ADD COLUMN     "attachmentProvenanceIdsRaw" TEXT,
ADD COLUMN     "boundaryReason" "MemoryChunkBoundaryReason",
ADD COLUMN     "chunkIndex" INTEGER NOT NULL,
ADD COLUMN     "chunkedAttachmentsCount" INTEGER,
ADD COLUMN     "chunkedMessagesCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "contentHash" TEXT NOT NULL,
ADD COLUMN     "contextId" TEXT NOT NULL,
ADD COLUMN     "embeddedAt" TIMESTAMP(3),
ADD COLUMN     "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "modelsInChunkRaw" TEXT NOT NULL,
ADD COLUMN     "providersInChunkRaw" TEXT NOT NULL,
ADD COLUMN     "schemaVersion" "MemorySchemaVersion" NOT NULL DEFAULT 'v1_0',
ADD COLUMN     "storeId" TEXT NOT NULL,
ADD COLUMN     "summaryModel" TEXT,
ADD COLUMN     "summaryProvider" "Provider",
ADD COLUMN     "totalThinkingDurationMs" INTEGER,
DROP COLUMN "chunkingState",
ADD COLUMN     "chunkingState" "MemoryChunkingState" NOT NULL DEFAULT 'QUEUED';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "conversationMemoryChunkId" TEXT;

-- DropTable
DROP TABLE "ConversationContextState";

-- DropTable
DROP TABLE "ProviderStoreDocumentChunk";

-- DropEnum
DROP TYPE "ChunkingState";

-- CreateTable
CREATE TABLE "LocalVectorStore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "storeName" TEXT NOT NULL,
    "defaultEmbeddingModel" TEXT NOT NULL DEFAULT 'voyage-context-3',
    "embeddingDim" INTEGER NOT NULL DEFAULT 1024,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "totalBytes" BIGINT,
    "totalChunks" INTEGER NOT NULL DEFAULT 0,
    "schemaVersion" "LocalStoreSchemaVersion" NOT NULL DEFAULT 'v1_0',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalVectorStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalVectorStoreDoc" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "provenanceId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "ext" TEXT NOT NULL,
    "size" BIGINT,
    "schemaVersion" "LocalStoreSchemaVersion" NOT NULL DEFAULT 'v1_0',
    "embeddingModel" TEXT NOT NULL DEFAULT 'voyage-context-3',
    "embeddingDim" INTEGER NOT NULL DEFAULT 1024,
    "hasVisualMedia" BOOLEAN NOT NULL DEFAULT false,
    "visualMediaHint" "VisualMediaHint",
    "pageCount" INTEGER,
    "extractedTextLength" INTEGER,
    "imageCount" INTEGER,
    "modelSelectionReason" TEXT,
    "indexedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "lastAccessed" TIMESTAMP(3),
    "state" "LocalStoreDocState" NOT NULL DEFAULT 'PENDING',
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalVectorStoreDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalVectorStoreDocChunk" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "chunkProvenanceId" TEXT NOT NULL,
    "provenanceId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "embedding" vector(1024) NOT NULL,
    "schemaVersion" "LocalStoreSchemaVersion" NOT NULL DEFAULT 'v1_0',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalVectorStoreDocChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMemoryStore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "embeddingModel" TEXT NOT NULL DEFAULT 'voyage-context-3',
    "embeddingDim" INTEGER NOT NULL DEFAULT 1024,
    "totalChunks" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "totalConversations" INTEGER NOT NULL DEFAULT 0,
    "schemaVersion" "MemorySchemaVersion" NOT NULL DEFAULT 'v1_0',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationMemoryStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMemoryContext" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "schemaVersion" "MemorySchemaVersion" NOT NULL DEFAULT 'v1_0',
    "conversationTitle" TEXT,
    "firstMessageAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "rollingSummary" TEXT,
    "rollingSummaryModel" TEXT,
    "rollingSummaryProvider" "Provider",
    "rollingSummaryTokens" INTEGER NOT NULL DEFAULT 0,
    "rollingSummaryUpdatedAt" TIMESTAMP(3),
    "lastChunkedMessageId" TEXT,
    "lastChunkedMessageIndex" INTEGER,
    "lastChunkedAt" TIMESTAMP(3),
    "totalTurns" INTEGER NOT NULL DEFAULT 0,
    "chunkedTurns" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "modelsUsedRaw" TEXT,
    "providersUsed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hasMultipleProviders" BOOLEAN NOT NULL DEFAULT false,
    "hasMultipleModels" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ConversationMemoryContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocalVectorStore_provider_storeName_idx" ON "LocalVectorStore"("provider", "storeName");

-- CreateIndex
CREATE UNIQUE INDEX "LocalVectorStore_userId_provider_key" ON "LocalVectorStore"("userId", "provider");

-- CreateIndex
CREATE INDEX "LocalVectorStoreDoc_storeId_state_idx" ON "LocalVectorStoreDoc"("storeId", "state");

-- CreateIndex
CREATE INDEX "LocalVectorStoreDoc_storeId_embeddingModel_idx" ON "LocalVectorStoreDoc"("storeId", "embeddingModel");

-- CreateIndex
CREATE INDEX "LocalVectorStoreDoc_provenanceId_idx" ON "LocalVectorStoreDoc"("provenanceId");

-- CreateIndex
CREATE INDEX "LocalVectorStoreDoc_attachmentId_idx" ON "LocalVectorStoreDoc"("attachmentId");

-- CreateIndex
CREATE INDEX "LocalVectorStoreDoc_conversationId_idx" ON "LocalVectorStoreDoc"("conversationId");

-- CreateIndex
CREATE INDEX "LocalVectorStoreDoc_hasVisualMedia_idx" ON "LocalVectorStoreDoc"("hasVisualMedia");

-- CreateIndex
CREATE INDEX "LocalVectorStoreDoc_schemaVersion_idx" ON "LocalVectorStoreDoc"("schemaVersion");

-- CreateIndex
CREATE UNIQUE INDEX "LocalVectorStoreDoc_storeId_provenanceId_key" ON "LocalVectorStoreDoc"("storeId", "provenanceId");

-- CreateIndex
CREATE INDEX "LocalVectorStoreDocChunk_docId_idx" ON "LocalVectorStoreDocChunk"("docId");

-- CreateIndex
CREATE INDEX "LocalVectorStoreDocChunk_storeId_idx" ON "LocalVectorStoreDocChunk"("storeId");

-- CreateIndex
CREATE INDEX "LocalVectorStoreDocChunk_attachmentId_idx" ON "LocalVectorStoreDocChunk"("attachmentId");

-- CreateIndex
CREATE INDEX "LocalVectorStoreDocChunk_conversationId_messageId_idx" ON "LocalVectorStoreDocChunk"("conversationId", "messageId");

-- CreateIndex
CREATE INDEX "LocalVectorStoreDocChunk_contentHash_idx" ON "LocalVectorStoreDocChunk"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "LocalVectorStoreDocChunk_docId_chunkIndex_schemaVersion_key" ON "LocalVectorStoreDocChunk"("docId", "chunkIndex", "schemaVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMemoryStore_userId_key" ON "ConversationMemoryStore"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMemoryContext_conversationId_key" ON "ConversationMemoryContext"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationMemoryContext_storeId_idx" ON "ConversationMemoryContext"("storeId");

-- CreateIndex
CREATE INDEX "ConversationMemoryContext_lastChunkedAt_idx" ON "ConversationMemoryContext"("lastChunkedAt");

-- CreateIndex
CREATE INDEX "Attachment_assetType_idx" ON "Attachment"("assetType");

-- CreateIndex
CREATE INDEX "ConversationMemoryChunk_contextId_idx" ON "ConversationMemoryChunk"("contextId");

-- CreateIndex
CREATE INDEX "ConversationMemoryChunk_storeId_idx" ON "ConversationMemoryChunk"("storeId");

-- CreateIndex
CREATE INDEX "ConversationMemoryChunk_conversationId_chunkIndex_idx" ON "ConversationMemoryChunk"("conversationId", "chunkIndex");

-- CreateIndex
CREATE INDEX "ConversationMemoryChunk_chunkingState_idx" ON "ConversationMemoryChunk"("chunkingState");

-- CreateIndex
CREATE INDEX "ConversationMemoryChunk_contentHash_idx" ON "ConversationMemoryChunk"("contentHash");

-- CreateIndex
CREATE INDEX "ConversationMemoryChunk_embeddedAt_idx" ON "ConversationMemoryChunk"("embeddedAt");

-- AddForeignKey
ALTER TABLE "LocalVectorStore" ADD CONSTRAINT "LocalVectorStore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalVectorStoreDoc" ADD CONSTRAINT "LocalVectorStoreDoc_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "LocalVectorStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalVectorStoreDoc" ADD CONSTRAINT "LocalVectorStoreDoc_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalVectorStoreDocChunk" ADD CONSTRAINT "LocalVectorStoreDocChunk_docId_fkey" FOREIGN KEY ("docId") REFERENCES "LocalVectorStoreDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMemoryStore" ADD CONSTRAINT "ConversationMemoryStore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMemoryContext" ADD CONSTRAINT "ConversationMemoryContext_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "ConversationMemoryStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMemoryContext" ADD CONSTRAINT "ConversationMemoryContext_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMemoryChunk" ADD CONSTRAINT "ConversationMemoryChunk_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "ConversationMemoryContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationMemoryChunkId_fkey" FOREIGN KEY ("conversationMemoryChunkId") REFERENCES "ConversationMemoryChunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "AnnotSubtype" AS ENUM ('LINK', 'TEXT', 'HIGHLIGHT', 'WIDGET', 'MARKUP', 'REFERENCE', 'AUTOLINK');

-- CreateEnum
CREATE TYPE "VisualMediaContent" AS ENUM ('PHOTOS', 'CHARTS', 'DIAGRAMS', 'SLIDES', 'TABLES', 'VIDEO', 'MIXED', 'AUDIO');

-- CreateEnum
CREATE TYPE "VisualMediaSource" AS ENUM ('NATIVE', 'SCANNED', 'MIXED');

-- CreateEnum
CREATE TYPE "UserStoreDocState" AS ENUM ('QUEUED', 'EXTRACTING', 'INDEXING', 'ACTIVE', 'REINDEXING', 'FAILED');

-- CreateEnum
CREATE TYPE "UserStoreChunkState" AS ENUM ('QUEUED', 'EMBEDDING', 'READY', 'ERROR', 'RETRYING', 'ABANDONED');

-- CreateEnum
CREATE TYPE "UserStoreSchemaVersion" AS ENUM ('v1_0');

-- CreateTable
CREATE TABLE "UserStore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "defaultEmbeddingModel" TEXT NOT NULL DEFAULT 'voyage-multimodal-3.5',
    "defaultEmbeddingDim" INTEGER NOT NULL DEFAULT 1024,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "totalBytes" BIGINT,
    "totalChunks" INTEGER NOT NULL DEFAULT 0,
    "schemaVersion" "UserStoreSchemaVersion" NOT NULL DEFAULT 'v1_0',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStoreDoc" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "originatingUrl" TEXT NOT NULL,
    "originatingModel" TEXT NOT NULL,
    "originatingProvider" "Provider" NOT NULL,
    "provenanceId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "ext" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "schemaVersion" "UserStoreSchemaVersion" NOT NULL DEFAULT 'v1_0',
    "embeddingModel" TEXT NOT NULL DEFAULT 'voyage-multimodal-3.5',
    "embeddingDim" INTEGER NOT NULL DEFAULT 1024,
    "hasVisualMedia" BOOLEAN NOT NULL DEFAULT false,
    "visualMediaSource" "VisualMediaSource",
    "visualMediaContent" "VisualMediaContent",
    "pageCount" INTEGER,
    "extractedTextLength" INTEGER,
    "imageCount" INTEGER,
    "imagePages" TEXT,
    "annotPages" TEXT,
    "modelSelectionReason" TEXT,
    "indexedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "lastAccessed" TIMESTAMP(3),
    "state" "UserStoreDocState" NOT NULL DEFAULT 'QUEUED',
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStoreDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStoreDocAnnot" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "subtype" "AnnotSubtype" NOT NULL,
    "uri" TEXT NOT NULL,
    "rect" DOUBLE PRECISION[],
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "pageNumber" INTEGER,
    "isCdnLink" BOOLEAN NOT NULL DEFAULT false,
    "linkedDocId" TEXT,
    "attachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStoreDocAnnot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStoreDocChunk" (
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
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "pageStartOffset" INTEGER,
    "pageEndOffset" INTEGER,
    "hasVisualContent" BOOLEAN NOT NULL,
    "state" "UserStoreChunkState" NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "embedding" vector(1024),
    "schemaVersion" "UserStoreSchemaVersion" NOT NULL DEFAULT 'v1_0',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStoreDocChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserStore_userId_key" ON "UserStore"("userId");

-- CreateIndex
CREATE INDEX "UserStore_userId_storeName_idx" ON "UserStore"("userId", "storeName");

-- CreateIndex
CREATE UNIQUE INDEX "UserStore_userId_storeName_key" ON "UserStore"("userId", "storeName");

-- CreateIndex
CREATE UNIQUE INDEX "UserStoreDoc_attachmentId_key" ON "UserStoreDoc"("attachmentId");

-- CreateIndex
CREATE INDEX "UserStoreDoc_originatingModel_originatingProvider_idx" ON "UserStoreDoc"("originatingModel", "originatingProvider");

-- CreateIndex
CREATE INDEX "UserStoreDoc_storeId_state_idx" ON "UserStoreDoc"("storeId", "state");

-- CreateIndex
CREATE INDEX "UserStoreDoc_storeId_embeddingModel_idx" ON "UserStoreDoc"("storeId", "embeddingModel");

-- CreateIndex
CREATE INDEX "UserStoreDoc_provenanceId_idx" ON "UserStoreDoc"("provenanceId");

-- CreateIndex
CREATE INDEX "UserStoreDoc_attachmentId_idx" ON "UserStoreDoc"("attachmentId");

-- CreateIndex
CREATE INDEX "UserStoreDoc_messageId_idx" ON "UserStoreDoc"("messageId");

-- CreateIndex
CREATE INDEX "UserStoreDoc_conversationId_idx" ON "UserStoreDoc"("conversationId");

-- CreateIndex
CREATE INDEX "UserStoreDoc_hasVisualMedia_idx" ON "UserStoreDoc"("hasVisualMedia");

-- CreateIndex
CREATE INDEX "UserStoreDoc_schemaVersion_idx" ON "UserStoreDoc"("schemaVersion");

-- CreateIndex
CREATE INDEX "UserStoreDocAnnot_docId_idx" ON "UserStoreDocAnnot"("docId");

-- CreateIndex
CREATE INDEX "UserStoreDocAnnot_linkedDocId_idx" ON "UserStoreDocAnnot"("linkedDocId");

-- CreateIndex
CREATE INDEX "UserStoreDocAnnot_isCdnLink_idx" ON "UserStoreDocAnnot"("isCdnLink");

-- CreateIndex
CREATE INDEX "UserStoreDocChunk_docId_idx" ON "UserStoreDocChunk"("docId");

-- CreateIndex
CREATE INDEX "UserStoreDocChunk_storeId_idx" ON "UserStoreDocChunk"("storeId");

-- CreateIndex
CREATE INDEX "UserStoreDocChunk_attachmentId_idx" ON "UserStoreDocChunk"("attachmentId");

-- CreateIndex
CREATE INDEX "UserStoreDocChunk_conversationId_messageId_idx" ON "UserStoreDocChunk"("conversationId", "messageId");

-- CreateIndex
CREATE INDEX "UserStoreDocChunk_contentHash_idx" ON "UserStoreDocChunk"("contentHash");

-- CreateIndex
CREATE INDEX "UserStoreDocChunk_state_idx" ON "UserStoreDocChunk"("state");

-- CreateIndex
CREATE INDEX "UserStoreDocChunk_docId_state_idx" ON "UserStoreDocChunk"("docId", "state");

-- HNSW index on UserStoreDocChunk (replaces Prisma placeholder)
CREATE INDEX IF NOT EXISTS idx_user_store_doc_chunk_embedding_hnsw
ON "UserStoreDocChunk" USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Partial index for store-scoped search (replaces Prisma placeholder)
CREATE INDEX IF NOT EXISTS idx_user_store_doc_chunk_store_active
ON "UserStoreDocChunk" ("storeId")
WHERE embedding IS NOT NULL AND "deletedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UserStoreDocChunk_docId_chunkIndex_schemaVersion_key" ON "UserStoreDocChunk"("docId", "chunkIndex", "schemaVersion");

-- CreateIndex
CREATE INDEX "Attachment_cdnUrl_idx" ON "Attachment"("cdnUrl");

-- CreateIndex
CREATE INDEX "Attachment_compatCdnUrl_idx" ON "Attachment"("compatCdnUrl");

-- AddForeignKey
ALTER TABLE "UserStore" ADD CONSTRAINT "UserStore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStoreDoc" ADD CONSTRAINT "UserStoreDoc_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "UserStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStoreDoc" ADD CONSTRAINT "UserStoreDoc_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStoreDocAnnot" ADD CONSTRAINT "UserStoreDocAnnot_docId_fkey" FOREIGN KEY ("docId") REFERENCES "UserStoreDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStoreDocAnnot" ADD CONSTRAINT "UserStoreDocAnnot_linkedDocId_fkey" FOREIGN KEY ("linkedDocId") REFERENCES "UserStoreDoc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStoreDocChunk" ADD CONSTRAINT "UserStoreDocChunk_docId_fkey" FOREIGN KEY ("docId") REFERENCES "UserStoreDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

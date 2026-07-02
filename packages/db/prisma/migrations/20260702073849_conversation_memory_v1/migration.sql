/*
  Warnings:

  - You are about to drop the column `messageIdsRaw` on the `ConversationMemoryChunk` table. All the data in the column will be lost.
  - You are about to drop the column `lastChunkedMessageId` on the `ConversationMemoryContext` table. All the data in the column will be lost.
  - You are about to drop the column `lastChunkedMessageIndex` on the `ConversationMemoryContext` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[conversationId,ordinalStart,ordinalEndExclusive,schemaVersion]` on the table `ConversationMemoryChunk` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[contextId,chunkIndex,schemaVersion]` on the table `ConversationMemoryChunk` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `ordinalEndExclusive` to the `ConversationMemoryChunk` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ordinalStart` to the `ConversationMemoryChunk` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MemorySummaryState" AS ENUM ('QUEUED', 'SUMMARIZING', 'READY', 'ERROR', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MemoryTranscriptRendererVersion" AS ENUM ('v1_0');

-- AlterEnum
-- BEFORE 'TOKEN_LIMIT' keeps DB enum order aligned with the schema declaration order.
ALTER TYPE "MemoryChunkBoundaryReason" ADD VALUE 'MESSAGE_COUNT' BEFORE 'TOKEN_LIMIT';

-- DropIndex
DROP INDEX "ConversationMemoryChunk_conversationId_chunkIndex_idx";

-- DropIndex
DROP INDEX "ConversationMemoryChunk_conversationId_idx";

-- DropIndex
DROP INDEX "ConversationMemoryChunk_messageIdStart_messageIdEnd_idx";

-- AlterTable
ALTER TABLE "ConversationMemoryChunk" DROP COLUMN "messageIdsRaw",
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "embeddingDim" INTEGER NOT NULL DEFAULT 1024,
ADD COLUMN     "ordinalEndExclusive" INTEGER NOT NULL,
ADD COLUMN     "ordinalStart" INTEGER NOT NULL,
ADD COLUMN     "rendererVersion" "MemoryTranscriptRendererVersion" NOT NULL DEFAULT 'v1_0',
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "searchTsv" tsvector,
ADD COLUMN     "summaryError" TEXT,
ADD COLUMN     "summaryPromptVersion" TEXT,
ADD COLUMN     "summaryRetryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "summaryState" "MemorySummaryState" NOT NULL DEFAULT 'QUEUED',
ADD COLUMN     "summaryTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "transcriptIncludesThinking" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "embeddingModel" SET DEFAULT 'voyage-context-4',
ALTER COLUMN "embedding" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ConversationMemoryContext" DROP COLUMN "lastChunkedMessageId",
DROP COLUMN "lastChunkedMessageIndex",
ADD COLUMN     "lastIndexedOrdinalExclusive" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ConversationMemoryStore" ALTER COLUMN "embeddingModel" SET DEFAULT 'voyage-context-4';

-- CreateIndex
CREATE INDEX "ConversationMemoryChunk_conversationId_ordinalStart_idx" ON "ConversationMemoryChunk"("conversationId", "ordinalStart");

-- CreateIndex
CREATE INDEX "ConversationMemoryChunk_conversationId_ordinalEndExclusive_idx" ON "ConversationMemoryChunk"("conversationId", "ordinalEndExclusive");

-- CreateIndex
CREATE INDEX "ConversationMemoryChunk_summaryState_idx" ON "ConversationMemoryChunk"("summaryState");

-- CreateIndex
CREATE INDEX "idx_memory_chunk_search_tsv" ON "ConversationMemoryChunk" USING GIN ("searchTsv");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMemoryChunk_conversationId_ordinalStart_ordinal_key" ON "ConversationMemoryChunk"("conversationId", "ordinalStart", "ordinalEndExclusive", "schemaVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMemoryChunk_contextId_chunkIndex_schemaVersion_key" ON "ConversationMemoryChunk"("contextId", "chunkIndex", "schemaVersion");

-- Restore the partial indexes dropped by 20260213034322 (Prisma diff artifact) with the
-- deletedAt guard added; the plain full-btree twins are superseded by the partial
-- definitions (a rename alone would keep the right name on the wrong definition).
DROP INDEX IF EXISTS "ConversationMemoryChunk_contextId_idx";
DROP INDEX IF EXISTS "ConversationMemoryChunk_storeId_idx";
DROP INDEX IF EXISTS "idx_memory_chunk_context_indexed";
DROP INDEX IF EXISTS "idx_memory_chunk_store_indexed";

CREATE INDEX IF NOT EXISTS "idx_memory_chunk_store_indexed"
  ON "ConversationMemoryChunk" ("storeId")
  WHERE embedding IS NOT NULL AND "chunkingState" = 'INDEXED' AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_memory_chunk_context_indexed"
  ON "ConversationMemoryChunk" ("contextId")
  WHERE embedding IS NOT NULL AND "chunkingState" = 'INDEXED' AND "deletedAt" IS NULL;

-- Weighted composite tsvector: summary keyword hits (A) outrank incidental transcript
-- hits (B). Recomputed only when transcriptMarkdown or summary appear in an UPDATE's SET
-- list — state/retry/embedding transitions never touch it (same discipline as
-- trg_user_store_chunk_tsv, 20260311035622). NEW carries the full row, so a summary-only
-- UPDATE recomputes correctly against the existing transcript.
CREATE OR REPLACE FUNCTION conversation_memory_chunk_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW."searchTsv" :=
    setweight(to_tsvector('english', COALESCE(NEW."summary", '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW."transcriptMarkdown", '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_memory_chunk_search_tsv
  BEFORE INSERT OR UPDATE OF "transcriptMarkdown", "summary" ON "ConversationMemoryChunk"
  FOR EACH ROW
  EXECUTE FUNCTION conversation_memory_chunk_tsv_trigger();

-- Belt-and-suspenders: the watermark CAS makes overlapping ordinal ranges impossible by
-- construction; this constraint makes the database prove it. int4range() defaults to
-- inclusive-exclusive [start, end) — an exact match for the ordinal semantics.
-- ON CONFLICT DO NOTHING remains legal against exclusion constraints (DO UPDATE is not).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "ConversationMemoryChunk"
  ADD CONSTRAINT memory_chunk_no_range_overlap
  EXCLUDE USING gist (
    "conversationId" WITH =,
    "schemaVersion" WITH =,
    int4range("ordinalStart", "ordinalEndExclusive") WITH &&
  ) WHERE ("deletedAt" IS NULL);

/*
  Warnings:

  - You are about to drop the column `embedding` on the `ConversationMemoryChunk` table. All the data in the column will be lost.
  - You are about to drop the column `embedding` on the `ProviderStoreDocumentChunk` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "idx_memory_chunk_embedding";

-- DropIndex
DROP INDEX "idx_doc_chunk_embedding";

-- AlterTable
ALTER TABLE "ConversationMemoryChunk" DROP COLUMN "embedding";

-- AlterTable
ALTER TABLE "ProviderStoreDocumentChunk" DROP COLUMN "embedding";

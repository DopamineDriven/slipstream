/*
  Warnings:

  - Added the required column `embedding` to the `ConversationMemoryChunk` table without a default value. This is not possible if the table is not empty.
  - Added the required column `embedding` to the `ProviderStoreDocumentChunk` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ConversationMemoryChunk" ADD COLUMN     "embedding" vector(1024) NOT NULL;

-- AlterTable
ALTER TABLE "ProviderStoreDocumentChunk" ADD COLUMN     "embedding" vector(1024) NOT NULL;

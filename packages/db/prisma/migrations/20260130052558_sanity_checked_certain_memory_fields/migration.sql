/*
  Warnings:

  - You are about to drop the column `modelsInChunkRaw` on the `ConversationMemoryChunk` table. All the data in the column will be lost.
  - You are about to drop the column `providersInChunkRaw` on the `ConversationMemoryChunk` table. All the data in the column will be lost.
  - You are about to drop the column `totalThinkingDurationMs` on the `ConversationMemoryChunk` table. All the data in the column will be lost.
  - You are about to drop the column `modelsUsedRaw` on the `ConversationMemoryContext` table. All the data in the column will be lost.
  - You are about to drop the column `providersUsed` on the `ConversationMemoryContext` table. All the data in the column will be lost.
  - Added the required column `providerModelsRaw` to the `ConversationMemoryChunk` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ConversationMemoryChunk" DROP COLUMN "modelsInChunkRaw",
DROP COLUMN "providersInChunkRaw",
DROP COLUMN "totalThinkingDurationMs",
ADD COLUMN     "providerModelsRaw" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ConversationMemoryContext" DROP COLUMN "modelsUsedRaw",
DROP COLUMN "providersUsed",
ADD COLUMN     "contributingProviderModelsRaw" TEXT;

-- AlterTable
ALTER TABLE "ConversationMemoryStore" ALTER COLUMN "totalTokens" SET DATA TYPE BIGINT;

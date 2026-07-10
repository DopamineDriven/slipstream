/*
  Warnings:

  - The `summaryPromptVersion` column on the `ConversationMemoryChunk` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "MemoryChunkSummaryPromptVersion" AS ENUM ('v1_0');

-- CreateEnum
CREATE TYPE "MemoryRollingSummaryReasoningVersion" AS ENUM ('v1_0');

-- AlterTable
ALTER TABLE "ConversationMemoryChunk" ADD COLUMN     "summaryReasoningDuration" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "summaryReasoningText" TEXT,
ADD COLUMN     "summaryToolUseRaw" TEXT,
DROP COLUMN "summaryPromptVersion",
ADD COLUMN     "summaryPromptVersion" "MemoryChunkSummaryPromptVersion" NOT NULL DEFAULT 'v1_0';

-- AlterTable
ALTER TABLE "ConversationMemoryContext" ADD COLUMN     "rollingSummaryReasoningDuration" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rollingSummaryReasoningText" TEXT,
ADD COLUMN     "rollingSummaryReasoningToolUseRaw" TEXT,
ADD COLUMN     "rollingSummaryReasoningVersion" "MemoryRollingSummaryReasoningVersion" NOT NULL DEFAULT 'v1_0',
ADD COLUMN     "rollingSummaryState" "MemorySummaryState" NOT NULL DEFAULT 'QUEUED';

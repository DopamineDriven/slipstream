-- CreateEnum
CREATE TYPE "ReasoningEffort" AS ENUM ('minimal', 'low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "OutputVerbosity" AS ENUM ('low', 'medium', 'high');

-- AlterTable
ALTER TABLE "ConversationSettings" ADD COLUMN     "outputVerbosity" "OutputVerbosity",
ADD COLUMN     "reasoningEffort" "ReasoningEffort";

/*
  Warnings:

  - You are about to drop the column `aiAgentId` on the `Conversation` table. All the data in the column will be lost.
  - You are about to drop the column `aiAgentId` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `apiKey` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the `AiAgent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserKey` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_aiAgentId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_userKeyId_fkey";

-- DropForeignKey
ALTER TABLE "UserKey" DROP CONSTRAINT "UserKey_userId_fkey";

-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "aiAgentId";

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "aiAgentId",
DROP COLUMN "apiKey";

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "defaultModel" TEXT,
ADD COLUMN     "defaultProvider" "Provider";

-- DropTable
DROP TABLE "AiAgent";

-- DropTable
DROP TABLE "UserKey";

-- CreateTable
CREATE TABLE "UserApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "apiKey" VARCHAR(255) NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSettings" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "systemPrompt" TEXT,
    "temperature" DOUBLE PRECISION DEFAULT 1.0,
    "topP" DOUBLE PRECISION DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserApiKey_userId_provider_idx" ON "UserApiKey"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSettings_conversationId_key" ON "ConversationSettings"("conversationId");

-- AddForeignKey
ALTER TABLE "UserApiKey" ADD CONSTRAINT "UserApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSettings" ADD CONSTRAINT "ConversationSettings_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userKeyId_fkey" FOREIGN KEY ("userKeyId") REFERENCES "UserApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

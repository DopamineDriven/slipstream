-- CreateEnum
CREATE TYPE "MessageBlockType" AS ENUM ('ENCRYPTED_THINKING', 'THINKING', 'TEXT');

-- CreateTable
CREATE TABLE "MessageBlock" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "type" "MessageBlockType" NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageBlock_messageId_ordinal_idx" ON "MessageBlock"("messageId", "ordinal");

-- CreateIndex
CREATE INDEX "MessageBlock_conversationId_idx" ON "MessageBlock"("conversationId");

-- CreateIndex
CREATE INDEX "MessageBlock_type_idx" ON "MessageBlock"("type");

-- CreateIndex
CREATE UNIQUE INDEX "MessageBlock_messageId_ordinal_key" ON "MessageBlock"("messageId", "ordinal");

-- AddForeignKey
ALTER TABLE "MessageBlock" ADD CONSTRAINT "MessageBlock_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

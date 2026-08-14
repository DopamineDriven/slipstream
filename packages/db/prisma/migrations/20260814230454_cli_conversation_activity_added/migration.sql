-- CreateTable
CREATE TABLE "CliConversationActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "lastActiveAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CliConversationActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CliConversationActivity_userId_lastActiveAt_idx" ON "CliConversationActivity"("userId", "lastActiveAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CliConversationActivity_userId_conversationId_key" ON "CliConversationActivity"("userId", "conversationId");

-- AddForeignKey
ALTER TABLE "CliConversationActivity" ADD CONSTRAINT "CliConversationActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CliConversationActivity" ADD CONSTRAINT "CliConversationActivity_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

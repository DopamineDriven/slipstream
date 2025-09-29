/*
  Warnings:

  - A unique constraint covering the columns `[bucket,key,conversationId]` on the table `Attachment` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."Attachment_bucket_key_key";

-- DropIndex
DROP INDEX "public"."Attachment_conversationId_createdAt_idx";

-- DropIndex
DROP INDEX "public"."Attachment_messageId_idx";

-- CreateIndex
CREATE INDEX "Attachment_messageId_createdAt_idx" ON "public"."Attachment"("messageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_bucket_key_conversationId_key" ON "public"."Attachment"("bucket", "key", "conversationId");

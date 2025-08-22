-- DropIndex
DROP INDEX "public"."Attachment_bucket_key_idx";

-- DropIndex
DROP INDEX "public"."Attachment_conversationId_idx";

-- DropIndex
DROP INDEX "public"."Attachment_deletedAt_idx";

-- DropIndex
DROP INDEX "public"."Attachment_messageId_createdAt_idx";

-- DropIndex
DROP INDEX "public"."Attachment_status_createdAt_idx";

-- AlterTable
ALTER TABLE "public"."Attachment" ADD COLUMN     "draftId" TEXT,
ALTER COLUMN "conversationId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Attachment_conversationId_createdAt_idx" ON "public"."Attachment"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_draftId_idx" ON "public"."Attachment"("draftId");

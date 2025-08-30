-- AlterTable
ALTER TABLE "public"."Attachment" ADD COLUMN     "batchId" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_batchId_conversationId_idx" ON "public"."Attachment"("batchId", "conversationId");

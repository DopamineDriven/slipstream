-- AlterEnum
ALTER TYPE "MessageBlockType" ADD VALUE 'IMAGE_GEN';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "messageBlockId" TEXT;

-- CreateTable
CREATE TABLE "InlineImageGenOutput" (
    "id" TEXT NOT NULL,
    "kind" "ImageGenOutputKind" NOT NULL DEFAULT 'FINAL',
    "provider" "Provider" NOT NULL,
    "facilitatingModel" TEXT NOT NULL,
    "generatingModel" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "seriesOrdinal" INTEGER NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "ext" TEXT NOT NULL,
    "revisedPrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InlineImageGenOutput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InlineImageGenOutput_attachmentId_key" ON "InlineImageGenOutput"("attachmentId");

-- CreateIndex
CREATE INDEX "InlineImageGenOutput_provider_facilitatingModel_generatingM_idx" ON "InlineImageGenOutput"("provider", "facilitatingModel", "generatingModel");

-- CreateIndex
CREATE INDEX "InlineImageGenOutput_createdAt_idx" ON "InlineImageGenOutput"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InlineImageGenOutput_seriesId_seriesOrdinal_key" ON "InlineImageGenOutput"("seriesId", "seriesOrdinal");

-- CreateIndex
CREATE INDEX "Attachment_messageBlockId_idx" ON "Attachment"("messageBlockId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageBlockId_fkey" FOREIGN KEY ("messageBlockId") REFERENCES "MessageBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InlineImageGenOutput" ADD CONSTRAINT "InlineImageGenOutput_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

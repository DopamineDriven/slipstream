-- AlterTable
ALTER TABLE "AttachmentProvider" ADD COLUMN     "containerRef" TEXT;

-- CreateIndex
CREATE INDEX "AttachmentProvider_containerRef_provider_idx" ON "AttachmentProvider"("containerRef", "provider");

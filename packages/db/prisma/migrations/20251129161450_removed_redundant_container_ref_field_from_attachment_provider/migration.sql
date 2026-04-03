/*
  Warnings:

  - You are about to drop the column `containerRef` on the `AttachmentProvider` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "AttachmentProvider_containerRef_provider_idx";

-- AlterTable
ALTER TABLE "AttachmentProvider" DROP COLUMN "containerRef";

-- CreateIndex
CREATE INDEX "AttachmentProvider_storeId_provider_idx" ON "AttachmentProvider"("storeId", "provider");

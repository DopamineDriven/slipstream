/*
  Warnings:

  - You are about to drop the column `storeId` on the `AttachmentProvider` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "AttachmentProvider" DROP CONSTRAINT "AttachmentProvider_storeId_fkey";

-- DropIndex
DROP INDEX "AttachmentProvider_storeId_provider_idx";

-- AlterTable
ALTER TABLE "AttachmentProvider" DROP COLUMN "storeId",
ADD COLUMN     "indexedStoreRefs" TEXT[] DEFAULT ARRAY[]::TEXT[];

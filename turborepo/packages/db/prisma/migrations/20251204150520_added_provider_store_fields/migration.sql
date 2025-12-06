/*
  Warnings:

  - You are about to drop the column `providerCreatedAt` on the `ProviderStore` table. All the data in the column will be lost.
  - Added the required column `storeName` to the `ProviderStore` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ProviderStore" DROP COLUMN "providerCreatedAt",
ADD COLUMN     "providerStoreCreatedAt" TIMESTAMP(3),
ADD COLUMN     "storeName" TEXT NOT NULL,
ALTER COLUMN "totalBytes" DROP NOT NULL,
ALTER COLUMN "totalBytes" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "ProviderStore_storeRef_provider_idx" ON "ProviderStore"("storeRef", "provider");

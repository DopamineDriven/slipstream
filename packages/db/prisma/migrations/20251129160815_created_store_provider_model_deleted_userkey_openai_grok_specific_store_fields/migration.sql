/*
  Warnings:

  - You are about to drop the column `grokCollectionId` on the `UserApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `openAiVectorStoreId` on the `UserApiKey` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AttachmentProvider" ADD COLUMN     "storeId" TEXT;

-- AlterTable
ALTER TABLE "UserApiKey" DROP COLUMN "grokCollectionId",
DROP COLUMN "openAiVectorStoreId";

-- CreateTable
CREATE TABLE "ProviderStore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "storeRef" TEXT NOT NULL,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "totalBytes" BIGINT NOT NULL DEFAULT 0,
    "providerCreatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderStore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderStore_userId_provider_key" ON "ProviderStore"("userId", "provider");

-- AddForeignKey
ALTER TABLE "ProviderStore" ADD CONSTRAINT "ProviderStore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentProvider" ADD CONSTRAINT "AttachmentProvider_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "ProviderStore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

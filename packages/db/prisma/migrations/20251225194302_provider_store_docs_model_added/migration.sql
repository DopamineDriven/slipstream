-- CreateEnum
CREATE TYPE "ProviderDocState" AS ENUM ('PENDING', 'PROCESSING', 'ACTIVE', 'FAILED');

-- CreateTable
CREATE TABLE "ProviderStoreDocument" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "docRef" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "state" "ProviderDocState" NOT NULL DEFAULT 'PENDING',
    "indexedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "lastAccessed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderStoreDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderStoreDocument_storeId_state_idx" ON "ProviderStoreDocument"("storeId", "state");

-- CreateIndex
CREATE INDEX "ProviderStoreDocument_attachmentId_idx" ON "ProviderStoreDocument"("attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderStoreDocument_storeId_attachmentId_key" ON "ProviderStoreDocument"("storeId", "attachmentId");

-- AddForeignKey
ALTER TABLE "ProviderStoreDocument" ADD CONSTRAINT "ProviderStoreDocument_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "ProviderStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderStoreDocument" ADD CONSTRAINT "ProviderStoreDocument_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

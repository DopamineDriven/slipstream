-- CreateEnum
CREATE TYPE "public"."ProviderAssetState" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'FAILED', 'DELETED');

-- CreateTable
CREATE TABLE "public"."AttachmentProvider" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "provider" "public"."Provider" NOT NULL,
    "userKeyId" TEXT,
    "state" "public"."ProviderAssetState" NOT NULL DEFAULT 'PENDING',
    "providerUri" TEXT,
    "providerRef" TEXT,
    "mime" TEXT,
    "size" BIGINT,
    "readyAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttachmentProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttachmentProvider_attachmentId_provider_idx" ON "public"."AttachmentProvider"("attachmentId", "provider");

-- CreateIndex
CREATE INDEX "AttachmentProvider_provider_state_expiresAt_idx" ON "public"."AttachmentProvider"("provider", "state", "expiresAt");

-- CreateIndex
CREATE INDEX "Attachment_checksumSha256_idx" ON "public"."Attachment"("checksumSha256");

-- AddForeignKey
ALTER TABLE "public"."AttachmentProvider" ADD CONSTRAINT "AttachmentProvider_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "public"."Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AttachmentProvider" ADD CONSTRAINT "AttachmentProvider_userKeyId_fkey" FOREIGN KEY ("userKeyId") REFERENCES "public"."UserApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

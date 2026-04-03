-- CreateEnum
CREATE TYPE "public"."UploadMethod" AS ENUM ('PRESIGNED', 'SERVER', 'GENERATED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."AssetOrigin" ADD VALUE 'PASTED';
ALTER TYPE "public"."AssetOrigin" ADD VALUE 'SCREENSHOT';
ALTER TYPE "public"."AssetOrigin" ADD VALUE 'IMPORTED';
ALTER TYPE "public"."AssetOrigin" ADD VALUE 'SCRAPED';

-- AlterEnum
ALTER TYPE "public"."AssetStatus" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "public"."Attachment" ADD COLUMN     "cdnUrl" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "thumbnailKey" TEXT,
ADD COLUMN     "uploadDuration" INTEGER,
ADD COLUMN     "uploadMethod" "public"."UploadMethod" NOT NULL DEFAULT 'SERVER';

-- CreateIndex
CREATE INDEX "Attachment_messageId_idx" ON "public"."Attachment"("messageId");

-- CreateIndex
CREATE INDEX "Attachment_deletedAt_idx" ON "public"."Attachment"("deletedAt");

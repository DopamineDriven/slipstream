-- CreateEnum
CREATE TYPE "public"."CompatStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED', 'ALIASED');

-- AlterTable
ALTER TABLE "public"."Attachment" ADD COLUMN     "compatCdnUrl" TEXT,
ADD COLUMN     "compatExt" TEXT,
ADD COLUMN     "compatKey" TEXT,
ADD COLUMN     "compatMime" TEXT,
ADD COLUMN     "compatReadyAt" TIMESTAMP(3),
ADD COLUMN     "compatS3ObjectId" TEXT,
ADD COLUMN     "compatStatus" "public"."CompatStatus",
ADD COLUMN     "compatVersionId" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_compatStatus_idx" ON "public"."Attachment"("compatStatus");

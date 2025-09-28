/*
  Warnings:

  - You are about to alter the column `aspectRatio` on the `VideoMetadata` table. The data in that column could be lost. The data in that column will be cast from `Decimal(6,4)` to `DoublePrecision`.

*/
-- AlterTable
ALTER TABLE "public"."VideoMetadata" ALTER COLUMN "aspectRatio" DROP NOT NULL,
ALTER COLUMN "aspectRatio" SET DEFAULT 1.0,
ALTER COLUMN "aspectRatio" SET DATA TYPE DOUBLE PRECISION;

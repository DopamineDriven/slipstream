/*
  Warnings:

  - You are about to alter the column `gpsLat` on the `ImageMetadata` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,7)` to `DoublePrecision`.
  - You are about to alter the column `gpsLon` on the `ImageMetadata` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,7)` to `DoublePrecision`.
  - You are about to alter the column `frameRate` on the `VideoMetadata` table. The data in that column could be lost. The data in that column will be cast from `Decimal(5,2)` to `DoublePrecision`.

*/
-- AlterTable
ALTER TABLE "public"."ImageMetadata" ALTER COLUMN "gpsLat" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "gpsLon" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "public"."VideoMetadata" ALTER COLUMN "frameRate" SET DATA TYPE DOUBLE PRECISION;

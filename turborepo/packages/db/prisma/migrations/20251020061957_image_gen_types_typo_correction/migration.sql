/*
  Warnings:

  - You are about to drop the column `personGenertion` on the `ImageGenJob` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ImageGenJob" DROP COLUMN "personGenertion",
ADD COLUMN     "personGeneration" TEXT;

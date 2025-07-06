/*
  Warnings:

  - Added the required column `authTag` to the `UserApiKey` table without a default value. This is not possible if the table is not empty.
  - Added the required column `iv` to the `UserApiKey` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "UserApiKey" ADD COLUMN     "authTag" VARCHAR(32) NOT NULL,
ADD COLUMN     "iv" VARCHAR(32) NOT NULL,
ALTER COLUMN "apiKey" SET DATA TYPE VARCHAR(512);

/*
  Warnings:

  - You are about to drop the column `errorCode` on the `ProviderStoreDocument` table. All the data in the column will be lost.
  - Added the required column `mimeType` to the `ProviderStoreDocument` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ProviderStoreDocument" DROP COLUMN "errorCode",
ADD COLUMN     "docUri" TEXT,
ADD COLUMN     "mimeType" TEXT NOT NULL,
ADD COLUMN     "size" BIGINT NOT NULL DEFAULT 0;

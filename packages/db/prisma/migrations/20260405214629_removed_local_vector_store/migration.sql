/*
  Warnings:

  - You are about to drop the `LocalVectorStore` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LocalVectorStoreDoc` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LocalVectorStoreDocChunk` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "LocalVectorStore" DROP CONSTRAINT "LocalVectorStore_userId_fkey";

-- DropForeignKey
ALTER TABLE "LocalVectorStoreDoc" DROP CONSTRAINT "LocalVectorStoreDoc_attachmentId_fkey";

-- DropForeignKey
ALTER TABLE "LocalVectorStoreDoc" DROP CONSTRAINT "LocalVectorStoreDoc_storeId_fkey";

-- DropForeignKey
ALTER TABLE "LocalVectorStoreDocChunk" DROP CONSTRAINT "LocalVectorStoreDocChunk_docId_fkey";

-- DropTable
DROP TABLE "LocalVectorStore";

-- DropTable
DROP TABLE "LocalVectorStoreDoc";

-- DropTable
DROP TABLE "LocalVectorStoreDocChunk";

-- DropEnum
DROP TYPE "LocalStoreChunkState";

-- DropEnum
DROP TYPE "LocalStoreDocState";

-- DropEnum
DROP TYPE "LocalStoreSchemaVersion";

-- DropEnum
DROP TYPE "VisualMediaHint";

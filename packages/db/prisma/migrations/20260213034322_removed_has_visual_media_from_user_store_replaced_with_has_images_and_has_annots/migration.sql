/*
  Warnings:

  - You are about to drop the column `hasVisualContent` on the `UserStoreDocChunk` table. All the data in the column will be lost.
  - Added the required column `hasAnnots` to the `UserStoreDocChunk` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hasImages` to the `UserStoreDocChunk` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "idx_memory_chunk_context_indexed";

-- DropIndex
DROP INDEX "idx_memory_chunk_store_indexed";

-- DropIndex
DROP INDEX "idx_local_doc_chunk_store_active";

-- DropIndex
DROP INDEX "idx_user_store_doc_chunk_store_active";

-- AlterTable
ALTER TABLE "UserStoreDocChunk" DROP COLUMN "hasVisualContent",
ADD COLUMN     "hasAnnots" BOOLEAN NOT NULL,
ADD COLUMN     "hasImages" BOOLEAN NOT NULL;

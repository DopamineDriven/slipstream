-- CreateEnum
CREATE TYPE "LocalStoreChunkState" AS ENUM ('QUEUED', 'READY', 'ERROR');

-- AlterTable
ALTER TABLE "LocalVectorStoreDocChunk" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "state" "LocalStoreChunkState" NOT NULL DEFAULT 'QUEUED',
ALTER COLUMN "embedding" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "LocalVectorStoreDocChunk_state_idx" ON "LocalVectorStoreDocChunk"("state");

-- CreateIndex
CREATE INDEX "LocalVectorStoreDocChunk_docId_state_idx" ON "LocalVectorStoreDocChunk"("docId", "state");

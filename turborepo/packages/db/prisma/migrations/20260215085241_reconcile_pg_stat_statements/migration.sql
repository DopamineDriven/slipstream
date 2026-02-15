CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- AlterTable
ALTER TABLE "UserStoreDocChunk" ADD COLUMN     "embeddingModel" TEXT NOT NULL DEFAULT 'voyage-multimodal-3.5';

-- RenameIndex
ALTER INDEX "UserStoreDocChunk_storeId_idx" RENAME TO "idx_user_store_doc_chunk_store_active";
-- Restore the partial index dropped by 20260213034322 (Prisma diff artifact).
-- The plain full-btree twin is superseded by the partial definition.
DROP INDEX IF EXISTS "UserStoreDocChunk_storeId_idx";
DROP INDEX IF EXISTS "idx_user_store_doc_chunk_store_active";

CREATE INDEX IF NOT EXISTS "idx_user_store_doc_chunk_store_active"
  ON "UserStoreDocChunk" ("storeId")
  WHERE embedding IS NOT NULL AND "deletedAt" IS NULL;

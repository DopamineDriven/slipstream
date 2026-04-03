-- 1. Add nullable tsvector column (same pattern as embedding Unsupported)
ALTER TABLE "UserStoreDocChunk"
  ADD COLUMN "contentTsv" tsvector;

-- 2. GIN index for fast @@ lookups
CREATE INDEX idx_user_store_doc_chunk_content_tsv
  ON "UserStoreDocChunk" USING GIN ("contentTsv");

-- 3. Trigger to auto-maintain on INSERT or content UPDATE
-- Only fires when `content` changes — updateUserStoreChunkState.sql is unaffected
CREATE OR REPLACE FUNCTION user_store_chunk_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW."contentTsv" := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_store_chunk_tsv
  BEFORE INSERT OR UPDATE OF content ON "UserStoreDocChunk"
  FOR EACH ROW
  EXECUTE FUNCTION user_store_chunk_tsv_trigger();

-- NOTE: Backfill of existing rows is handled by a separate TypeScript script
-- (packages/db/scripts/backfill-tsvector.ts) that sanitizes null bytes before
-- calling to_tsvector. Run it after applying this migration.

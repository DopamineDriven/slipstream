-- @param {String} $1:chunkId
-- @param {String} $2:embedding

-- The ONLY path that sets INDEXED — updateMemoryChunkState.sql refuses that
-- transition, so an INDEXED row always carries a non-null embedding.
-- Does not touch transcriptMarkdown/summary, so the tsv trigger never fires here.
UPDATE "ConversationMemoryChunk"
SET
  embedding       = $2::vector,
  "embeddedAt"    = NOW(),
  "chunkingState" = 'INDEXED'::"MemoryChunkingState",
  "chunkingError" = NULL,
  "updatedAt"     = NOW()
WHERE id = $1
RETURNING id, "provenanceId", "chunkingState"::text as "chunkingState";

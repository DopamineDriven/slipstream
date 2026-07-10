-- @param {String} $1:chunkId
-- @param {MemoryChunkingState} $2:chunkingState
-- @param {String} $3:chunkingError?
-- @param {Boolean} $4:incrementRetry

-- Error/retry transitions only. INDEXED is owned exclusively by
-- updateMemoryChunkEmbedding.sql (embedding + embeddedAt land atomically with the
-- state there); this setter no-ops on an INDEXED request — zero rows returned is
-- the misuse signal.
UPDATE "ConversationMemoryChunk"
SET
  "chunkingState" = $2::"MemoryChunkingState",
  "chunkingError" = $3,
  "retryCount"    = "retryCount" + CASE WHEN $4 THEN 1 ELSE 0 END,
  "updatedAt"     = NOW()
WHERE id = $1
  AND $2::"MemoryChunkingState" <> 'INDEXED'::"MemoryChunkingState"
RETURNING id, "provenanceId", "chunkingState"::text as "chunkingState";

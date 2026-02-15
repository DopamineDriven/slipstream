-- @param {String} $1:chunkId
-- @param {MemoryChunkingState} $2:chunkingState
-- @param {String} $3:chunkingError?

UPDATE "ConversationMemoryChunk"
SET
  "chunkingState" = $2::"MemoryChunkingState",
  "chunkingError" = $3,
  "embeddedAt"    = CASE WHEN $2 = 'INDEXED' THEN NOW() ELSE "embeddedAt" END,
  "updatedAt"     = NOW()
WHERE id = $1
RETURNING id, "provenanceId", "chunkingState"::"text" as "chunkingState";

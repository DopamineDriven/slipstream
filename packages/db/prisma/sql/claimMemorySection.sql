-- @param {String} $1:conversationId
-- @param {Int} $2:expectedWatermark
-- @param {Int} $3:ordinalEndExclusive

-- Watermark CAS — the concurrency claim for a section. Zero rows returned means
-- another instance owns the chain (or our view is stale): stop the pass, never retry
-- in place. One row means the claim insert (insertMemoryChunk.sql) proceeds in the
-- SAME transaction. Sections chain from the watermark: expectedWatermark must equal
-- the section's ordinalStart, so overlaps and gaps are impossible by construction.
UPDATE "ConversationMemoryContext"
SET
  "lastIndexedOrdinalExclusive" = $3,
  "lastChunkedAt"               = NOW(),
  "updatedAt"                   = NOW()
WHERE "conversationId" = $1
  AND "lastIndexedOrdinalExclusive" = $2
RETURNING id, "storeId", "lastIndexedOrdinalExclusive";

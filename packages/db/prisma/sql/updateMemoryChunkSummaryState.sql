-- @param {String} $1:chunkId
-- @param {MemorySummaryState} $2:summaryState
-- @param {String} $3:summaryError?

-- Summary error/skip/in-flight transitions. READY is owned exclusively by
-- updateMemoryChunkSummary.sql (summary content + meta land atomically with the
-- state there); this setter no-ops on a READY request. Never lists summary or
-- transcriptMarkdown in SET, so the tsv trigger never fires here.
UPDATE "ConversationMemoryChunk"
SET
  "summaryState"      = $2::"MemorySummaryState",
  "summaryError"      = $3,
  "summaryRetryCount" = "summaryRetryCount"
    + CASE WHEN $2::"MemorySummaryState" = 'ERROR'::"MemorySummaryState" THEN 1 ELSE 0 END,
  "updatedAt"         = NOW()
WHERE id = $1
  AND $2::"MemorySummaryState" <> 'READY'::"MemorySummaryState"
RETURNING id, "provenanceId", "summaryState"::text as "summaryState";

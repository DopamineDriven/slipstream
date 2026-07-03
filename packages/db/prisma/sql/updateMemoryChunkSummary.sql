-- @param {String} $1:chunkId
-- @param {String} $2:summary
-- @param {String} $3:summaryModel
-- @param {Provider} $4:summaryProvider
-- @param {MemoryChunkSummaryPromptVersion} $5:summaryPromptVersion
-- @param {Int} $6:summaryTokens
-- @param {Int} $7:summaryReasoningDuration
-- @param {String} $8:summaryReasoningText?
-- @param {String} $9:summaryToolUseRaw?

-- The ONLY path that sets summaryState = READY. Listing summary in SET fires the
-- tsv trigger, refreshing searchTsv's weighted composite (summary hits at weight A).
UPDATE "ConversationMemoryChunk"
SET
  summary                    = $2,
  "summaryState"             = 'READY'::"MemorySummaryState",
  "summaryModel"             = $3,
  "summaryProvider"          = $4::"Provider",
  "summaryPromptVersion"     = $5::"MemoryChunkSummaryPromptVersion",
  "summaryTokens"            = $6,
  "summaryReasoningDuration" = $7,
  "summaryReasoningText"     = $8,
  "summaryToolUseRaw"        = $9,
  "summaryError"             = NULL,
  "summaryGeneratedAt"       = NOW(),
  "updatedAt"                = NOW()
WHERE id = $1
RETURNING id, "provenanceId", "summaryState"::text as "summaryState";

-- @param {String} $1:storeId
-- @param {Int} $2:staleMinutes
-- @param {Int} $3:maxRetries

-- Store-scoped on purpose: any tick for a user can rescue a DIFFERENT conversation
-- whose claim crashed and never received another message. Reclaim = re-embed the
-- stored transcript (never re-partition) — the row is already inside the watermark.
SELECT
  mc.id,
  mc."provenanceId",
  mc."contextId",
  mc."conversationId",
  mc."chunkIndex",
  mc."ordinalStart",
  mc."ordinalEndExclusive",
  mc."transcriptMarkdown",
  mc."tokenCount",
  mc."embeddingModel",
  mc."chunkingState"::text as "chunkingState",
  mc."retryCount",
  mc."updatedAt"
FROM "ConversationMemoryChunk" mc
WHERE mc."storeId" = $1
  AND mc."chunkingState" IN ('CHUNKING'::"MemoryChunkingState", 'EMBEDDING'::"MemoryChunkingState")
  AND mc."updatedAt" < NOW() - make_interval(mins => $2)
  AND mc."retryCount" < $3
  AND mc."deletedAt" IS NULL
ORDER BY mc."createdAt" ASC;

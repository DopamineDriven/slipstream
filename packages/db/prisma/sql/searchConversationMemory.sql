-- @param {String} $1:storeId
-- @param {String} $2:embedding
-- @param {Int} $3:limit
-- @param {Float} $4:threshold
-- @param {String} $5:embeddingModel
-- @param {String} $6:conversationTitle?

SELECT
  mc.id,
  mc."provenanceId",
  mc."contextId",
  mc."conversationId",
  mc."chunkIndex",
  mc."ordinalStart",
  mc."ordinalEndExclusive",
  mc."messageIdStart",
  mc."messageIdEnd",
  mc."messageTimestampStart",
  mc."messageTimestampEnd",
  mc."transcriptMarkdown",
  mc."contentHash",
  mc."tokenCount",
  mc."chunkedMessagesCount",
  mc."providerModelsRaw",
  mc."hasAttachments",
  mc."boundaryReason"::text as "boundaryReason",
  mc.summary,
  mc."summaryState"::text as "summaryState",
  1 - (mc.embedding <=> $2::vector) as score
FROM "ConversationMemoryChunk" mc
WHERE mc."storeId" = $1
  AND mc."embeddingModel" = $5
  AND mc."chunkingState" = 'INDEXED'::"MemoryChunkingState"
  AND mc."deletedAt" IS NULL
  AND mc.embedding IS NOT NULL
  AND 1 - (mc.embedding <=> $2::vector) >= $4
  AND ($6::text IS NULL OR EXISTS (
    SELECT 1 FROM "Conversation" tc
    WHERE tc.id = mc."conversationId"
      AND similarity(lower(tc.title), lower($6)) >= 0.25
  ))
ORDER BY mc.embedding <=> $2::vector
LIMIT $3;

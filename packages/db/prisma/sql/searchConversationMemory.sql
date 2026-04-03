-- @param {String} $1:storeId
-- @param {String} $2:embedding
-- @param {Int} $3:limit
-- @param {Float} $4:threshold

SELECT
  mc.id,
  mc."provenanceId",
  mc."contextId",
  mc."conversationId",
  mc."chunkIndex",
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
  mc."boundaryReason"::"text" as "boundaryReason",
  mc.summary,
  1 - (mc.embedding <=> $2::vector) as score
FROM "ConversationMemoryChunk" mc
WHERE mc."storeId" = $1
  AND mc."chunkingState" = 'INDEXED'::"MemoryChunkingState"
  AND mc.embedding IS NOT NULL
  AND 1 - (mc.embedding <=> $2::vector) >= $4
ORDER BY mc.embedding <=> $2::vector
LIMIT $3;

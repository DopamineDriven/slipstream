-- @param {String} $1:conversationId
-- @param {MemoryChunkingState} $2:chunkingState?

SELECT
  mc.id,
  mc."provenanceId",
  mc."contextId",
  mc."chunkIndex",
  mc."ordinalStart",
  mc."ordinalEndExclusive",
  mc."messageIdStart",
  mc."messageIdEnd",
  mc."messageTimestampStart",
  mc."messageTimestampEnd",
  mc."contentHash",
  mc."tokenCount",
  mc."chunkedMessagesCount",
  mc."providerModelsRaw",
  mc."hasAttachments",
  mc."chunkingState"::text as "chunkingState",
  mc."boundaryReason"::text as "boundaryReason",
  mc."embeddingModel",
  mc."embeddedAt",
  mc.summary,
  mc."summaryState"::text as "summaryState",
  mc."summaryModel",
  mc."summaryGeneratedAt",
  mc."createdAt"
FROM "ConversationMemoryChunk" mc
WHERE mc."conversationId" = $1
  AND ($2::"MemoryChunkingState" IS NULL OR mc."chunkingState" = $2::"MemoryChunkingState")
  AND mc."deletedAt" IS NULL
ORDER BY mc."chunkIndex" ASC;

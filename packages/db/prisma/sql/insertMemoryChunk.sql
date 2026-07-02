-- @param {String} $1:id
-- @param {String} $2:provenanceId
-- @param {String} $3:contextId
-- @param {String} $4:storeId
-- @param {String} $5:conversationId
-- @param {Int} $6:chunkIndex
-- @param {Int} $7:ordinalStart
-- @param {Int} $8:ordinalEndExclusive
-- @param {String} $9:messageIdStart
-- @param {String} $10:messageIdEnd
-- @param {DateTime} $11:messageTimestampStart
-- @param {DateTime} $12:messageTimestampEnd
-- @param {String} $13:transcriptMarkdown
-- @param {String} $14:contentHash
-- @param {Int} $15:chunkedMessagesCount
-- @param {Int} $16:tokenCount
-- @param {String} $17:providerModelsRaw
-- @param {Boolean} $18:hasAttachments
-- @param {Int} $19:chunkedAttachmentsCount?
-- @param {String} $20:attachmentProvenanceIdsRaw?
-- @param {String} $21:embeddingModel
-- @param {MemoryChunkBoundaryReason} $22:boundaryReason?
-- @param {MemorySchemaVersion} $23:schemaVersion?
-- @param {MemoryTranscriptRendererVersion} $24:rendererVersion?
-- @param {Boolean} $25:transcriptIncludesThinking

-- Claim insert: the row is created BEFORE embedding (embedding lands via
-- updateMemoryChunkEmbedding.sql). Runs in the same transaction as the
-- claimMemorySection.sql watermark CAS, so a conflict here should be impossible;
-- bare DO NOTHING (zero rows returned) is the stop signal, never DO UPDATE —
-- the tsv trigger and lifecycle must not be re-fired by a losing racer.
INSERT INTO "ConversationMemoryChunk" (
  id,
  "provenanceId",
  "contextId",
  "storeId",
  "conversationId",
  "chunkIndex",
  "ordinalStart",
  "ordinalEndExclusive",
  "messageIdStart",
  "messageIdEnd",
  "messageTimestampStart",
  "messageTimestampEnd",
  "transcriptMarkdown",
  "contentHash",
  "chunkedMessagesCount",
  "tokenCount",
  "providerModelsRaw",
  "hasAttachments",
  "chunkedAttachmentsCount",
  "attachmentProvenanceIdsRaw",
  "embeddingModel",
  "boundaryReason",
  "schemaVersion",
  "rendererVersion",
  "transcriptIncludesThinking",
  "chunkingState",
  "summaryState",
  "createdAt",
  "updatedAt"
) VALUES (
  $1, $2, $3, $4, $5,
  $6, $7, $8,
  $9, $10, $11, $12,
  $13, $14, $15, $16,
  $17, $18, $19,
  NULLIF($20, ''),
  $21,
  $22::"MemoryChunkBoundaryReason",
  COALESCE($23::"MemorySchemaVersion", 'v1_0'::"MemorySchemaVersion"),
  COALESCE($24::"MemoryTranscriptRendererVersion", 'v1_0'::"MemoryTranscriptRendererVersion"),
  $25,
  'CHUNKING'::"MemoryChunkingState",
  'QUEUED'::"MemorySummaryState",
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING
RETURNING id, "provenanceId", "chunkingState"::text as "chunkingState";

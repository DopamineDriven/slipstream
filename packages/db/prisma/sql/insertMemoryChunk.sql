-- @param {String} $1:id
-- @param {String} $2:provenanceId
-- @param {String} $3:contextId
-- @param {String} $4:storeId
-- @param {String} $5:conversationId
-- @param {Int} $6:chunkIndex
-- @param {String} $7:messageIdStart
-- @param {String} $8:messageIdEnd
-- @param {DateTime} $9:messageTimestampStart
-- @param {DateTime} $10:messageTimestampEnd
-- @param {String} $11:messageIdsRaw
-- @param {String} $12:transcriptMarkdown
-- @param {String} $13:contentHash
-- @param {Int} $14:chunkedMessagesCount
-- @param {Int} $15:tokenCount
-- @param {String} $16:providerModelsRaw
-- @param {Boolean} $17:hasAttachments
-- @param {Int} $18:chunkedAttachmentsCount?
-- @param {String} $19:attachmentProvenanceIdsRaw?
-- @param {String} $20:embeddingModel
-- @param {String} $21:embedding
-- @param {DateTime} $22:embeddedAt?
-- @param {MemoryChunkBoundaryReason} $23:boundaryReason?
-- @param {MemorySchemaVersion} $24:schemaVersion?

INSERT INTO "ConversationMemoryChunk" (
  id,
  "provenanceId",
  "contextId",
  "storeId",
  "conversationId",
  "chunkIndex",
  "messageIdStart",
  "messageIdEnd",
  "messageTimestampStart",
  "messageTimestampEnd",
  "messageIdsRaw",
  "transcriptMarkdown",
  "contentHash",
  "chunkedMessagesCount",
  "tokenCount",
  "providerModelsRaw",
  "hasAttachments",
  "chunkedAttachmentsCount",
  "attachmentProvenanceIdsRaw",
  "embeddingModel",
  embedding,
  "embeddedAt",
  "boundaryReason",
  "schemaVersion",
  "chunkingState",
  "createdAt",
  "updatedAt"
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
  $11, $12, $13, $14, $15, $16, $17,
  $18,
  NULLIF($19, ''),
  $20,
  $21::vector,
  COALESCE($22, NOW()),
  $23::"MemoryChunkBoundaryReason",
  COALESCE($24::"MemorySchemaVersion", 'v1_0'::"MemorySchemaVersion"),
  'EMBEDDING'::"MemoryChunkingState",
  NOW(),
  NOW()
)
ON CONFLICT ("provenanceId") DO UPDATE SET
  "transcriptMarkdown"         = EXCLUDED."transcriptMarkdown",
  "contentHash"                = EXCLUDED."contentHash",
  "tokenCount"                 = EXCLUDED."tokenCount",
  "chunkedMessagesCount"       = EXCLUDED."chunkedMessagesCount",
  "providerModelsRaw"          = EXCLUDED."providerModelsRaw",
  "messageIdsRaw"              = EXCLUDED."messageIdsRaw",
  "hasAttachments"             = EXCLUDED."hasAttachments",
  "chunkedAttachmentsCount"    = EXCLUDED."chunkedAttachmentsCount",
  "attachmentProvenanceIdsRaw" = EXCLUDED."attachmentProvenanceIdsRaw",
  embedding                    = EXCLUDED.embedding,
  "embeddedAt"                 = EXCLUDED."embeddedAt",
  "chunkingState"              = 'INDEXED'::"MemoryChunkingState",
  "updatedAt"                  = NOW()
RETURNING id, "provenanceId", "chunkingState"::"text" as "chunkingState";

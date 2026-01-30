-- @param {String} $1:id
-- @param {String} $2:conversationId
-- @param {String} $3:contextStateId
-- @param {Provider} $4:provider
-- @param {String} $5:provenanceId
-- @param {String} $6:messageIdStart
-- @param {String} $7:messageIdEnd
-- @param {String} $8:contentHash
-- @param {ChunkingState} $9:chunkingState?
-- @param {DateTime} $10:messageTimestampStart
-- @param {DateTime} $11:messageTimestampEnd
-- @param {String} $12:transcriptMarkdown
-- @param {Int} $13:tokenCount
-- @param {String} $14:modelProvidersInChunkRaw
-- @param {String} $15:messageIdsRaw
-- @param {String} $16:attachmentIdsRaw?
-- @param {String} $17:embeddingModel
-- @param {Float[]} $18:embedding
-- @param {DateTime} $19:createdAt?
-- @param {DateTime} $20:updatedAt?

INSERT INTO "ConversationMemoryChunk" (
  id,
  "conversationId",
  "contextStateId",
  provider,
  "provenanceId",
  "messageIdStart",
  "messageIdEnd",
  "contentHash",
  "chunkingState",
  "messageTimestampStart",
  "messageTimestampEnd",
  "transcriptMarkdown",
  "tokenCount",
  "modelProvidersInChunkRaw",
  "messageIdsRaw",
  "attachmentIdsRaw",
  "embeddingModel",
  embedding,
  "createdAt",
  "updatedAt"
) VALUES (
  $1,
  $2,
  $3,
  $4::"Provider",
  $5,
  $6,
  $7,
  $8,
  COALESCE($9::"ChunkingState", 'IDLE'::"ChunkingState"),
  $10,
  $11,
  $12,
  $13,
  $14,
  $15,
  NULLIF($16, ''),
  $17,
  $18::vector,
  COALESCE($19, NOW()),
  COALESCE($20, NOW())
)
ON CONFLICT ("provenanceId") DO UPDATE SET
  "transcriptMarkdown" = EXCLUDED."transcriptMarkdown",
  "tokenCount" = EXCLUDED."tokenCount",
  "contentHash" = EXCLUDED."contentHash",
  "modelProvidersInChunkRaw" = EXCLUDED."modelProvidersInChunkRaw",
  "messageIdsRaw" = EXCLUDED."messageIdsRaw",
  "attachmentIdsRaw" = EXCLUDED."attachmentIdsRaw",
  embedding = EXCLUDED.embedding,
  "chunkingState" = 'COMPLETE'::"ChunkingState",
  "updatedAt" = NOW();

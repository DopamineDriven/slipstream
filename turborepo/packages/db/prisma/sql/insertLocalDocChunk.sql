-- @param {String} $1:id
-- @param {String} $2:docId
-- @param {String} $3:storeId
-- @param {String} $4:chunkProvenanceId
-- @param {String} $5:provenanceId
-- @param {String} $6:attachmentId
-- @param {String} $7:conversationId
-- @param {String} $8:messageId
-- @param {Int} $9:chunkIndex
-- @param {String} $10:content
-- @param {String} $11:contentHash
-- @param {Int} $12:tokenCount
-- @param {Int} $13:startOffset?
-- @param {Int} $14:endOffset?
-- @param {String} $15:embedding
-- @param {LocalStoreSchemaVersion} $16:schemaVersion?

INSERT INTO "LocalVectorStoreDocChunk" (
  id,
  "docId",
  "storeId",
  "chunkProvenanceId",
  "provenanceId",
  "attachmentId",
  "conversationId",
  "messageId",
  "chunkIndex",
  content,
  "contentHash",
  "tokenCount",
  "startOffset",
  "endOffset",
  embedding,
  "schemaVersion",
  "createdAt",
  "updatedAt"
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9,
  $10, $11, $12, $13, $14,
  $15::vector,
  COALESCE($16::"LocalStoreSchemaVersion", 'v1_0'::"LocalStoreSchemaVersion"),
  NOW(),
  NOW()
)
ON CONFLICT ("docId", "chunkIndex", "schemaVersion") DO UPDATE SET
  content       = EXCLUDED.content,
  "contentHash" = EXCLUDED."contentHash",
  "tokenCount"  = EXCLUDED."tokenCount",
  "startOffset" = EXCLUDED."startOffset",
  "endOffset"   = EXCLUDED."endOffset",
  embedding     = EXCLUDED.embedding,
  "updatedAt"   = NOW()
RETURNING id, "chunkProvenanceId", "chunkIndex";

-- @param {String} $1:id
-- @param {String} $2:storeId
-- @param {String} $3:attachmentId
-- @param {String} $4:conversationId
-- @param {String} $5:messageId
-- @param {Provider} $6:provider
-- @param {String} $7:provenanceId
-- @param {String} $8:filename
-- @param {String} $9:mimeType
-- @param {String} $10:ext
-- @param {BigInt} $11:size?
-- @param {String} $12:embeddingModel
-- @param {Int} $13:embeddingDim?
-- @param {Boolean} $14:hasVisualMedia
-- @param {VisualMediaHint} $15:visualMediaHint?
-- @param {Int} $16:pageCount?
-- @param {String} $17:modelSelectionReason?
-- @param {LocalStoreSchemaVersion} $18:schemaVersion?

INSERT INTO "LocalVectorStoreDoc" (
  id,
  "storeId",
  "attachmentId",
  "conversationId",
  "messageId",
  provider,
  "provenanceId",
  filename,
  "mimeType",
  ext,
  size,
  "embeddingModel",
  "embeddingDim",
  "hasVisualMedia",
  "visualMediaHint",
  "pageCount",
  "modelSelectionReason",
  "schemaVersion",
  state,
  "createdAt",
  "updatedAt"
) VALUES (
  $1, $2, $3, $4, $5,
  $6::"Provider",
  $7, $8, $9, $10, $11,
  $12,
  COALESCE($13, 1024),
  $14,
  $15::"VisualMediaHint",
  $16,
  $17,
  COALESCE($18::"LocalStoreSchemaVersion", 'v1_0'::"LocalStoreSchemaVersion"),
  'PENDING'::"LocalStoreDocState",
  NOW(),
  NOW()
)
ON CONFLICT ("storeId", "provenanceId") DO UPDATE SET
  "embeddingModel"       = EXCLUDED."embeddingModel",
  "hasVisualMedia"       = EXCLUDED."hasVisualMedia",
  "visualMediaHint"      = EXCLUDED."visualMediaHint",
  "pageCount"            = EXCLUDED."pageCount",
  "modelSelectionReason" = EXCLUDED."modelSelectionReason",
  state                  = 'PENDING'::"LocalStoreDocState",
  "updatedAt"            = NOW()
RETURNING id, "provenanceId", state::"text" as state;

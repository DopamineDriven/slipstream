-- @param {String} $1:id
-- @param {String} $2:storeId
-- @param {String} $3:attachmentId
-- @param {String} $4:conversationId
-- @param {String} $5:messageId
-- @param {String} $6:originatingUrl
-- @param {String} $7:originatingModel?
-- @param {Provider} $8:originatingProvider?
-- @param {String} $9:provenanceId
-- @param {String} $10:filename
-- @param {String} $11:mimeType
-- @param {String} $12:ext
-- @param {BigInt} $13:size
-- @param {String} $14:embeddingModel
-- @param {Int} $15:embeddingDim?
-- @param {Boolean} $16:hasVisualMedia
-- @param {VisualMediaSource} $17:visualMediaSource?
-- @param {VisualMediaContent} $18:visualMediaContent?
-- @param {Int} $19:pageCount?
-- @param {String} $20:modelSelectionReason?
-- @param {UserStoreSchemaVersion} $21:schemaVersion?

INSERT INTO "UserStoreDoc" (
  id,
  "storeId",
  "attachmentId",
  "conversationId",
  "messageId",
  "originatingUrl",
  "originatingModel",
  "originatingProvider",
  "provenanceId",
  filename,
  "mimeType",
  ext,
  size,
  "embeddingModel",
  "embeddingDim",
  "hasVisualMedia",
  "visualMediaSource",
  "visualMediaContent",
  "pageCount",
  "modelSelectionReason",
  "schemaVersion",
  state,
  "createdAt",
  "updatedAt"
) VALUES (
  $1, $2, $3, $4, $5,
  $6, $7,
  $8::"Provider",
  $9, $10, $11, $12, $13,
  $14,
  COALESCE($15, 1024),
  $16,
  $17::"VisualMediaSource",
  $18::"VisualMediaContent",
  $19,
  $20,
  COALESCE($21::"UserStoreSchemaVersion", 'v1_0'::"UserStoreSchemaVersion"),
  'QUEUED'::"UserStoreDocState",
  NOW(),
  NOW()
)
ON CONFLICT ("attachmentId") DO UPDATE SET
  "embeddingModel"       = EXCLUDED."embeddingModel",
  "hasVisualMedia"       = EXCLUDED."hasVisualMedia",
  "visualMediaSource"    = EXCLUDED."visualMediaSource",
  "visualMediaContent"   = EXCLUDED."visualMediaContent",
  "pageCount"            = EXCLUDED."pageCount",
  "modelSelectionReason" = EXCLUDED."modelSelectionReason",
  state                  = CASE
                             WHEN "UserStoreDoc".state = 'FAILED'::"UserStoreDocState"
                             THEN 'QUEUED'::"UserStoreDocState"
                             ELSE "UserStoreDoc".state
                           END,
  "updatedAt"            = NOW()
RETURNING id, "provenanceId", state::"text" as state, "attachmentId";

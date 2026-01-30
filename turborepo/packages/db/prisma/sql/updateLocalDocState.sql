-- @param {String} $1:docId
-- @param {LocalStoreDocState} $2:state
-- @param {Int} $3:chunkCount?
-- @param {Int} $4:tokenCount?
-- @param {Int} $5:extractedTextLength?
-- @param {Int} $6:imageCount?
-- @param {String} $7:errorMessage?

UPDATE "LocalVectorStoreDoc"
SET
  state                = $2::"LocalStoreDocState",
  "chunkCount"         = COALESCE($3, "chunkCount"),
  "tokenCount"         = COALESCE($4, "tokenCount"),
  "extractedTextLength"= COALESCE($5, "extractedTextLength"),
  "imageCount"         = COALESCE($6, "imageCount"),
  "errorMessage"       = $7,
  "indexedAt"           = CASE WHEN $2 = 'ACTIVE' THEN NOW() ELSE "indexedAt" END,
  "updatedAt"           = NOW()
WHERE id = $1
RETURNING id, state::"text" as state, "chunkCount", "indexedAt";

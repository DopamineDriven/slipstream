-- @param {String} $1:docId
-- @param {UserStoreDocState} $2:state
-- @param {Int} $3:chunkCount?
-- @param {Int} $4:tokenCount?
-- @param {Int} $5:extractedTextLength?
-- @param {Int} $6:imageCount?
-- @param {String} $7:imagePages?
-- @param {String} $8:annotPages?
-- @param {String} $9:errorMessage?
-- @param {VisualMediaSource} $10:visualMediaSource?
-- @param {VisualMediaContent} $11:visualMediaContent?

UPDATE "UserStoreDoc"
SET
  state                = $2::"UserStoreDocState",
  "chunkCount"         = COALESCE($3, "chunkCount"),
  "tokenCount"         = COALESCE($4, "tokenCount"),
  "extractedTextLength"= COALESCE($5, "extractedTextLength"),
  "imageCount"         = COALESCE($6, "imageCount"),
  "imagePages"         = COALESCE($7, "imagePages"),
  "annotPages"         = COALESCE($8, "annotPages"),
  "errorMessage"       = $9,
  "visualMediaSource"  = COALESCE($10::"VisualMediaSource", "visualMediaSource"),
  "visualMediaContent" = COALESCE($11::"VisualMediaContent", "visualMediaContent"),
  "indexedAt"          = CASE WHEN $2 = 'ACTIVE' THEN NOW() ELSE "indexedAt" END,
  "updatedAt"          = NOW()
WHERE id = $1
RETURNING id, state::"text" as state, "chunkCount", "indexedAt";

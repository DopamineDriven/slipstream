-- @param {String} $1:chunkId
-- @param {UserStoreChunkState} $2:state
-- @param {String} $3:embedding?
-- @param {Int} $4:tokenCount?
-- @param {String} $5:errorMessage?
-- @param {Int} $6:retryCount?
-- @param {Boolean} $7:hasImages?
-- @param {Boolean} $8:hasAnnots?
-- @param {String} $9:embeddingModel?

UPDATE "UserStoreDocChunk"
SET
  state            = $2::"UserStoreChunkState",
  embedding        = COALESCE($3::vector, NULL),
  "tokenCount"     = COALESCE($4, "tokenCount"),
  "errorMessage"   = $5,
  "retryCount"     = COALESCE($6, "retryCount"),
  "hasImages"      = COALESCE($7, "hasImages"),
  "hasAnnots"      = COALESCE($8, "hasAnnots"),
  "embeddingModel" = COALESCE($9, "embeddingModel"),
  "updatedAt"      = NOW()
WHERE id = $1
RETURNING id, state::"text" as state, "tokenCount", "retryCount";

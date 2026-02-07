-- @param {String} $1:chunkId
-- @param {UserStoreChunkState} $2:state
-- @param {String} $3:embedding?
-- @param {Int} $4:tokenCount?
-- @param {String} $5:errorMessage?
-- @param {Int} $6:retryCount?
-- @param {Boolean} $7:hasVisualContent?

UPDATE "UserStoreDocChunk"
SET
  state              = $2::"UserStoreChunkState",
  embedding          = COALESCE($3::vector, NULL),
  "tokenCount"       = COALESCE($4, "tokenCount"),
  "errorMessage"     = $5,
  "retryCount"       = COALESCE($6, "retryCount"),
  "hasVisualContent" = COALESCE($7, "hasVisualContent"),
  "updatedAt"        = NOW()
WHERE id = $1
RETURNING id, state::"text" as state, "tokenCount", "retryCount";

-- @param {String} $1:chunkId
-- @param {LocalStoreChunkState} $2:state
-- @param {String} $3:embedding?
-- @param {Int} $4:tokenCount?
-- @param {String} $5:errorMessage?

UPDATE "LocalVectorStoreDocChunk"
SET
  state         = $2::"LocalStoreChunkState",
  embedding     = COALESCE($3::vector, NULL),
  "tokenCount"  = COALESCE($4, "tokenCount"),
  "errorMessage" = $5,
  "updatedAt"   = NOW()
WHERE id = $1
RETURNING id, state::"text" as state, "tokenCount";

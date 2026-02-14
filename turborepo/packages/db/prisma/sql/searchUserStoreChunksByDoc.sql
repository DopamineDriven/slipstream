-- @param {String} $1:docId
-- @param {String} $2:embedding
-- @param {Int} $3:limit
-- @param {Float} $4:threshold

SELECT
  chunk.id,
  chunk."chunkProvenanceId",
  chunk."chunkIndex",
  chunk.content,
  chunk."contentHash",
  chunk."tokenCount",
  chunk."startOffset",
  chunk."endOffset",
  chunk."pageStartOffset",
  chunk."pageEndOffset",
  chunk."hasImages",
  chunk."hasAnnots",
  chunk."provenanceId",
  chunk."attachmentId",
  1 - (chunk.embedding <=> $2::vector) as score
FROM "UserStoreDocChunk" chunk
WHERE chunk."docId" = $1
  AND chunk."deletedAt" IS NULL
  AND chunk.state = 'READY'::"UserStoreChunkState"
  AND chunk.embedding IS NOT NULL
  AND 1 - (chunk.embedding <=> $2::vector) >= $4
ORDER BY chunk.embedding <=> $2::vector
LIMIT $3;

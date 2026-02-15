-- @param {String} $1:storeId
-- @param {String} $2:embedding
-- @param {Int} $3:limit
-- @param {Float} $4:threshold

SELECT
  chunk.id,
  chunk."docId",
  chunk."chunkProvenanceId",
  chunk."chunkIndex",
  chunk.content,
  chunk."tokenCount",
  chunk."startOffset",
  chunk."endOffset",
  chunk."provenanceId",
  chunk."attachmentId",
  chunk."conversationId",
  chunk."messageId",
  doc.filename,
  doc."mimeType",
  doc."embeddingModel",
  1 - (chunk.embedding <=> $2::vector) as score
FROM "LocalVectorStoreDocChunk" chunk
INNER JOIN "LocalVectorStoreDoc" doc ON chunk."docId" = doc.id
WHERE chunk."storeId" = $1
  AND chunk."deletedAt" IS NULL
  AND doc."deletedAt" IS NULL
  AND doc.state = 'ACTIVE'::"LocalStoreDocState"
  AND chunk.state = 'READY'::"LocalStoreChunkState"
  AND chunk.embedding IS NOT NULL
  AND 1 - (chunk.embedding <=> $2::vector) >= $4
ORDER BY chunk.embedding <=> $2::vector
LIMIT $3;

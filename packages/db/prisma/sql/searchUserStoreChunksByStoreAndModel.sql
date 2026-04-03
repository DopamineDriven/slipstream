-- @param {String} $1:storeId
-- @param {String} $2:embedding
-- @param {Int} $3:limit
-- @param {Float} $4:threshold
-- @param {String} $5:embeddingModel
-- @param {String} $6:filename?

SELECT
  chunk.id,
  chunk."docId",
  chunk."chunkProvenanceId",
  chunk."chunkIndex",
  chunk.content,
  chunk."tokenCount",
  chunk."startOffset",
  chunk."endOffset",
  chunk."pageStartOffset",
  chunk."pageEndOffset",
  chunk."hasImages",
  chunk."hasAnnots",
  chunk."embeddingModel",
  chunk."provenanceId",
  chunk."attachmentId",
  chunk."conversationId",
  chunk."messageId",
  doc.filename,
  doc."mimeType",
  doc."embeddingModel",
  doc."originatingModel",
  doc."originatingProvider"::"text" as "originatingProvider",
  1 - (chunk.embedding <=> $2::vector) as score
FROM "UserStoreDocChunk" chunk
INNER JOIN "UserStoreDoc" doc ON chunk."docId" = doc.id
WHERE chunk."storeId" = $1
  AND chunk."embeddingModel" = $5
  AND chunk."deletedAt" IS NULL
  AND doc."deletedAt" IS NULL
  AND doc.state IN (
    'ACTIVE'::"UserStoreDocState",
    'PARTIAL'::"UserStoreDocState"
  )
  AND chunk.state = 'READY'::"UserStoreChunkState"
  AND chunk.embedding IS NOT NULL
  AND 1 - (chunk.embedding <=> $2::vector) >= $4
  AND ($6::text IS NULL OR similarity(lower(doc.filename), lower($6)) >= 0.25)
ORDER BY chunk.embedding <=> $2::vector
LIMIT $3;

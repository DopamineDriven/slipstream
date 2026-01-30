SELECT
  chunk.id,
  chunk."attachmentId",
  chunk."chunkIndex",
  chunk.content,
  chunk."tokenCount",
  1 - (chunk.embedding <=> $2::vector) as score
FROM "ProviderStoreDocumentChunk" chunk
WHERE chunk."providerStoreDocId" IN (
  SELECT id FROM "ProviderStoreDocument"
  WHERE "storeId" = $1 AND state = 'ACTIVE'
)
AND chunk.embedding IS NOT NULL
AND 1 - (chunk.embedding <=> $2::vector) >= $4
ORDER BY chunk.embedding <=> $2::vector
LIMIT $3;

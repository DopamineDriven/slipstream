 -- @param {String} $1:userId
 -- @param {Provider} $2:provider
 -- @param {String} $3:embedding
 -- @param {Int} $4:limit
 -- @param {Float} $5:threshold

 SELECT
   chunk.id, chunk."attachmentId", chunk."chunkIndex",
   chunk.content, chunk."tokenCount",
   1 - (chunk.embedding <=> $3::vector) as score
 FROM "ProviderStoreDocumentChunk" chunk
 INNER JOIN "ProviderStoreDocument" doc ON chunk."providerStoreDocId" = doc.id
 INNER JOIN "ProviderStore" store ON doc."storeId" = store.id
 WHERE store."userId" = $1
   AND store.provider = $2::"Provider"
   AND doc.state = 'ACTIVE'
   AND chunk.embedding IS NOT NULL
   AND 1 - (chunk.embedding <=> $3::vector) >= $5
 ORDER BY chunk.embedding <=> $3::vector
 LIMIT $4;

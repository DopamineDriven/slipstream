 -- @param {String} $1:id
 -- @param {String} $2:providerStoreDocId
 -- @param {String} $3:attachmentId
 -- @param {Int} $4:chunkIndex
 -- @param {String} $5:content
 -- @param {Provider} $6:provider
 -- @param {Int} $7:tokenCount
 -- @param {Int} $8:startOffset
 -- @param {Int} $9:endOffset
 -- @param {String} $10:embedding

 INSERT INTO "ProviderStoreDocumentChunk" (
   id, "providerStoreDocId", "attachmentId", "chunkIndex",
   content, provider, "tokenCount", "startOffset", "endOffset",
   embedding, "createdAt", "updatedAt"
 ) VALUES (
   $1, $2, $3, $4, $5, $6::"Provider", $7, $8, $9,
   $10::vector, NOW(), NOW()
 )
 ON CONFLICT ("providerStoreDocId", "chunkIndex") DO UPDATE SET
   content = EXCLUDED.content,
   "tokenCount" = EXCLUDED."tokenCount",
   embedding = EXCLUDED.embedding,
   "startOffset" = EXCLUDED."startOffset",
   "endOffset" = EXCLUDED."endOffset",
   "updatedAt" = NOW();

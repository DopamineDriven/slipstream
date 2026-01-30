
 -- Cleanup old indexes from deleted ProviderStoreDocumentChunk table
 DROP INDEX IF EXISTS "idx_doc_chunk_embedding_hnsw";

 -- HNSW index on LocalVectorStoreDocChunk
 CREATE INDEX IF NOT EXISTS idx_local_doc_chunk_embedding_hnsw
 ON "LocalVectorStoreDocChunk" USING hnsw (embedding vector_cosine_ops)
 WITH (m = 16, ef_construction = 64);

 -- Partial index for store-scoped search
 CREATE INDEX IF NOT EXISTS idx_local_doc_chunk_store_active
 ON "LocalVectorStoreDocChunk" ("storeId")
 WHERE embedding IS NOT NULL AND "deletedAt" IS NULL;

 -- HNSW index on ConversationMemoryChunk
 CREATE INDEX IF NOT EXISTS idx_memory_chunk_embedding_hnsw
 ON "ConversationMemoryChunk" USING hnsw (embedding vector_cosine_ops)
 WITH (m = 16, ef_construction = 64);

 -- Partial indexes for scoped memory search
 CREATE INDEX IF NOT EXISTS idx_memory_chunk_store_indexed
 ON "ConversationMemoryChunk" ("storeId")
 WHERE embedding IS NOT NULL AND "chunkingState" = 'INDEXED';

 CREATE INDEX IF NOT EXISTS idx_memory_chunk_context_indexed
 ON "ConversationMemoryChunk" ("contextId")
 WHERE embedding IS NOT NULL AND "chunkingState" = 'INDEXED';

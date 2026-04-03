-- @param {Provider} $1:provider
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE INDEX IF NOT EXISTS idx_doc_chunk_embedding_hnsw ON "ProviderStoreDocumentChunk" USING hnsw (embedding vector_cosine_ops)
WITH
  (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_memory_chunk_embedding_hnsw ON "ConversationMemoryChunk" USING hnsw (embedding vector_cosine_ops)
WITH
  (m = 16, ef_construction = 64);

-- Composite indexes for filtered vector search
CREATE INDEX IF NOT EXISTS idx_doc_chunk_provider_embedding ON "ProviderStoreDocumentChunk" (provider, "providerStoreDocId")
WHERE
  embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_chunk_context_embedding ON "ConversationMemoryChunk" ("contextStateId")
WHERE
  embedding IS NOT NULL;

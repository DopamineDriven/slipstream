-- This is an empty migration.

-- Add vector columns (not in Prisma schema - managed via raw SQL)
ALTER TABLE "ProviderStoreDocumentChunk"
ADD COLUMN embedding vector(1024);

ALTER TABLE "ConversationMemoryChunk"
ADD COLUMN embedding vector(1024);

-- HNSW indexes for vector similarity search
CREATE INDEX idx_doc_chunk_embedding
ON "ProviderStoreDocumentChunk"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);


CREATE INDEX idx_memory_chunk_embedding
ON "ConversationMemoryChunk"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Partial indexes for filtered vector search (only search rows that have embeddings)
CREATE INDEX idx_doc_chunk_embedding_partial
ON "ProviderStoreDocumentChunk" (embedding)
WHERE embedding IS NOT NULL;

CREATE INDEX idx_memory_chunk_embedding_partial
ON "ConversationMemoryChunk" (embedding)
WHERE embedding IS NOT NULL;

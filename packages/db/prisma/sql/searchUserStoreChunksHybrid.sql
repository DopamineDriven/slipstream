-- @param {String} $1:storeId
-- @param {String} $2:embedding
-- @param {Int} $3:semanticLimit
-- @param {Float} $4:threshold
-- @param {String} $5:searchTerms?
-- @param {Int} $6:fulltextLimit
-- @param {String} $7:embeddingModel
-- @param {String} $8:filename?

WITH semantic_ranked AS (
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
    1 - (chunk.embedding <=> $2::vector) AS score,
    ROW_NUMBER() OVER (ORDER BY chunk.embedding <=> $2::vector) AS rank
  FROM "UserStoreDocChunk" chunk
  INNER JOIN "UserStoreDoc" doc ON chunk."docId" = doc.id
  WHERE chunk."storeId" = $1
    AND chunk."embeddingModel" = $7
    AND chunk."deletedAt" IS NULL
    AND doc."deletedAt" IS NULL
    AND doc.state IN ('ACTIVE'::"UserStoreDocState", 'PARTIAL'::"UserStoreDocState")
    AND chunk.state = 'READY'::"UserStoreChunkState"
    AND chunk.embedding IS NOT NULL
    AND 1 - (chunk.embedding <=> $2::vector) >= $4
    AND ($8::text IS NULL OR similarity(lower(doc.filename), lower($8)) >= 0.25)
  ORDER BY chunk.embedding <=> $2::vector
  LIMIT $3
),
fulltext_ranked AS (
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
    ts_rank_cd(chunk."contentTsv", websearch_to_tsquery('english', $5)) AS score,
    ROW_NUMBER() OVER (
      ORDER BY ts_rank_cd(chunk."contentTsv", websearch_to_tsquery('english', $5)) DESC
    ) AS rank
  FROM "UserStoreDocChunk" chunk
  INNER JOIN "UserStoreDoc" doc ON chunk."docId" = doc.id
  WHERE $5 IS NOT NULL
    AND $5 <> ''
    AND chunk."storeId" = $1
    AND chunk."deletedAt" IS NULL
    AND doc."deletedAt" IS NULL
    AND doc.state IN ('ACTIVE'::"UserStoreDocState", 'PARTIAL'::"UserStoreDocState")
    AND chunk.state = 'READY'::"UserStoreChunkState"
    AND chunk."contentTsv" @@ websearch_to_tsquery('english', $5)
    AND ($8::text IS NULL OR similarity(lower(doc.filename), lower($8)) >= 0.25)
  LIMIT $6
)
SELECT
  r.id,
  r."docId",
  r."chunkProvenanceId",
  r."chunkIndex",
  r.content,
  r."tokenCount",
  r."startOffset",
  r."endOffset",
  r."pageStartOffset",
  r."pageEndOffset",
  r."hasImages",
  r."hasAnnots",
  r."embeddingModel",
  r."provenanceId",
  r."attachmentId",
  r."conversationId",
  r."messageId",
  doc.filename,
  doc."mimeType",
  doc."embeddingModel" AS "docEmbeddingModel",
  doc."originatingModel",
  doc."originatingProvider"::"text" AS "originatingProvider",
  r.score,
  r.rank::int AS rank,
  r.signal,
  CASE
    WHEN r.signal = 'semantic'
      AND r.id IN (SELECT id FROM fulltext_ranked)
    THEN true
    WHEN r.signal = 'fulltext'
      AND r.id IN (SELECT id FROM semantic_ranked)
    THEN true
    ELSE false
  END AS "appearsInBothSignals"
FROM (
  SELECT *, 'semantic' AS signal FROM semantic_ranked
  UNION ALL
  SELECT *, 'fulltext' AS signal FROM fulltext_ranked
) r
INNER JOIN "UserStoreDoc" doc ON r."docId" = doc.id
ORDER BY r.signal, r.rank;

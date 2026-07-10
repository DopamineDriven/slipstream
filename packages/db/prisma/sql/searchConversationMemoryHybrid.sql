-- @param {String} $1:storeId
-- @param {String} $2:embedding
-- @param {Int} $3:semanticLimit
-- @param {Float} $4:threshold
-- @param {String} $5:searchTerms?
-- @param {Int} $6:fulltextLimit
-- @param {String} $7:embeddingModel
-- @param {String} $8:conversationTitle?

WITH semantic_ranked AS (
  SELECT
    mc.id,
    mc."provenanceId",
    mc."contextId",
    mc."conversationId",
    mc."chunkIndex",
    mc."ordinalStart",
    mc."ordinalEndExclusive",
    mc."messageTimestampStart",
    mc."messageTimestampEnd",
    mc.summary,
    mc."transcriptMarkdown",
    mc."tokenCount",
    mc."boundaryReason",
    mc."providerModelsRaw",
    mc."hasAttachments",
    mc."embeddingModel",
    1 - (mc.embedding <=> $2::vector) AS score,
    ROW_NUMBER() OVER (ORDER BY mc.embedding <=> $2::vector) AS rank
  FROM "ConversationMemoryChunk" mc
  WHERE mc."storeId" = $1
    AND mc."embeddingModel" = $7
    AND mc."chunkingState" = 'INDEXED'::"MemoryChunkingState"
    AND mc."deletedAt" IS NULL
    AND mc.embedding IS NOT NULL
    AND 1 - (mc.embedding <=> $2::vector) >= $4
    AND ($8::text IS NULL OR EXISTS (
      SELECT 1 FROM "Conversation" tc
      WHERE tc.id = mc."conversationId"
        AND similarity(lower(tc.title), lower($8)) >= 0.25
    ))
  ORDER BY mc.embedding <=> $2::vector
  LIMIT $3
),
fulltext_ranked AS (
  SELECT
    mc.id,
    mc."provenanceId",
    mc."contextId",
    mc."conversationId",
    mc."chunkIndex",
    mc."ordinalStart",
    mc."ordinalEndExclusive",
    mc."messageTimestampStart",
    mc."messageTimestampEnd",
    mc.summary,
    mc."transcriptMarkdown",
    mc."tokenCount",
    mc."boundaryReason",
    mc."providerModelsRaw",
    mc."hasAttachments",
    mc."embeddingModel",
    ts_rank_cd(mc."searchTsv", websearch_to_tsquery('english', $5)) AS score,
    ROW_NUMBER() OVER (
      ORDER BY ts_rank_cd(mc."searchTsv", websearch_to_tsquery('english', $5)) DESC
    ) AS rank
  FROM "ConversationMemoryChunk" mc
  WHERE $5 IS NOT NULL
    AND $5 <> ''
    AND mc."storeId" = $1
    AND mc."chunkingState" = 'INDEXED'::"MemoryChunkingState"
    AND mc."deletedAt" IS NULL
    AND mc."searchTsv" @@ websearch_to_tsquery('english', $5)
    AND ($8::text IS NULL OR EXISTS (
      SELECT 1 FROM "Conversation" tc
      WHERE tc.id = mc."conversationId"
        AND similarity(lower(tc.title), lower($8)) >= 0.25
    ))
  LIMIT $6
)
SELECT
  r.id,
  r."provenanceId",
  r."contextId",
  r."conversationId",
  c.title AS "conversationTitle",
  r."chunkIndex",
  r."ordinalStart",
  r."ordinalEndExclusive",
  r."messageTimestampStart",
  r."messageTimestampEnd",
  r.summary,
  r."transcriptMarkdown",
  r."tokenCount",
  r."boundaryReason"::text AS "boundaryReason",
  r."providerModelsRaw",
  r."hasAttachments",
  r."embeddingModel",
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
INNER JOIN "Conversation" c ON r."conversationId" = c.id
ORDER BY r.signal, r.rank;

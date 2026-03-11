Claude: 

Nice — seeing the actual schema makes this really concrete. A few things jump out:

**You're already in great shape for this.** You have raw SQL queries, you're comfortable with `Unsupported()` types in Prisma, and you're even already using `similarity()` (pg_trgm) in the `searchByStoreAndModel` query for filename fuzzy matching. Adding tsvector is the same pattern.

Here's how I'd slot it into your existing architecture:

## 1. Schema change on `UserStoreDocChunk`

Since Prisma doesn't natively support `tsvector`, same approach as your embedding column:

```prisma
model UserStoreDocChunk {
  // ... existing fields ...
  
  content        String @db.Text
  embedding      Unsupported("vector(1024)")?
  contentTsv     Unsupported("tsvector")?  // <- new

  // ... rest ...
  
  @@index([contentTsv], map: "idx_user_store_doc_chunk_content_tsv", type: Gin)
}
```

## 2. Migration SQL

You can't use `GENERATED ALWAYS AS` here because Prisma manages the column, so you'd do a trigger instead (which is arguably better anyway since you control tokenization config):

```sql
-- migration: add tsvector column + GIN index + auto-maintain trigger

ALTER TABLE "UserStoreDocChunk"
  ADD COLUMN "contentTsv" tsvector;

-- backfill existing rows
UPDATE "UserStoreDocChunk"
SET "contentTsv" = to_tsvector('english', content)
WHERE "contentTsv" IS NULL AND content IS NOT NULL;

-- GIN index for fast @@ lookups
CREATE INDEX CONCURRENTLY idx_user_store_doc_chunk_content_tsv
  ON "UserStoreDocChunk" USING GIN ("contentTsv");

-- trigger to auto-maintain on INSERT/UPDATE
CREATE OR REPLACE FUNCTION user_store_chunk_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW."contentTsv" := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_store_chunk_tsv
  BEFORE INSERT OR UPDATE OF content ON "UserStoreDocChunk"
  FOR EACH ROW
  EXECUTE FUNCTION user_store_chunk_tsv_trigger();
```

The `BEFORE INSERT OR UPDATE OF content` is key — it only fires when `content` actually changes, so your `updateUserStoreChunkState.sql` (which updates `state`, `embedding`, etc. but not `content`) won't needlessly re-trigger it.

## 3. Hybrid search query — store level with RRF

This replaces/supplements your `searchUserStoreChunksByStore.sql`. Follows the same `@param` conventions:

```sql
-- @param {String} $1:storeId
-- @param {String} $2:embedding
-- @param {Int} $3:limit
-- @param {Float} $4:threshold
-- @param {String} $5:searchTerms?

WITH semantic AS (
  SELECT
    chunk.id,
    chunk."docId",
    ROW_NUMBER() OVER (ORDER BY chunk.embedding <=> $2::vector) AS rank
  FROM "UserStoreDocChunk" chunk
  INNER JOIN "UserStoreDoc" doc ON chunk."docId" = doc.id
  WHERE chunk."storeId" = $1
    AND chunk."deletedAt" IS NULL
    AND doc."deletedAt" IS NULL
    AND doc.state IN ('ACTIVE'::"UserStoreDocState", 'PARTIAL'::"UserStoreDocState")
    AND chunk.state = 'READY'::"UserStoreChunkState"
    AND chunk.embedding IS NOT NULL
    AND 1 - (chunk.embedding <=> $2::vector) >= $4
  ORDER BY chunk.embedding <=> $2::vector
  LIMIT 50
),
fulltext AS (
  SELECT
    chunk.id,
    chunk."docId",
    ROW_NUMBER() OVER (
      ORDER BY ts_rank_cd(chunk."contentTsv", websearch_to_tsquery('english', $5)) DESC
    ) AS rank
  FROM "UserStoreDocChunk" chunk
  INNER JOIN "UserStoreDoc" doc ON chunk."docId" = doc.id
  WHERE $5 IS NOT NULL
    AND chunk."storeId" = $1
    AND chunk."deletedAt" IS NULL
    AND doc."deletedAt" IS NULL
    AND doc.state IN ('ACTIVE'::"UserStoreDocState", 'PARTIAL'::"UserStoreDocState")
    AND chunk.state = 'READY'::"UserStoreChunkState"
    AND chunk."contentTsv" @@ websearch_to_tsquery('english', $5)
  LIMIT 50
),
fused AS (
  SELECT
    COALESCE(s.id, f.id) AS id,
    COALESCE(s."docId", f."docId") AS "docId",
    COALESCE(1.0 / (60 + s.rank), 0.0) AS semantic_rrf,
    COALESCE(1.0 / (60 + f.rank), 0.0) AS fulltext_rrf
  FROM semantic s
  FULL OUTER JOIN fulltext f ON s.id = f.id
)
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
  doc."originatingProvider"::"text" AS "originatingProvider",
  1 - (chunk.embedding <=> $2::vector) AS semantic_score,
  fused.semantic_rrf + fused.fulltext_rrf AS rrf_score,
  CASE WHEN fused.fulltext_rrf > 0 THEN true ELSE false END AS "matchedFulltext",
  CASE WHEN fused.semantic_rrf > 0 THEN true ELSE false END AS "matchedSemantic"
FROM fused
INNER JOIN "UserStoreDocChunk" chunk ON chunk.id = fused.id
INNER JOIN "UserStoreDoc" doc ON chunk."docId" = doc.id
ORDER BY fused.semantic_rrf + fused.fulltext_rrf DESC
LIMIT $3;
```

A few design decisions worth calling out:

**The `$5 IS NOT NULL` guard on the fulltext CTE** — when `searchTerms` is null, the entire fulltext branch becomes a no-op and you get pure semantic search. This lets you use one query for both modes without branching in application code.

**The `matchedFulltext` / `matchedSemantic` booleans** in the SELECT — these are cheap to compute and extremely useful for agent reasoning. When an agent sees a result that matched on fulltext but scored low semantically, it knows the user was hunting for a specific term. Conversely, high semantic + no fulltext match means the concept is there but the exact terminology isn't.

**`websearch_to_tsquery` over `plainto_tsquery`** — this gives your agents the ability to pass quoted phrases for exact term matching (`"AES-256-GCM"`) and negation (`-deprecated`), which maps well to how agents tend to construct search queries.

## 4. The `updateUserStoreChunkState.sql` stays untouched

Your existing update query sets `embedding` but never touches `content`, so the trigger won't fire on state transitions. The trigger only fires on the initial `INSERT` (when content is set) and if you ever re-chunk (update content). Zero overhead on the hot path.

## 5. One consideration for your multimodal chunks

Since you're using `voyage-multimodal-3.5` for chunks with visual media — those chunks might have content that's OCR text, image descriptions, or sparse/noisy text. The tsvector will still index whatever's in `content`, but you might want to weight FTS results lower for chunks where `hasImages = true` since the text representation is lossy. You could do that with a small penalty in the RRF:

```sql
-- inside the fused CTE, penalize image-heavy chunks in FTS ranking
COALESCE(
  1.0 / (60 + f.rank) * CASE WHEN chunk."hasImages" THEN 0.7 ELSE 1.0 END,
  0.0
) AS fulltext_rrf
```

Though honestly I'd start without that and see if it's actually a problem empirically — OCR text from `pdfdown` is probably clean enough that it doesn't pollute FTS results.

Want me to write out the doc-level hybrid variant (`searchUserStoreChunksByDoc`) too, or the TypeScript types for the result shape?



---


Andrew: question, would it be better to return perhaps the top 10 results of each both for semantic search (already happens) and for exact match and let the model decide based on which context is more suitable for whatever it is they're doing which results to lean more heavily into? I'm thinking about AX (agentic experience) here


---


This is the right instinct, and I think it's the stronger architecture for an agentic system. Here's why:

**RRF is a fixed heuristic pretending to know intent.** The `k=60` constant and equal weighting between signals encode an assumption about what matters — but the agent *already knows* what matters because it has the user's query, the conversation history, and the task context. Collapsing two rich ranked signals into a single score before the intelligence layer sees them is throwing away information at exactly the wrong boundary.

Think of it like this: RRF is what you'd do if a dumb REST endpoint needed to return "the best results." But your consumer isn't a dumb endpoint — it's a model that can *reason about why* something matched.

The concrete scenarios where this matters:

**Agent is debugging a specific error** — user says "I keep seeing `ECONNREFUSED` in the logs." The FTS hits for that exact string are almost certainly more valuable than semantic neighbors about "connection failures" or "network errors." The agent should know to prioritize the exact-match set.

**Agent is exploring a concept** — user asks "how does our auth flow work?" There's no magic keyword here. Semantic results dominate. The agent should recognize the FTS set is sparse or low-confidence and lean into the embedding hits.

**Agent gets signal from the *gap*** — if a term appears in FTS results but those chunks score low semantically, that's meaningful. It tells the agent "this term exists in the corpus but in a different conceptual context than expected." That's useful reasoning data that RRF obliterates.

## The architecture I'd go with

Return a single response object with both ranked lists and an overlap summary. Not two separate API calls — one query, structured output:

```sql
-- @param {String} $1:storeId
-- @param {String} $2:embedding
-- @param {Int} $3:semanticLimit
-- @param {Float} $4:threshold
-- @param {String} $5:searchTerms?
-- @param {Int} $6:fulltextLimit

-- Semantic results with rank
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
    AND chunk."deletedAt" IS NULL
    AND doc."deletedAt" IS NULL
    AND doc.state IN ('ACTIVE'::"UserStoreDocState", 'PARTIAL'::"UserStoreDocState")
    AND chunk.state = 'READY'::"UserStoreChunkState"
    AND chunk.embedding IS NOT NULL
    AND 1 - (chunk.embedding <=> $2::vector) >= $4
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
  doc."embeddingModel"       AS "docEmbeddingModel",
  doc."originatingModel",
  doc."originatingProvider"::"text" AS "originatingProvider",
  r.score,
  r.rank,
  r.signal,
  -- overlap detection: does this chunk appear in BOTH result sets?
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
```

The `UNION ALL` (not `UNION`) is deliberate — if a chunk appears in both sets, you *want* it to appear twice, once per signal, with its respective score and rank. The `appearsInBothSignals` flag tells the agent "hey, this one was a dual hit" without deduplicating it away.

The `ORDER BY r.signal, r.rank` gives you a predictable structure: all semantic results in rank order first, then all fulltext results in rank order. Easy to parse into two arrays on the TypeScript side.

## TypeScript result shaping

This is where you make it ergonomic for the agent to reason about:

```typescript
interface ChunkSearchHit {
  readonly id: string;
  readonly docId: string;
  readonly chunkProvenanceId: string;
  readonly chunkIndex: number;
  readonly content: string;
  readonly tokenCount: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly pageStartOffset: number | null;
  readonly pageEndOffset: number | null;
  readonly hasImages: boolean;
  readonly hasAnnots: boolean;
  readonly embeddingModel: string;
  readonly provenanceId: string;
  readonly attachmentId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly docEmbeddingModel: string;
  readonly originatingModel: string | null;
  readonly originatingProvider: string | null;
  readonly score: number;
  readonly rank: number;
  readonly appearsInBothSignals: boolean;
}

interface HybridSearchResult {
  readonly semantic: ReadonlyArray<ChunkSearchHit>;
  readonly fulltext: ReadonlyArray<ChunkSearchHit>;
  readonly overlap: {
    /** chunk IDs that appear in both result sets */
    readonly chunkIds: ReadonlyArray<string>;
    /** ratio of overlapping to total unique chunks — high overlap = strong agreement */
    readonly jaccardSimilarity: number;
  };
  readonly meta: {
    readonly searchTerms: string | null;
    readonly semanticThreshold: number;
    readonly semanticCount: number;
    readonly fulltextCount: number;
  };
}

function partitionHybridResults(
  rows: ReadonlyArray<ChunkSearchHit & { readonly signal: string }>
): HybridSearchResult {
  const semantic: Array<ChunkSearchHit> = [];
  const fulltext: Array<ChunkSearchHit> = [];

  for (const row of rows) {
    if (row.signal === "semantic") {
      semantic.push(row);
    } else {
      fulltext.push(row);
    }
  }

  const semanticIds = new Set(semantic.map(r => r.id));
  const fulltextIds = new Set(fulltext.map(r => r.id));
  const overlapIds = [...semanticIds].filter(id => fulltextIds.has(id));

  const unionSize = new Set([...semanticIds, ...fulltextIds]).size;

  return {
    semantic,
    fulltext,
    overlap: {
      chunkIds: overlapIds,
      jaccardSimilarity: unionSize > 0
        ? overlapIds.length / unionSize
        : 0,
    },
    meta: {
      searchTerms: null, // caller fills this
      semanticThreshold: 0, // caller fills this
      semanticCount: semantic.length,
      fulltextCount: fulltext.length,
    },
  } satisfies HybridSearchResult;
}
```

## What the agent sees in its tool response

This is the AX piece that matters most. When you format this for the model's context, you'd present it something like:

```
Retrieved 10 semantic results and 7 fulltext results.
Overlap: 3 chunks appear in both (Jaccard: 0.21)

── Semantic Results (by embedding similarity) ──
[1] score=0.91 | chunk#4 from "auth-flow-v2.pdf" (pp. 12-14)
[2] score=0.87 | chunk#2 from "api-reference.md"
...

── Fulltext Results (by term match: "ECONNREFUSED") ──
[1] score=0.34 | chunk#17 from "deploy-runbook.pdf" (pp. 8-9) ★ also in semantic
[2] score=0.29 | chunk#3 from "incident-2024-03.md"
...
```

The agent can now reason: "The user asked about a specific error code. The fulltext set contains the exact term in deployment and incident docs. The semantic set has conceptually related auth docs. I'll prioritize the fulltext results and pull in semantic result #1 for broader context."

That's a qualitatively different — and better — decision than any fixed-weight fusion could make.

## One nuance on the Jaccard similarity

That overlap ratio is a surprisingly useful meta-signal for the agent. High Jaccard (~0.5+) means the term and the concept are well-aligned in the corpus — the user's language matches how the documents talk about the topic. Low Jaccard (~0.1 or zero) means there's a vocabulary mismatch — the user is using different terminology than the docs, or they're hunting for a needle in a conceptually different haystack. An agent can use that signal to decide whether to ask the user for clarification or just proceed with the best available.

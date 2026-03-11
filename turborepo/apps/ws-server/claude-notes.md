# Hybrid Retrieval: Partitioned Foraging for Enhanced AX

## Context

The user store has thousands of existing chunks with vector embeddings (pgvector) but no fulltext search capability. Currently, all file search goes through pure semantic similarity — the agent embeds the query with Voyage, does cosine distance search, and gets ranked results. This works well for conceptual queries but fails when users search for exact terms (error codes, specific identifiers, quoted phrases).

The design decision (from the claude-read.md conversation) is to **not** fuse the two signals with RRF, but instead return both result sets separately so the agent can reason about which to prioritize based on context. This is the "partitioned foraging" approach — the agent is the intelligence layer that decides weighting, not a fixed heuristic.

### Key Design Decisions

- **Output format**: Structured JSON (`{ semantic, fulltext, overlap, meta }`) — models handle JSON well, and `code_execution`-capable models can parse it programmatically
- **Activation**: Opt-in only — the partitioned format is returned **only** when the agent explicitly provides `search_terms`. When absent, the existing flat JSON array is returned unchanged (zero regressions)

---

## Files to Modify/Create

| File | Action |
|------|--------|
| `packages/db/prisma/migrations/20260311035622_tsvector_incorporation/migration.sql` | **Edit** — fill the empty migration |
| `packages/db/prisma/schema/userstore.prisma` | **Edit** — add `contentTsv` column + GIN index |
| `packages/db/prisma/sql/searchUserStoreChunksHybrid.sql` | **Create** — partitioned hybrid query |
| `apps/ws-server/src/store/types.ts` | **Edit** — add hybrid result types |
| `apps/ws-server/src/prisma/user-store.ts` | **Edit** — add hybrid query method |
| `apps/ws-server/src/store/vector-store.ts` | **Edit** — add `searchUserStoreChunksHybrid()` |
| `apps/ws-server/src/anthropic/types.ts` | **Edit** — add `search_terms` to `FileSearchToolInput` |
| `apps/ws-server/src/anthropic/vector-store.ts` | **Edit** — update tool definition + `executeFileSearch()` |
| `apps/ws-server/src/openai/workup.ts` | **Edit** — same pattern as Anthropic |
| `apps/ws-server/src/meta/index.ts` | **Edit** — same pattern as Anthropic |

Grok/xAI is **excluded** — it uses native xAI collection-based search, not `UserStoreVectorService`.

---

## Step 1: Migration SQL

**File**: `packages/db/prisma/migrations/20260311035622_tsvector_incorporation/migration.sql`

Fill the existing empty "create only" migration with four operations:

```sql
-- 1. Add nullable tsvector column (same pattern as embedding Unsupported)
ALTER TABLE "UserStoreDocChunk"
  ADD COLUMN "contentTsv" tsvector;

-- 2. Backfill existing rows (thousands of chunks)
UPDATE "UserStoreDocChunk"
SET "contentTsv" = to_tsvector('english', COALESCE(REPLACE(content, E'\u0000', ''), ''))
WHERE "contentTsv" IS NULL AND content IS NOT NULL;

-- 3. GIN index (plain CREATE INDEX, not CONCURRENTLY — safe inside migration transaction)
CREATE INDEX idx_user_store_doc_chunk_content_tsv
  ON "UserStoreDocChunk" USING GIN ("contentTsv");

-- 4. Trigger to auto-maintain on INSERT or content UPDATE
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

**Key**: The `BEFORE INSERT OR UPDATE OF content` clause means `updateUserStoreChunkState.sql` (which updates state/embedding/tokenCount but never content) will NOT fire the trigger. Zero overhead on the embedding hot path.

---

## Step 2: Prisma Schema

**File**: `packages/db/prisma/schema/userstore.prisma`

Add to `UserStoreDocChunk` model after the `embedding` field (line ~237):

```prisma
contentTsv  Unsupported("tsvector")?
```

Add to the `@@index` block (after line ~255):

```prisma
@@index([contentTsv], map: "idx_user_store_doc_chunk_content_tsv", type: Gin)
```

---

## Step 3: Hybrid SQL Query

**File**: `packages/db/prisma/sql/searchUserStoreChunksHybrid.sql` (new)

Parameters follow existing `@param` JSDoc convention:

```
$1:storeId, $2:embedding, $3:semanticLimit, $4:threshold,
$5:searchTerms?, $6:fulltextLimit, $7:embeddingModel, $8:filename?
```

Structure — two CTEs + UNION ALL:

- **`semantic_ranked` CTE**: Replicates existing `searchUserStoreChunksByStoreAndModel` logic — filters by storeId, embeddingModel, active doc/chunk states, cosine threshold, optional filename fuzzy match via `similarity()`. Adds `ROW_NUMBER()` for rank. Limited to `$3`.

- **`fulltext_ranked` CTE**: Guarded by `$5 IS NOT NULL AND $5 <> ''` (no-op when search terms absent). Matches via `chunk."contentTsv" @@ websearch_to_tsquery('english', $5)`. Scores with `ts_rank_cd()`. Same state/filename filters. Limited to `$6`.

- **Final SELECT**: `UNION ALL` with `'semantic'` / `'fulltext'` as `signal` discriminant. Each row includes all chunk fields + doc metadata + `score`, `rank`, `signal`, `"appearsInBothSignals"` (cross-CTE existence check). Ordered by `signal, rank`.

The `$5 IS NOT NULL` guard means the planner completely eliminates the fulltext CTE when no search terms are provided — zero cost for semantic-only calls.

---

## Step 4: Type Definitions

**File**: `apps/ws-server/src/store/types.ts`

New types (after existing `UserStoreSearchResult` at line 103):

```typescript
import type { searchUserStoreChunksHybrid } from "@slipstream/db/sql-node";

/** Raw row from the hybrid SQL query */
export type HybridChunkHit = searchUserStoreChunksHybrid.Result;

/** 'semantic' | 'fulltext' */
export type HybridSearchSignal = "semantic" | "fulltext";

/** Input params for hybrid search */
export interface UserStoreHybridSearchParams extends UserStoreSearchParams {
  searchTerms?: string;
}

/** Partitioned result returned to providers */
export interface PartitionedSearchResult {
  readonly semantic: ReadonlyArray<HybridChunkHit>;
  readonly fulltext: ReadonlyArray<HybridChunkHit>;
  readonly overlap: {
    readonly chunkIds: ReadonlyArray<string>;
    readonly jaccardSimilarity: number;
  };
  readonly meta: {
    readonly searchTerms: string | null;
    readonly semanticThreshold: number;
    readonly semanticCount: number;
    readonly fulltextCount: number;
  };
}
```

**File**: `apps/ws-server/src/anthropic/types.ts` — add `search_terms?: string` to `FileSearchToolInput` (line 64-68).

Same change in OpenAI and Meta tool input types.

---

## Step 5: Prisma Service Layer

**File**: `apps/ws-server/src/prisma/user-store.ts`

Add new method (follows pattern of existing `searchUserStoreChunksByModel` at line 383):

```typescript
public async searchUserStoreChunksHybrid(
  storeId: string,
  embedding: string,
  semanticLimit: number,
  threshold: number,
  searchTerms: string | null,
  fulltextLimit: number,
  embeddingModel: string,
  filename: string | null = null
) {
  return await this.prismaClient.$queryRawTyped(
    searchUserStoreChunksHybrid(
      storeId, embedding, semanticLimit, threshold,
      searchTerms, fulltextLimit, embeddingModel, filename
    )
  );
}
```

Import `searchUserStoreChunksHybrid` from `@slipstream/db/sql-node` at the top (alongside existing SQL imports at line 12-16).

---

## Step 6: Vector Service — Hybrid Search Method

**File**: `apps/ws-server/src/store/vector-store.ts`

Add `searchUserStoreChunksHybrid()` as a new public method (alongside existing `searchUserStoreChunks` at line 543). Does NOT replace the existing method.

Logic:
1. Validate query, clamp limits, truncate `searchTerms` to 500 chars
2. `ensureUserStore(userId)` to get store ID
3. Embed query with both Voyage models in parallel (`Promise.allSettled`, same pattern as lines 558-570)
4. For each successful embedding, call `this.prisma.searchUserStoreChunksHybrid()` passing `searchTerms`
5. Collect all raw rows from both model calls
6. Partition into `semantic` and `fulltext` arrays by checking the `signal` column
7. Deduplicate within each signal by chunk ID (keep highest score)
8. Compute Jaccard overlap: `intersection.size / union.size`
9. Return `PartitionedSearchResult`

Also add a `formatPartitionedResults()` method that serializes the result to agent-friendly JSON:

```json
{
  "semantic": [{ "filename", "score", "content", "startOffset", "endOffset", "chunkIndex", "rank", "appearsInBothSignals" }],
  "fulltext": [{ ... same shape ... }],
  "overlap": { "chunkIds": [...], "jaccardSimilarity": 0.18 },
  "meta": { "searchTerms": "ECONNREFUSED", "semanticCount": 8, "fulltextCount": 5 }
}
```

When `searchTerms` is null → `fulltext` is empty, which degrades gracefully to the existing behavior.

---

## Step 7: Provider Layer Updates

Three providers need parallel changes. Anthropic is the pattern file; OpenAI and Meta follow.

### 7a. Tool Definition — Add `search_terms` to schema

Each provider's `fileSearchTool()` gets a new optional property in `input_schema.properties`:

```
search_terms: {
  type: "string",
  description: "Optional exact-match search terms for fulltext search. Supports quoted phrases (\"AES-256-GCM\") and negation (-deprecated). When provided, returns both semantic and fulltext result sets separately."
}
```

Update tool description to mention dual-signal capability.

Files:
- `apps/ws-server/src/anthropic/vector-store.ts` — `fileSearchTool()` (line 43)
- `apps/ws-server/src/openai/workup.ts` — `fileSearchFunctionTool()`
- `apps/ws-server/src/meta/index.ts` — `fileSearchFunctionTool()`

### 7b. Input Parsing — Extract `search_terms`

Each provider's tool input parsing adds `search_terms` extraction alongside `query`, `max_results`, `filename`. Backward compatible — absent means `null`.

Files:
- `apps/ws-server/src/anthropic/index.ts` (lines 913-933)
- `apps/ws-server/src/openai/workup.ts` (`parseFileSearchInput()`)
- `apps/ws-server/src/meta/index.ts` (`parseFileSearchInput()`)

### 7c. `executeFileSearch()` — Conditional Hybrid Path

When `input.search_terms` is present and non-empty:
- Call `searchUserStoreChunksHybrid()` instead of `searchStore()`
- Format with `formatPartitionedResults()`
- Return structured JSON

When `input.search_terms` is absent:
- Fall back to existing `searchStore()` behavior
- Return existing flat JSON array

This ensures zero regressions for models that don't use `search_terms`.

Files:
- `apps/ws-server/src/anthropic/vector-store.ts` — `executeFileSearch()` (line 77)
- `apps/ws-server/src/openai/workup.ts` — `executeFileSearch()`
- `apps/ws-server/src/meta/index.ts` — `executeFileSearch()`

### 7d. `searchStoreHybrid()` — New Protected Method

Each provider gets a `searchStoreHybrid()` that wraps `userStoreVector.searchUserStoreChunksHybrid()`:

```typescript
protected async searchStoreHybrid(
  userId: string,
  query: string,
  searchTerms: string,
  limit?: number,
  threshold?: number,
  filename?: string
): Promise<PartitionedSearchResult> {
  return await this.userStoreVector.searchUserStoreChunksHybrid({
    userId, query, searchTerms, limit, threshold, filename
  });
}
```

---

## Step 8: Regenerate & Verify

1. `cd packages/db && pnpm db:generate` — regenerates TypedSQL wrappers including `searchUserStoreChunksHybrid`
2. `cd packages/db && pnpm build` — compile new exports
3. Verify `@slipstream/db/sql-node` exports `searchUserStoreChunksHybrid`
4. `cd apps/ws-server && pnpm build` — type-check all service/provider changes
5. Apply migration to dev DB: `cd packages/db && pnpm db:deploy`
6. Verify backfill: `SELECT COUNT(*) FROM "UserStoreDocChunk" WHERE "contentTsv" IS NOT NULL` should match total chunk count
7. Test hybrid search end-to-end: send a message with a file_search tool call that includes `search_terms`

---

## Verification Plan

1. **Migration**: Run against dev DB, verify column exists, GIN index present, trigger fires on INSERT
2. **Backfill**: Confirm all existing chunks have populated `contentTsv`
3. **Pure semantic (regression)**: Existing `searchUserStoreChunks()` unchanged, verify existing file_search calls work identically
4. **Hybrid with terms**: Call file_search with `{ "query": "authentication flow", "search_terms": "ECONNREFUSED" }` — should return separate semantic + fulltext arrays
5. **Hybrid without terms**: Call file_search with `{ "query": "authentication flow" }` — fulltext array should be empty, semantic array populated (backward compat)
6. **Overlap detection**: Use a query where both signals overlap — verify `appearsInBothSignals` and Jaccard are computed correctly
7. **Agent reasoning**: Verify the agent can see both result sets and reason about which to prioritize in its response

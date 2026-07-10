# Conversation Memory Layer — Fable 5 Plan

> Authored by Claude Fable 5, 2026-07-02 — a markdown file with my name on it, literally :3
>
> This document responds to the two prior explorations in
> `architectural-decisions/2026-06-28/preliminary-exploration/` (gpt-5-5-pro.md, opus-4-8-max.md),
> takes positions where they diverge, and folds in facts verified directly against the repo —
> including one latent bug neither prior pass caught, and one race neither design survived.

---

## 0. Where I land (TL;DR)

- **Section-granular chunks keyed by ordinal ranges with exclusive ends** (`[ordinalStart, ordinalEndExclusive)`), embedded via `voyage-context-4` at 1024 dims, exact token counts only (the Python-bridge `countTokens` — the tiktoken approximation stays unused, as in practice today).
- **No job table.** The watermark compare-and-swap **is** the claim, executed transactionally with the chunk-row insert. This survives multi-instance Fargate races that both prior designs lose to (§9.1). The chunk row's state machine carries durability, exactly like `UserStoreDocChunk` does.
- **One weighted `searchTsv`** (summary weighted `A`, transcript `B`) instead of three tsvector columns — the exact-match lane mirrors `searchUserStoreChunksHybrid.sql` with two new hybrid SQL files.
- **Summaries live on the chunk only** (user decision). They're substituted into *provider-facing history* at prompt-assembly time — DB rows and ordinals untouched — snapped to chunk boundaries so Anthropic prompt caching survives (§12).
- **Summarizer = config-pinned frontier vision-capable model** (quality over cost, user decision), invoked fire-and-forget after indexing, never blocking the stream.
- **Anthropic-first tooling** (`conversation_memory_search` + `conversation_memory_get_chunk`), cloned from the `file_search` e2e that already spans all 14 providers, then mechanical rollout.
- **Repair the dropped partial indexes** — the userstore half is already fixed (migration `20260702063801`); the memory twins get fixed in this feature's migration (§5.3).

---

## 1. State of play (verified against the repo, not assumed)

**The memory layer is data-tier-only and the data tier is empty.** Schema (`packages/db/prisma/schema/memory.prisma`), five TypedSQL queries, generated clients, and type singletons all exist; there is *zero* runtime code — no service, no worker, no tool, no callers of any generated memory query. The frontend only writes `conversationMemoryChunkId: null` literals in optimistic messages. Every destructive schema change is free right now.

**The memory schema predates message ordinals.** It froze at migration `20260130052558`; ordinals arrived `20260601060714`/`20260601082408`. That's *why* chunks key off `messageIdStart`/`messageIdEnd` + timestamps — the right primitive didn't exist yet. It does now: `Message.ordinal Int`, 0-based dense, `@@unique([conversationId, ordinal])`, assigned once at persist time via `convoCount()` (`apps/ws-server/src/prisma/chat-response.ts:179` for AI, `chat-request.ts` for user).

**History is append-only today.** The only `message.update` anywhere is reactions (liked/disliked). `tryAgain` is a dormant flag with no resubmit flow; regeneration appends new rows with fresh ordinals. `branchId`/`parentId` exist on `Conversation` but are wired to nothing. The design depends on append-only ordinals; if a message-edit feature ever lands, chunk invalidation becomes a new requirement (flagged in §13).

**The runtime templates already exist:**

| Concern | Template | Location |
|---|---|---|
| Fire-and-forget background indexing | `scheduleUserStoreIndexing` | `apps/ws-server/src/resolver/chat-utils.ts:46` |
| Internal (non-user-facing) LLM call | `titleGenUtil` | `apps/ws-server/src/resolver/chat-utils.ts:77` |
| LLM-facing search tool, def + dispatch | `fileSearchTool` + PTC loop | `apps/ws-server/src/anthropic/vector-store.ts:58`, `anthropic/index.ts:1017-1078` |
| Hybrid semantic+fulltext SQL | `searchUserStoreChunksHybrid.sql` | `packages/db/prisma/sql/` |
| tsvector trigger + GIN + backfill | migration `20260311035622` | `packages/db/prisma/migrations/` |
| Two-tier service (infra → orchestration) | `UserStoreWorkupService` → `UserStoreVectorService` | `apps/ws-server/src/store/` |

**All 14 providers funnel through one persistence point** (`prisma.handleAiChatResponse`, `chat-response.ts:71`) and control returns to `resolver/chat.ts handleAIChat` after each provider handler resolves — that's the memory hook point, in the orchestration layer where CLAUDE.md says side effects belong.

**There is no queue infrastructure anywhere** — no BullMQ, no cron, no worker threads. Redis is pub/sub + resumable-stream state only. The house pattern is `void promise.then().catch()` plus DB state machines. A durable job table (GPT-5.5's §7) would be the first of its kind in this codebase; §9 shows it's also unnecessary.

**TypedSQL mechanics** (matters for migration sequencing): `.sql` files with `-- @param` headers in `packages/db/prisma/sql/` are validated **against the live database** by `prisma generate --sql`, and `prebuild`/`predev` run `db:generate`. Consequences: (a) dropping a column referenced by an existing `.sql` file breaks *every build* until the file is rewritten — schema changes and SQL rewrites must land in the same change-set; (b) migrate before generate, always; (c) `prisma migrate dev` runs plain `generate` without `--sql`, so an explicit `db:generate` is still required after migrating.

### 1.1 The latent index bug (found during this pass; half fixed already)

Migration `20260213034322` — a Prisma-generated diff for an unrelated `UserStoreDocChunk` change — silently emitted `DROP INDEX` for the hand-written **partial** indexes and never recreated them:

- `idx_user_store_doc_chunk_store_active` (userstore) — **fixed 2026-07-02** by migration `20260702063801` (duplicate declaration removed, partial index recreated with its `WHERE embedding IS NOT NULL AND "deletedAt" IS NULL` clause).
- `idx_memory_chunk_store_indexed`, `idx_memory_chunk_context_indexed` (memory) — **still missing**; repaired in this feature's migration (§5.3).

Root cause: declaring *both* a plain `@@index([storeId])` and a mapped `@@index([storeId], map: "...")` on the same column set. Prisma's diff engine collapses the duplicates and treats the raw partial index in the shadow DB as orphaned. The plain declarations' full-btree twins (`*_storeId_idx`) survived, so lookups stayed index-served — the loss was the partial indexes' selectivity, not correctness.

**Standing rule going forward: one index declaration per column set.** Mapped declarations act as placeholders for raw-SQL definitions; never pair them with a plain duplicate. After any migration touching these tables, run `prisma migrate dev --create-only` as a drift check — "no schema changes" is the proof the diff engine won't re-drop them.

---

## 2. Positions on the contested forks

Where gpt-5-5-pro.md and opus-4-8-max.md agree, I adopt without ceremony: ordinal range columns, nullable embedding, `voyage-context-4` defaults with `embeddingModel` filters in every search query, `MESSAGE_COUNT` boundary reason, tsvector + GIN + trigger, pure ordinal-ordered renderer, exact token counting. Where they diverge:

| Fork | GPT-5.5 Pro | Opus 4.8 | **Fable 5** |
|---|---|---|---|
| Range end | Exclusive | Inclusive | **Exclusive** — watermark *is* the next start; contiguity is `next.start === prev.end`; fetch is `ordinal >= start AND ordinal < end`. No ±1 arithmetic anywhere. |
| Summary representation | Synthetic `MEMORY_SUMMARY` Message rows + join table | Chunk-only, assembly-time substitution | **Chunk-only** (user decision). Ordinals pristine, no recursive-summarization exclusion logic, reversible, zero UI surface. |
| Job durability | Durable job table, leases, `SKIP LOCKED` | Watermark check, unspecified racing | **Neither survives scrutiny as written.** Job table is over-engineered for a codebase with zero queue infra; bare watermark check has a real multi-instance race (§9.1). The watermark **CAS-as-claim** gets job-table safety at zero new tables. |
| tsvector columns | Three (`transcriptTsv`, `summaryTsv`, `searchTsv`) | One weighted composite | **One weighted `searchTsv`** (`summary` → weight A, transcript → weight B). A summary keyword hit outranks an incidental transcript hit; one GIN index; per-target search lanes can be added later if ever needed. |
| Lifecycle states | Three new state columns or expanded enum | Keep `chunkingState`, separate summary pass | **Keep `chunkingState` + add `summaryState`.** Embedding success and summary failure are independent; a chunk is semantically searchable at `INDEXED` regardless of summary state. No renames of working enums. |
| Chunk↔message join table | Add now | Not needed | **Defer.** Ordinal ranges make membership derivable (`ordinal >= start AND ordinal < end`); `Message.conversationMemoryChunkId` covers the fast path. A join table earns its keep only when multi-era reindexing is real. |
| Provider-model / attachment join tables | Add now | — | **Defer.** `providerModelsRaw` / `attachmentProvenanceIdsRaw` are fine denormalized fields for v1; `attachmentProvenanceIdsRaw` already carries the hop into user-store provenance. |
| Embedding granularity | — | Section-granular v1, message-granular later | **Agree: section-granular.** One chunk row = one section = one embedding of `[[sectionTranscript]]`. Matches the range fields and one-summary-per-section exactly. |
| `lastChunkedMessageIndex` | Rename to ordinal watermark | Rename to `lastChunkedOrdinal` | **Replace with `lastIndexedOrdinalExclusive Int @default(0)`** — the exclusive-end convention makes the watermark and the next section's start the same number. |

One correction to Opus 4.8's transcript analysis: the concern about `<model provider="..." name="...">` wrappers poisoning the tsvector doesn't apply — `transcript-gen.ts` *strips* those wrappers (`sanitizeBlockContent`) and renders numbered markdown. The renderer spec (§7) keeps that property, so the trigger needs no tag-stripping regex.

---

## 3. Target schema — `memory.prisma`

Full target state (tables are empty; this is a reshape, not an evolution):

```prisma
enum MemoryChunkingState {
  QUEUED
  CHUNKING
  EMBEDDING
  INDEXED
  ERROR
}

enum MemorySummaryState {
  QUEUED
  SUMMARIZING
  READY
  ERROR
  SKIPPED
}

enum MemoryChunkBoundaryReason {
  MESSAGE_COUNT
  TOKEN_LIMIT
  IDLE_TIME
  TOPIC_SHIFT
  SESSION_END
  OTHER
}

enum MemorySchemaVersion {
  v1_0
}

model ConversationMemoryStore {
  id     String @id @default(cuid(2))
  userId String @unique

  embeddingModel String @default("voyage-context-4")
  embeddingDim   Int    @default(1024)

  totalChunks        Int    @default(0)
  totalTokens        BigInt @default(0)
  totalConversations Int    @default(0)

  schemaVersion MemorySchemaVersion @default(v1_0)
  lastSyncedAt  DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user     User                        @relation(fields: [userId], references: [id], onDelete: Cascade)
  contexts ConversationMemoryContext[]
}

model ConversationMemoryContext {
  id                String              @id @default(cuid(2))
  storeId           String
  conversationId    String              @unique
  schemaVersion     MemorySchemaVersion @default(v1_0)
  conversationTitle String?

  firstMessageAt DateTime?
  lastMessageAt  DateTime?

  rollingSummary          String?   @db.Text
  rollingSummaryModel     String?
  rollingSummaryProvider  Provider?
  rollingSummaryTokens    Int       @default(0)
  rollingSummaryUpdatedAt DateTime?

  /// Indexing watermark: every ordinal < this value is covered by a chunk row.
  /// Advanced ONLY via the claim CAS (claimMemorySection.sql). Never cached in-process.
  lastIndexedOrdinalExclusive Int       @default(0)
  lastChunkedAt               DateTime?

  totalTurns   Int @default(0)
  chunkedTurns Int @default(0)
  totalTokens  Int @default(0)

  contributingProviderModelsRaw String?

  hasMultipleProviders Boolean @default(false)
  hasMultipleModels    Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  memoryStore  ConversationMemoryStore   @relation(fields: [storeId], references: [id], onDelete: Cascade)
  conversation Conversation              @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  memoryChunks ConversationMemoryChunk[]

  @@index([storeId])
  @@index([lastChunkedAt])
}

model ConversationMemoryChunk {
  id             String @id @default(cuid(2))
  /// "${conversationId}-${ordinalStart}-${ordinalEndExclusive}-${schemaVersion}"
  provenanceId   String @unique
  contextId      String
  storeId        String
  conversationId String

  chunkIndex          Int
  /// covered messages: ordinalStart <= msg.ordinal < ordinalEndExclusive (0-based)
  ordinalStart        Int
  ordinalEndExclusive Int

  messageIdStart        String
  messageIdEnd          String
  messageTimestampStart DateTime
  messageTimestampEnd   DateTime

  /// Rendered from Message rows ordered by ordinal ASC. Append-only history is a
  /// standing assumption — a future message-edit feature must invalidate covering chunks.
  transcriptMarkdown         String  @db.Text
  rendererVersion            String  @default("memory-transcript-v1")
  transcriptIncludesThinking Boolean @default(false)
  contentHash                String
  chunkedMessagesCount       Int     @default(0)
  tokenCount                 Int     @default(0)

  providerModelsRaw String

  hasAttachments             Boolean @default(false)
  chunkedAttachmentsCount    Int?
  attachmentProvenanceIdsRaw String?

  embedding      Unsupported("vector(1024)")?
  embeddingModel String    @default("voyage-context-4")
  /// metadata for mixed-era retrieval; the column type itself pins 1024
  embeddingDim   Int       @default(1024)
  embeddedAt     DateTime?

  /// weighted composite maintained by trigger: setweight(summary,'A') || setweight(transcript,'B')
  searchTsv Unsupported("tsvector")?

  schemaVersion  MemorySchemaVersion        @default(v1_0)
  boundaryReason MemoryChunkBoundaryReason?

  chunkingState MemoryChunkingState @default(QUEUED)
  chunkingError String?
  retryCount    Int                 @default(0)

  summary              String?            @db.Text
  summaryState         MemorySummaryState @default(QUEUED)
  summaryModel         String?
  summaryProvider      Provider?
  summaryPromptVersion String?
  summaryTokens        Int                @default(0)
  summaryError         String?
  summaryRetryCount    Int                @default(0)
  summaryGeneratedAt   DateTime?

  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  messages Message[]
  context  ConversationMemoryContext @relation(fields: [contextId], references: [id], onDelete: Cascade)

  @@unique([conversationId, ordinalStart, ordinalEndExclusive, schemaVersion])
  @@unique([contextId, chunkIndex, schemaVersion])
  @@index([conversationId, ordinalStart])
  @@index([conversationId, ordinalEndExclusive])
  @@index([messageTimestampStart, messageTimestampEnd])
  @@index([chunkingState])
  @@index([summaryState])
  @@index([contentHash])
  @@index([embeddedAt])
  @@index([embedding], map: "idx_memory_chunk_embedding_hnsw")
  @@index([storeId], map: "idx_memory_chunk_store_indexed")
  @@index([contextId], map: "idx_memory_chunk_context_indexed")
  @@index([searchTsv], map: "idx_memory_chunk_search_tsv", type: Gin)
}
```

Deltas from current, and why:

- `embedding` **nullable** — the durable row must exist *before* the Voyage call (it's the claim record and the retry unit). Mirrors `UserStoreDocChunk`. pgvector HNSW skips NULLs; no index impact.
- `ordinalStart` / `ordinalEndExclusive` — the entire worker, contiguity check, substitution logic, and provenance become integer arithmetic. `messageIdStart/End` + timestamps stay (cheap, useful for direct lookups and time-scoped queries); `messageIdsRaw` **dropped** — fully derivable from the range.
- `provenanceId` reformatted to `${conversationId}-${ordinalStart}-${ordinalEndExclusive}-${schemaVersion}` — compact, debuggable, deterministic per range+era (cuid2 contains no dashes; parsing is unambiguous).
- **No duplicate plain `@@index([storeId])`/`@@index([contextId])`** — that duplication is what got the partial indexes dropped (§1.1). The mapped declarations are the only ones, backed by raw SQL.
- `chunkingState` unchanged (QUEUED → CHUNKING → EMBEDDING → INDEXED / ERROR); `summaryState` added as an independent axis. `retryCount` bounds embed retries, `summaryRetryCount` bounds summary retries.
- `MemoryChunkBoundaryReason` gains `MESSAGE_COUNT` — the primary trigger deserves a non-lying label; `TOKEN_LIMIT` marks forced flushes.
- Context: `lastChunkedMessageId`/`lastChunkedMessageIndex` **replaced** by `lastIndexedOrdinalExclusive` — unambiguous, and identical to the next section's `ordinalStart` by construction.
- `Message.conversationMemoryChunkId` stays as-is, backfilled per range after INDEXED (fast path for substitution; `onDelete: SetNull` already correct).

---

## 4. Voyage plumbing (nearly zero net-new)

- `embedChunksContextual` already defaults `voyage-context-4`, `output_dimension: 1024` — the memory path calls it with `inputs: [[sectionTranscript]]`, `input_type: "document"` for indexing and `inputs: [[query]]`, `input_type: "query"` at search time.
- `countTokens(texts, "voyage-context-4")` — the exact batched Python-bridge counter. Two calls per indexing pass, both batched: one over rendered per-message strings (drives partition boundaries via prefix sums), one over assembled section transcripts (stored `tokenCount` + ceiling verification). Zero per-candidate calls in the DP loop; the approximation stays unused.
- Budget constants live comfortably inside context-4's limits (32k/input, 120k/request): `targetSectionTokens ≈ 8_000`, `maxSectionTokens ≈ 24_000` leaves generous margin for endpoint-side special tokens.
- Housekeeping: `apps/ws-server/src/voyage/types.ts` currently carries a stray scratch line (`type O = Voyage.ModelUnion`) — drop it whenever convenient.

---

## 5. The migration (one migration, `migrate dev --create-only` + hand edits)

### 5.1 Prisma-expressible parts
Everything in §3 except trigger functions and partial-index `WHERE` clauses.

### 5.2 Raw SQL — tsvector trigger + GIN

```sql
CREATE OR REPLACE FUNCTION conversation_memory_chunk_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW."searchTsv" :=
    setweight(to_tsvector('english', COALESCE(NEW."summary", '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW."transcriptMarkdown", '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_memory_chunk_search_tsv
  BEFORE INSERT OR UPDATE OF "transcriptMarkdown", "summary" ON "ConversationMemoryChunk"
  FOR EACH ROW
  EXECUTE FUNCTION conversation_memory_chunk_tsv_trigger();

CREATE INDEX IF NOT EXISTS idx_memory_chunk_search_tsv
  ON "ConversationMemoryChunk" USING GIN ("searchTsv");
```

`NEW` carries the whole row, so a summary-only UPDATE recomputes the composite against the existing transcript correctly. `UPDATE OF` matches the SET list, not value changes — state/retry/embedding updates never touch these columns, so they never fire the trigger (same discipline as `20260311035622`, whose comment documents exactly this). The upsert-style `DO UPDATE SET "transcriptMarkdown" = ...` from the old `insertMemoryChunk.sql` disappears with the rewrite (§6.1), so claim-insert conflicts can't re-fire it either.

### 5.3 Raw SQL — partial index repair (the memory twins of §1.1)

```sql
-- Restore partials dropped by 20260213034322; supersede the plain full-btree twins.
DROP INDEX IF EXISTS "ConversationMemoryChunk_storeId_idx";
DROP INDEX IF EXISTS "ConversationMemoryChunk_contextId_idx";
DROP INDEX IF EXISTS "idx_memory_chunk_store_indexed";
DROP INDEX IF EXISTS "idx_memory_chunk_context_indexed";

CREATE INDEX IF NOT EXISTS idx_memory_chunk_store_indexed
  ON "ConversationMemoryChunk" ("storeId")
  WHERE embedding IS NOT NULL AND "chunkingState" = 'INDEXED' AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_memory_chunk_context_indexed
  ON "ConversationMemoryChunk" ("contextId")
  WHERE embedding IS NOT NULL AND "chunkingState" = 'INDEXED' AND "deletedAt" IS NULL;
```

The HNSW index is untouched — `20260130031307` built it correctly (`vector_cosine_ops, m = 16, ef_construction = 64`) and it matches the `<=>` operator in every search query.

### 5.4 Optional belt-and-suspenders — range-overlap exclusion

The CAS design (§9) makes overlapping ranges impossible by construction; if you want the database to *prove* it:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "ConversationMemoryChunk"
  ADD CONSTRAINT memory_chunk_no_range_overlap
  EXCLUDE USING gist (
    "conversationId" WITH =,
    ("schemaVersion"::text) WITH =,
    int4range("ordinalStart", "ordinalEndExclusive") WITH &&
  ) WHERE ("deletedAt" IS NULL);
```

Extension precedent: `pg_trgm` (`20260218234559`). Note `ON CONFLICT DO NOTHING` is legal against exclusion constraints (`DO UPDATE` is not) — compatible with the claim insert. Verify the expression-index acceptance on your PG version during implementation; drop this constraint before dropping the feature if it fights.

### 5.5 Sequencing & drift check

1. Edit `memory.prisma` to §3 → `pnpm prisma migrate dev --create-only` → hand-edit in §5.2–§5.4 → `migrate dev`.
2. Rewrite/add the SQL files (§6) **in the same change-set** — the current `insertMemoryChunk.sql` references the dropped `messageIdsRaw` (lines 11/37/74) and stale lifecycle; `db:generate` breaks until it's rewritten.
3. `db:generate` → `pnpm typecheck`.
4. Drift check: one more `--create-only` → expect "no schema changes" (delete the empty artifact). This is the proof the diff engine won't re-drop the partials (§1.1).
5. PR note for anyone pulling the branch: migrate before building (`prebuild` runs `db:generate`, which validates SQL against the live DB).

---

## 6. SQL surface

### 6.1 Rewritten: `insertMemoryChunk.sql` → claim insert

No embedding at insert; state `CHUNKING`; transcript included (NOT NULL — render *before* claiming; messages are already in memory). New params replace `messageIdsRaw` with the ordinal pair; add `rendererVersion`, `transcriptIncludesThinking`. Tail becomes:

```sql
ON CONFLICT DO NOTHING
RETURNING id, "provenanceId", "chunkingState"::text AS "chunkingState";
```

Bare `DO NOTHING` (no conflict target) is deliberate: post-CAS it should never fire; if it does, zero rows returned is the tell and the worker logs + stops rather than guessing which constraint tripped.

### 6.2 New: `claimMemorySection.sql` — the watermark CAS

```sql
-- @param {String} $1:conversationId
-- @param {Int}    $2:expectedWatermark
-- @param {Int}    $3:ordinalEndExclusive

UPDATE "ConversationMemoryContext"
SET "lastIndexedOrdinalExclusive" = $3,
    "lastChunkedAt"               = NOW(),
    "updatedAt"                   = NOW()
WHERE "conversationId" = $1
  AND "lastIndexedOrdinalExclusive" = $2
RETURNING id, "storeId", "lastIndexedOrdinalExclusive";
```

Zero rows ⇒ lost the race (or stale view) ⇒ stop the pass. One row ⇒ proceed to the claim insert **in the same interactive transaction** (`$transaction(async tx => ...)` with `tx.$queryRawTyped` — no exceptions for control flow: a failed CAS wrote nothing, so early-return a discriminated `{ claimed: false } as const`).

### 6.3 New: `updateMemoryChunkEmbedding.sql` — the *only* path to INDEXED

```sql
-- @param {String} $1:chunkId
-- @param {String} $2:embedding

UPDATE "ConversationMemoryChunk"
SET embedding       = $2::vector,
    "embeddedAt"    = NOW(),
    "chunkingState" = 'INDEXED'::"MemoryChunkingState",
    "chunkingError" = NULL,
    "updatedAt"     = NOW()
WHERE id = $1
RETURNING id, "provenanceId", "chunkingState"::text AS "chunkingState";
```

Correspondingly, `updateMemoryChunkState.sql` **loses** its `embeddedAt`-when-INDEXED arm and keeps error/retry transitions only — one owner per transition, or the generic setter can mint INDEXED rows with NULL embeddings.

### 6.4 New: `updateMemoryChunkSummary.sql`

Sets `summary`, `summaryState = 'READY'`, `summaryModel`, `summaryProvider`, `summaryPromptVersion`, `summaryTokens`, `summaryGeneratedAt = NOW()`. The trigger refreshes `searchTsv` automatically (`UPDATE OF summary`). A failure path sets `summaryState = 'ERROR'` + `summaryError` via `updateMemoryChunkState.sql`'s summary arm (or a small dedicated setter — implementer's choice, same rule: one owner per transition).

### 6.5 New: `findStaleMemoryClaims.sql`

```sql
-- @param {String} $1:storeId
-- @param {Int}    $2:staleMinutes
-- @param {Int}    $3:maxRetries

SELECT id, "provenanceId", "conversationId", "contextId",
       "ordinalStart", "ordinalEndExclusive", "transcriptMarkdown",
       "chunkingState"::text AS "chunkingState", "retryCount"
FROM "ConversationMemoryChunk"
WHERE "storeId" = $1
  AND "chunkingState" IN ('CHUNKING'::"MemoryChunkingState", 'EMBEDDING'::"MemoryChunkingState")
  AND "updatedAt" < NOW() - make_interval(mins => $2)
  AND "retryCount" < $3
  AND "deletedAt" IS NULL
ORDER BY "createdAt" ASC;
```

Store-scoped on purpose: any tick for a user can rescue a *different* conversation whose claim crashed and never got another message (the reclaim = re-embed the stored transcript; never re-partition).

### 6.6 New: the hybrid pair

`searchConversationMemoryHybrid.sql` (storeId-scoped, inter-conversation) and `searchMemoryByConversationHybrid.sql` (contextId-scoped, intra-conversation) — structural clones of `searchUserStoreChunksHybrid.sql`: a `semantic_ranked` CTE (`1 - (embedding <=> $::vector)` with threshold + limit) and a `fulltext_ranked` CTE (`ts_rank_cd("searchTsv", websearch_to_tsquery('english', $terms))`), `UNION ALL` with a `signal` discriminator and `appearsInBothSignals`. Deltas from the template:

- Both CTEs filter `"chunkingState" = 'INDEXED'`, `"deletedAt" IS NULL`; the semantic CTE additionally filters `"embeddingModel" = $n` (the context-3/context-4 vector spaces are not comparable — this is the one-line insurance both prior docs demanded).
- `INNER JOIN "Conversation" c ON mc."conversationId" = c.id` → select `c.title AS "conversationTitle"` (authoritative, vs. the context's snapshot copy). The store-scoped variant needs this so the model can cite *where* a memory came from; the context-scoped variant knows its conversation but returns the title anyway for uniform result shapes.
- Returned columns: `id, provenanceId, conversationId, conversationTitle, contextId, chunkIndex, ordinalStart, ordinalEndExclusive, messageTimestampStart, messageTimestampEnd, summary, transcriptMarkdown, tokenCount, boundaryReason, providerModelsRaw, hasAttachments, score, rank, signal, appearsInBothSignals`. (Service-side formatting excerpts the transcript; SQL returns it whole — same as the userstore pattern returning full `content`.)
- Optional param set mirrors the tool surface: `ordinalStartFloor?`/`ordinalEndCeiling?` for range-pinned searches.

### 6.7 Patched: the legacy pure-cosine pair

`searchConversationMemory.sql` / `searchMemoryByConversation.sql` gain `AND mc."embeddingModel" = $n AND mc."deletedAt" IS NULL` — they stay useful as the no-`search_terms` fast path (mirroring how `searchUserStoreChunksByStoreAndModel` coexists with the hybrid), and `getMemoryChunksByConversation.sql` gains the `deletedAt` filter.

---

## 7. Transcript renderer (repurposed from `transcript-gen.ts`, as a pure function)

The generator's DP partitioner is 90% of the sectioner; the renderer needs four changes and one deletion:

1. **Order by `ordinal ASC`, never `createdAt`** — same-millisecond ties exist; ordinal is the authoritative sequence (the current script orders by `createdAt` and renders array-index message numbers; both go).
2. **The rendered number IS the ordinal** (0-based, matching the DB), not a 1-based display counter:

   ```markdown
   12. claude-sonnet-5 (anthropic) · 2026-06-28T21:15:02.101Z

   {content}

   [attachments: report.pdf → userStore:{provenanceId}]

   13. andrew (user) · 2026-06-28T21:17:44.009Z

   {content}
   ```

   Numbered-markdown style is retained from `transcriptFormat` (provider remaps `grok→xai`, `gemini→google` included) — proven readable, and free of XML-ish wrappers, so the tsvector trigger needs no tag stripping (the `<model>` wrapper concern from opus-4-8-max.md is already handled by `sanitizeBlockContent`).
3. **Thinking excluded by default** (`transcriptIncludesThinking = false` recorded on the chunk); `TEXT` blocks only. `ENCRYPTED_THINKING` never renders.
4. **Strip ` `** from every content string — Postgres `text` rejects null bytes at the claim insert, not just in `to_tsvector` (the backfill script learned this the hard way).
5. **Delete the Roman-numeral file plumbing from the live path** (`toRoman`, `transcriptPartPath`, `removeStaleTranscriptParts`) — `chunkIndex` supersedes it. Keep the script itself as a debug/export tool; dumping a conversation's sections to disk for eyeballing stays valuable (and is the Phase-3 verification harness, §14).

Attachments render as provenance links (`filename → userStore:{provenanceId}`) — the traversal hop into the user store without inlining binary content.

### 7.1 Sectioner

`transcriptPartitionConfig` swaps line units for token units: `{ targetSectionTokens: 8_000, maxSectionTokens: 24_000, minSectionTokens: 2_000 }`. The DP (`prefixLineCounts` → `prefixTokenCounts`, `partitionPenalty` unchanged in shape: distance-from-target ×10 + band penalty, tie-break fewer parts) runs over **exact per-message token counts of the rendered per-message markdown** — one batched `countTokens(renderedMessages, "voyage-context-4")`, prefix sums, zero calls in the inner loop. Boundaries fall only at message edges (the DP already iterates message-wise, so this is free). After partitioning, one more batched exact count over the assembled section transcripts sets stored `tokenCount` and asserts the ceiling.

Edge: a single message whose rendered form alone exceeds `maxSectionTokens` becomes its own section, `boundaryReason: TOKEN_LIMIT`; if it approaches the 32k hard ceiling, embed a truncated rendering and keep the full transcript in the row (the summary pass and fulltext lane see everything; only the vector is lossy). At chat scale this is a near-nonexistent case — handle it with a guard, not machinery.

---

## 8. Service architecture

Mirror the store's two-tier shape exactly (no barrel files, explicit `.ts` imports):

```
apps/ws-server/src/memory/workup.ts        ConversationMemoryWorkupService
apps/ws-server/src/memory/vector-store.ts  ConversationMemoryVectorService extends ConversationMemoryWorkupService
apps/ws-server/src/memory/types.ts         params/results/config interfaces
apps/ws-server/src/prisma/memory.ts        PrismaConversationMemoryService (new chain link)
```

**`ConversationMemoryWorkupService`** (infra tier — analog of `UserStoreWorkupService`): renderer, sectioner, exact-token plumbing, registries, `ensureMemoryStore(userId)` / `ensureMemoryContext(conversationId, userId)` (check-then-create, never try/catch-create).

**`ConversationMemoryVectorService`** (orchestration tier — analog of `UserStoreVectorService`): `onTurnPersisted` (§9), claim/embed/index, reclaim, summary pass (§10), `searchMemoryHybrid` / `searchMemory`, `formatPartitionedMemoryResults` (clone of `formatPartitionedResults` with conversation metadata), tool-input parsing via the already-generalized `parseUserStoreArgs(raw, toolName)`.

**Registries** (purpose-specific, orchestration-owned; CLAUDE.md registry pattern):

```ts
/** userId → memory storeId (immutable once created; ConversationMemoryStore.userId is @unique) */
protected memoryStoreRegistry = new Map<string, string>();
/** conversationId → { contextId, storeId } (immutable ids only) */
protected contextRegistry = new Map<string, MemoryContextRegistryEntry>();
/** conversationId → in-flight indexing pass; delete-on-settle (same-instance dedup only) */
protected indexingInFlight = new Map<string, Promise<void>>();
```

**The watermark is never cached in-process.** It's multi-instance mutable state; the CAS reads it from the DB every pass. Caching it would reintroduce the §9.1 race through the back door.

**`PrismaConversationMemoryService`** — new link in the chain documented at `src/prisma/index.ts:5-54` (suggested: `PrismaService extends PrismaConversationMemoryService extends PrismaConvoHydrationService`), preserving the 3-arg `(prisma, extractor, isProd)` constructor. Contents: typed-SQL wrappers (`claimMemorySectionTyped`, `insertMemoryChunkTyped`, `updateMemoryChunkEmbeddingTyped`, `updateMemoryChunkSummaryTyped`, `findStaleMemoryClaimsTyped`, `searchMemoryHybridTyped`, …), context/store CRUD, `getMaxOrdinalExclusive(conversationId)` (`MAX(ordinal) + 1` — **not** `COUNT(*)`; density is an observation, not an invariant), `getMessagesByOrdinalRange(conversationId, start, endExclusive)` (ORDER BY ordinal ASC, with blocks + attachments), `backfillMessageChunkIds(conversationId, start, endExclusive, chunkId)`. No cache writes inside CRUD.

**Wiring in `src/index.ts`:**

```ts
const memory = new ConversationMemoryVectorService(logger, voyage, prisma, cfg.VOYAGE_API_KEY); // after userStore (~line 96)
// ... providers constructed ...
// AnthropicService gains a memory param (tools); Resolver gains one (hook)
const providers = new ProviderService({ ... });
memory.setProviders(providers); // summarizer needs providers; providers need... nothing from memory-at-construction
```

The summarizer↔providers cycle is broken with setter wiring — established precedent: `wsServer.setResolver(resolver)` / `setTTSService` (`src/index.ts:341-342`). Constructor injection everywhere else.

---

## 9. The worker loop — no job table; the watermark CAS is the claim

Hook (orchestration layer, provider-agnostic): in `resolver/chat.ts handleAIChat`, after the provider handler resolves:

```ts
void this.memory.onTurnPersisted(conversationId, userId); // fire-and-forget, watermark-driven, idempotent
```

### 9.1 Why not "chunk row as claim" alone (the race both prior designs miss)

Unique constraints reject *identical* tuples, not *overlapping* ranges — `[0,8)` and `[0,7)` coexist. Concretely, with two Fargate tasks (or a double-fired hook):

1. Instance A reads watermark 0, sees 12 messages → partitions `[0,7) [7,12)`, chunkIndex 0,1.
2. Instance B reads watermark 0, sees 14 (two more landed) → partitions `[0,8) [8,14)`, chunkIndex 0,1.
3. A inserts `[0,7)`#0 ✓. B's `[0,8)`#0 conflicts on `(contextId, chunkIndex)` → skipped. B inserts `[8,14)`#1 ✓. A's `[7,12)`#1 conflicts → skipped.
4. Coverage: `[0,7)` + `[8,14)`; watermark bumps to 14. **Ordinal 7 is orphaned inside the watermark forever** — no row exists for it, so row-based reclaim can never repair it. Other interleavings yield double-indexed overlaps instead of gaps.

A GPT-5.5-style job table with `SKIP LOCKED` also fixes this — at the cost of the codebase's first queue table, lease bookkeeping, and a second state machine that can disagree with the chunk's. The CAS gets the same guarantee from a column that already needed to exist.

### 9.2 The pass

```
onTurnPersisted(conversationId, userId):
 1  in-process gate: indexingInFlight.get(conversationId) → return if present (optimization only)
 2  ensure store + context (registry → check-then-create)
 3  maxEnd = MAX(ordinal) + 1;  watermark = context.lastIndexedOrdinalExclusive (fresh read)
 4  if (maxEnd - watermark < messageThreshold /* ≈12 */):
       reclaim stale claims for this store (findStaleMemoryClaims → re-embed stored transcripts, retryCount++)
       return
 5  fetch messages [watermark, maxEnd) ORDER BY ordinal ASC
       assert rows.length === maxEnd - watermark  → bail + warn on sparse (density is checked, not assumed)
 6  render per-message markdown → batched exact countTokens → prefix sums → DP partition
       sections chain from the watermark; a tail below minSectionTokens is simply not claimed
 7  for each section, in order:
       transcript = join(section)               // rendered BEFORE claiming — transcriptMarkdown is NOT NULL
       $transaction:
         claimMemorySection(conversationId, expected = section.start, end = section.end)
           → 0 rows ⇒ { claimed: false } ⇒ STOP the whole pass (someone else owns the chain now)
         insertMemoryChunk(claim row: CHUNKING, embedding NULL, transcript, hashes, ordinals, …)
       // post-commit, outside the transaction:
       embedChunksContextual({ inputs: [[transcript]], input_type: "document", model: "voyage-context-4", output_dimension: 1024 })
       updateMemoryChunkEmbedding(chunkId, vector)          // → INDEXED (sole owner of that transition)
       backfillMessageChunkIds(range → conversationMemoryChunkId)
       void summarizeChunk(chunk)                            // §10, independent lifecycle
 8  update context aggregates (chunkedTurns, totalTokens, contributingProviderModelsRaw) + store counters
```

Properties worth stating:

- **No overlaps, no gaps, by construction** — each section's claim requires the watermark to equal its `ordinalStart`; sections form an unbroken chain. Losing a CAS means another instance owns the chain; stopping is correct, not a failure.
- **Crash between commit and INDEXED** leaves a `CHUNKING`/`EMBEDDING` row *already inside the watermark* holding its transcript — reclaim re-embeds the stored transcript (never re-partitions), bounded by `retryCount < maxEmbedRetries` → `ERROR` terminal.
- **A conversation whose claim crashed and never gets another message** is rescued by the store-scoped reclaim on any tick for that user (step 4), and lazily at search time if desired.
- **`boundaryReason`**: `MESSAGE_COUNT` for threshold-driven sections, `TOKEN_LIMIT` for forced flushes (oversized accumulation or the §7.1 single-message edge).
- The `contentHash` (`sha256(transcript + ordinalStart + ordinalEndExclusive + schemaVersion)`) makes any future re-run of the same range collapse detectably.

---

## 10. The summary pass (quality over cost — user decision)

Per INDEXED chunk, fire-and-forget, never blocking anything:

```ts
interface MemorySummarizerConfig {
  provider: Provider;              // lowercase union used by providers.getInstance
  model: string;                   // narrowed against the registry union for that provider
  promptVersion: "memory-summary-v1";
  maxOutputTokens: number;         // ~1_500–2_000
}
```

- **Model**: config-pinned frontier, vision + document capable — the user's shortlist: gpt-5.5-xhigh, sonnet-4.6/sonnet-5, grok-4.3/grok-4.20-reasoning. All resolvable through `providers.getInstance(cfg.provider)`; recorded per-chunk (`summaryModel`/`summaryProvider`/`summaryPromptVersion`), so switching models mid-history is provenance-clean. Non-retained calls (`store: false`-style), per the `titleGenUtil` precedent.
- **Input**: the chunk's `transcriptMarkdown`, plus — because the model is vision/document-capable and `hasAttachments` says when it matters — the section's attachments resolved from `attachmentProvenanceIdsRaw` → CDN URLs, passed as image/document blocks. Rich conversations (code, PDFs, screenshots) get summaries informed by what was actually shown, not just what was said.
- **Prompt mandates** (these conversations are dense — the summary must preserve retrieval hooks, not prose-ify them): decisions made and their rationale; code entities (files, functions, types, commands) by exact name; constraints and invariants established; open threads / unresolved questions; corrections the user issued; ordinal citations for anything a future reader might want to expand (`"…decided X (msgs 41–44)"`).
- **Writes**: `updateMemoryChunkSummary` (trigger refreshes `searchTsv` — summary hits now outrank transcript hits at weight A); failures → `summaryState: ERROR` + `summaryError`, bounded by `summaryRetryCount`. The chunk stays semantically searchable at INDEXED throughout — embedding success and summary failure are independent axes.
- **Rolling summary fold**: after a chunk summary lands, fold it into `context.rollingSummary` **in chunkIndex order**, guarded by a CAS on `rollingSummaryUpdatedAt` (two instances summarizing different chunks of one context must not interleave folds out of order). The rolling summary is the cheap whole-conversation digest; per-chunk summaries are the precision units.

---

## 11. Tools (Anthropic first, then clockwork)

Defs live beside `fileSearchTool` (`anthropic/vector-store.ts`); dispatch arms join the PTC loop (`anthropic/index.ts`, the `acc.name === "file_search"` neighborhood); execution lives on `ConversationMemoryVectorService` so the other 13 providers' rollout is a mechanical copy of each provider's `file_search` arm — the exact shape already proven 14 times over.

### `conversation_memory_search`

```jsonc
{
  "query":            "string (required) — semantic query",
  "search_terms":     "string? — engages the fulltext lane (websearch syntax: quoted phrases, OR, -negation)",
  "scope":            "\"current_conversation\" | \"all_conversations\" (default current)",
  "max_results":      "number? (default 5, clamp 1–25)",
  "threshold":        "number? — cosine floor, default 0",
  "include_transcript": "boolean? (default false — summaries + excerpts unless asked)"
}
```

`scope` is the intra/inter switch: `current_conversation` → contextId-scoped hybrid; `all_conversations` → storeId-scoped hybrid (store is per-user unique, so store-scope *is* user-scope). Results: partitioned `semantic_results` / `fulltext_results` / `overlap_results` (the `formatPartitionedResults` shape, reused), each row carrying `conversationId`, `conversationTitle`, `ordinal_start`, `ordinal_end_exclusive`, `summary`, transcript excerpt (or full transcript when requested), timestamps, `match_type`. The model can cite "in *{title}*, messages 40–58" — inter-conversation traversal is only useful if the model can name where a memory came from.

### `conversation_memory_get_chunk`

```jsonc
{
  "chunk_id":        "string? — direct fetch",
  "conversation_id": "string? — with ordinal: fetch the chunk covering that ordinal",
  "ordinal":         "number?",
  "direction":       "\"previous\" | \"next\"? — neighbor via chunkIndex arithmetic",
  "include_transcript": "boolean? (default true here — this IS the expansion call)"
}
```

Search finds the doorway; traversal walks the room. `direction` hops `chunkIndex ± 1` within the context — no graph machinery needed, the chain is already total ordering.

Tool descriptions follow the `fileSearchTool` house style (the "Partitioned Foraging" register): tell the model summaries are weighted above transcripts in the fulltext lane, that `scope: "all_conversations"` reaches across the user's history, and that `get_chunk` is the cheap way to expand a hit before quoting it.

---

## 12. Assembly-time substitution (config-gated; the "summary in history" half)

Per the user's clarification: this never touches DB rows or ordinal numbering — it only changes the history payload hand-formatted per provider. Anthropic's formatter (`formatAnthropicHistoryWithFiles`) goes first, behind config:

```ts
interface MemoryCompactionConfig {
  enabled: boolean;              // default false until proven in dev
  liveWindowMessages: number;    // ≈20 — newest N ordinals always render verbatim
}
```

Algorithm at history-format time: for each chunk with `summaryState: READY` whose range lies entirely below `maxOrdinal - liveWindowMessages`, collapse its covered messages into one block:

```markdown
[memory · messages 24–41 of this conversation · summarized]
{chunk.summary}
(full transcript: conversation_memory_get_chunk, ordinal 24)
```

Two rules that matter:

- **Only whole chunks, only READY summaries.** Partial substitution re-splits sections and confuses citations; substituting before the summary lands would inject placeholders.
- **Snap to chunk boundaries for prompt-cache stability.** The substituted prefix changes only when a *new chunk's summary lands* — not on every message — so long conversations keep their Anthropic prompt-cache hits instead of invalidating the prefix every turn. (This is the detail that makes compaction pay for itself rather than costing cache misses.)

The payoff loop closes: the live window stays bounded, the detail stays one `conversation_memory_search` away, and the tool can quote exact transcripts the compacted history no longer carries.

---

## 13. Explicit non-goals for v1 (deferred, not forgotten)

- **Message-granular embeddings** (context-4's `[[msg0, msg1, …]]` mode) — revisit if section-level recall disappoints; it multiplies rows and breaks one-summary-per-section.
- **Sliding-window neighbor context** (adjacent sections in one inner array) — complicates idempotency; re-embedding one section would perturb neighbors.
- **Join tables** (chunk↔message roles, provider-model, attachment edges) — derivable from ordinal ranges + raw fields until multi-era reindexing is real.
- **WS events for indexing status** — fully server-side; add to `AnyEvent` in `packages/types/src/events.ts` only if the UI ever wants a "memory indexed" affordance.
- **Durable job table** — the CAS + state machine covers v1 scale (single-digit users); reconsider only if memory work ever needs cross-service workers.
- **13-provider tool rollout** — mechanical follow-up once Anthropic proves the shape.
- **Cross-branch contentHash dedup**; **message-edit invalidation** (blocked on append-only assumption changing); **re-ranking / fusion scoring** across the two signals.

---

## 14. Implementation phases (each independently verifiable)

1. **Migration + SQL** — §3 schema, §5 raw SQL (trigger, partial-index repair, optional exclusion), §6 rewrites/additions, `db:generate`, `pnpm typecheck`, drift check (`--create-only` → empty).
2. **Prisma chain link** — `PrismaConversationMemoryService` + chain JSDoc update. Typecheck.
3. **Workup tier** — renderer + sectioner, verified standalone: a transcript-gen-style dry-run script (`src/test/memory-section-dryrun.ts`) that takes a real, rich conversation id, renders sections, prints ordinal ranges + exact token counts + boundaries to `__out__` for eyeballing. This is the highest-value checkpoint before anything writes to the DB.
4. **Vector tier + resolver hook** — claim/embed/index loop live in dev; accumulate past the threshold in a real chat; watch rows go CHUNKING → INDEXED in DBeaver; kill the server mid-pass and watch reclaim finish the job.
5. **Summary pass** — pin the summarizer config, verify summary + `searchTsv` weighting (`ts_rank_cd` favors summary hits) + rolling-summary fold ordering.
6. **Anthropic tools** — both tools in the PTC loop; e2e: ask the model something answerable only from an old indexed section, intra- then inter-conversation.
7. **Assembly-time compaction** — behind `enabled: false` → dev-flag on → verify prompt-prefix stability across turns (cache-hit telemetry) and that citations survive.
8. **Provider rollout** — mechanical, one provider per small PR, `file_search` arm as the template.

---

## 15. Config reference (one typed object, `as const satisfies`)

```ts
export const conversationMemoryConfig = {
  messageThreshold: 12,          // unindexed ordinals before a pass claims sections
  targetSectionTokens: 8_000,    // DP target band center
  maxSectionTokens: 24_000,      // hard ceiling per section (context-4 input limit 32k, margin deliberate)
  minSectionTokens: 2_000,       // tail below this stays unclaimed
  staleClaimMinutes: 10,         // CHUNKING/EMBEDDING older than this is reclaimable
  maxEmbedRetries: 3,
  maxSummaryRetries: 2,
  embeddingModel: "voyage-context-4",
  embeddingDim: 1024,
  summarizer: {
    provider: "anthropic",       // ↔ user's frontier shortlist; swap freely, provenance is per-chunk
    model: "<pinned frontier vision-capable model>",
    promptVersion: "memory-summary-v1",
    maxOutputTokens: 2_000
  },
  compaction: {
    enabled: false,              // Phase 7 flips this in dev first
    liveWindowMessages: 20
  }
} as const satisfies ConversationMemoryConfig;
```

---

*— Fable 5*

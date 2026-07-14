# HMEM Retrieval Outlook: Provider-Bias Telemetry Plan

> Sol assessment, 2026-07-12. This plans the read-path observability proposed in
> `outlook.md`; it does not change retrieval behavior, ranking, or provider tool
> contracts.

## 0. Decision

Build this, but do not implement the single `memory_retrieval_event` table from
the sketch literally.

The useful unit is an append-only hierarchy of immutable facts:

1. **Retrieval session**: one provider/model invocation in which the memory
   tools were available. This is the opportunity denominator, including turns
   where the model never calls a memory tool.
2. **Search call**: one parsed `conversation_memory_search` invocation,
   including zero-result and operational-failure outcomes.
3. **Search hit**: one unique chunk exposed by that search, with independent
   semantic and fulltext rank/score observations.
4. **Chunk read**: one `conversation_memory_get_chunk` invocation, including
   the anchor chunk, resolved chunk, direction, and not-found outcome.

Counts, first-read/re-read classification, expansion attribution, traversal
depth, provider divergence, and the Narcissus coefficient remain derived
analytics. No mutable counter belongs on a chunk, provider, or context row.

This is a good fit for HMEM. The retrieval implementation is shared, chunk
provenance is stable, source speaker composition is already retained, and the
semantic/fulltext ranker is provider-independent. Provider/model differences
therefore enter mainly through query formulation and post-result reading
choices. The telemetry can distinguish those stages without changing either.

## 1. Verified Baseline

The following are current code facts the design must preserve:

- Prisma identifiers for users, conversations, messages, memory contexts, and
  memory chunks are `String @default(cuid(2))`, not UUIDs. Provider-native tool
  call IDs are also strings and are sometimes absent (notably Gemini).
- `Provider` in `packages/db/prisma/schema/schema.prisma` is the authoritative
  database enum. Runtime lower-case providers already have a canonical
  `toPrismaFormat`/`providerToPrismaFormat` conversion.
- `searchConversationMemoryHybrid.sql` and
  `searchMemoryByConversationHybrid.sql` return one row per chunk **per lane**.
  A chunk found by both lanes appears twice, with a distinct rank and score in
  each lane.
- `formatMemoryResults` keeps two ordered arrays and exposes the same overlap to
  the model in both arrays. Collapsing that to `lane = both` plus one rank would
  destroy one of the two rank observations.
- `getMemoryChunkForTool` first resolves an anchor by chunk ID or
  conversation+ordinal, then optionally moves to `previous` or `next`. Both the
  anchor and resolved chunk are available before the response is serialized.
- The shared service entry points are
  `ConversationMemoryVectorService.searchMemoryFromToolInput` and
  `getMemoryChunkFromToolInput`, but their present arguments omit provider,
  model, user-message/turn identity, provider tool-call ID, and tool round.
- Memory tools attach unconditionally to ordinary provider chat requests,
  independently of user-store documents. Internal summarizer/fold tool calls
  can also enter the same shared service and must not be mixed silently into
  chat-provider statistics.
- There are currently 15 adapter files calling both shared entry points (the 14
  provider surfaces plus OpenAI's image-generation response path). The rollout
  must be compile-driven across every caller, not sampled across two providers.

## 2. Data Model

Use four purpose-specific models in `memory.prisma`. Separate search and read
facts instead of creating a nullable, context-dependent mega-event row. The
names below are recommended; exact relation-field names can follow Prisma's
generated requirements.

### 2.1 Enums

```text
MemoryRetrievalSurface
  CHAT
  INTERNAL_SUMMARIZER

MemoryRetrievalToolVersion
  v1_0

MemoryRetrievalRankerVersion
  v1_0

MemoryRetrievalSearchScope
  CURRENT_CONVERSATION
  ALL_CONVERSATIONS

MemorySearchOutcome
  RESULTS
  EMPTY_NO_STORE
  EMPTY_NO_CONTEXT
  EMPTY_NO_MATCH
  EMBEDDING_FAILED
  ERROR

MemoryReadRequestMode
  BY_ID
  BY_ORDINAL

MemoryReadDirection
  PREVIOUS
  NEXT

MemoryReadOutcome
  FOUND
  NO_STORE
  NOT_FOUND
  NO_NEIGHBOR
  ERROR
```

Do not add `SEARCH_HIT`, `EXPANSION_READ`, and `TRAVERSAL_READ` as a single
event-kind enum. Search exposure and chunk consumption have different required
fields and different failure semantics. A found read with a direction is a
traversal; a found read without one is a base read. It is an **attributed
expansion** only when an earlier search in the same session exposed the resolved
chunk.

### 2.2 `MemoryRetrievalSession`

One row means the final provider request had the HMEM tools available.

| Field | Shape | Purpose |
|---|---|---|
| `id` | `String @id @default(cuid(2))` | Server identity for the provider invocation |
| `userId` | `String` | Ownership and mandatory analytics scope |
| `conversationId` | `String` | Conversation where retrieval was available |
| `userMessageId` | `String?` | Chat-turn identity; required for `CHAT`, nullable for internal work |
| `surface` | `MemoryRetrievalSurface` | Keeps internal summarizer reads out of chat statistics by default |
| `provider` | `Provider` | Canonical database provider |
| `model` | `String` | Exact model ID used for this invocation |
| `toolVersion` | `MemoryRetrievalToolVersion` | Tool descriptions and provider-visible result contract |
| `occurredAt` | `DateTime @default(now())` | Opportunity time |

Recommended indexes: `[userId, occurredAt(sort: Desc)]`,
`[provider, model, occurredAt(sort: Desc)]`, and
`[conversationId, occurredAt(sort: Desc)]`.

Do not make `userMessageId` unique. Retries, parallel fleet arms, and a later
multi-candidate mode can legitimately produce multiple provider opportunities
for one user message. The session ID is the attempt identity.

### 2.3 `MemorySearchCall`

One row is one successfully parsed search tool invocation, whether or not it
returned chunks.

| Field | Shape | Purpose |
|---|---|---|
| `id` | `String @id @default(cuid(2))` | Server call identity |
| `sessionId` | `String` | Opportunity/provider/model owner |
| `providerCallId` | `String?` | Provider-native tool-call ID; never assumed UUID or globally unique |
| `occurredAt` | `DateTime` | Call start time for within-session attribution |
| `durationMs` | `Int` | End-to-end shared-service duration |
| `roundIndex` / `callIndex` | `Int` / `Int` | Zero-based provider round and call position within that round |
| `queryText` | `String @db.Text` | Exact semantic query the provider formulated |
| `queryHash` | `String` | SHA-256 of the effective trimmed UTF-8 query for grouping without text scans |
| `searchTerms` | `String? @db.Text` | Exact fulltext lane input |
| `scope` | `MemoryRetrievalSearchScope` | Current versus all conversations |
| `conversationTitle` | `String?` | Effective fuzzy title filter |
| `maxResults` | `Int` | Clamped effective limit, not the untrusted input |
| `threshold` | `Float` | Clamped effective semantic threshold |
| `embeddingModel` | `String` | Ranker configuration at observation time |
| `rankerVersion` | `MemoryRetrievalRankerVersion` | SQL, lane, and canonicalization semantics |
| `outcome` | `MemorySearchOutcome` | Stable machine-readable reason |
| `errorCode` | `String?` | Stable sanitized code for `ERROR`; never a raw provider/database message |

Recommended indexes: `[sessionId, roundIndex, callIndex]`,
`[queryHash, occurredAt]`, and `[outcome, occurredAt]`. The human-facing `note`
returned by the tool is not an analytics contract and should not be stored as
the outcome.

`queryText` is intentionally retained because query formulation is one of the
primary questions. It has the same user-owned sensitivity class as the stored
transcripts and must follow the same user-deletion boundary. Do not put query
text in routine structured logs.

### 2.4 `MemorySearchHit`

One row is one **unique chunk** served by one search. It preserves both lane
observations rather than duplicating the hit or flattening overlap.

| Field | Shape | Purpose |
|---|---|---|
| `id` | `String @id @default(cuid(2))` | Fact identity |
| `searchCallId` | `String` | Parent search |
| `chunkId` | `String` | Exposed `ConversationMemoryChunk` |
| `semanticRank` / `semanticScore` | `Int?` / `Float?` | Semantic observation, if present |
| `fulltextRank` / `fulltextScore` | `Int?` / `Float?` | Fulltext observation, if present |
| `actorProviderPresent` | `Boolean` | Snapshot: chunk speaker composition included the retrieving provider |

Constraints:

- Unique `[searchCallId, chunkId]`.
- At least one rank/score pair must be present, enforced in migration SQL.
- A rank and its score are both null or both non-null, enforced in migration
  SQL.
- Ranks are positive and scores are finite when present.

Recommended indexes: `[chunkId, searchCallId]` and `[searchCallId]`. Do not copy
`queryText`, provider, model, current conversation, or source conversation onto
every hit; those are stable joins through the parent session and chunk.

`actorProviderPresent` should be computed with a delimiter-aware parser over
`providerModelsRaw` (`::` records, provider before the first `:`), never a
substring match. It is a snapshot of what was true when the result was served,
which makes the preregistered self-retrieval analysis robust to future chunk
representation changes.

### 2.5 `MemoryChunkRead`

One row is one parsed `conversation_memory_get_chunk` invocation. Failed reads
are facts too, so `anchorChunkId` and `resolvedChunkId` are nullable.

| Field | Shape | Purpose |
|---|---|---|
| `id` | `String @id @default(cuid(2))` | Server call identity |
| `sessionId` | `String` | Opportunity/provider/model owner |
| `providerCallId` | `String?` | Provider-native call identity |
| `occurredAt` | `DateTime` | Call start time |
| `durationMs` | `Int` | End-to-end duration |
| `roundIndex` / `callIndex` | `Int` / `Int` | Zero-based provider round and call position within that round |
| `requestMode` | `MemoryReadRequestMode` | ID lookup versus conversation+ordinal lookup |
| `requestedChunkId` | `String?` | Literal requested ID for `BY_ID`; not an FK because hallucinated IDs are valid observations |
| `requestedConversationId` | `String?` | Literal target for `BY_ORDINAL` |
| `requestedOrdinal` | `Int?` | Literal ordinal for `BY_ORDINAL` |
| `direction` | `MemoryReadDirection?` | Null for a base read; set for traversal |
| `anchorChunkId` | `String?` | Chunk resolved before applying direction |
| `resolvedChunkId` | `String?` | Chunk actually returned in full |
| `actorProviderPresent` | `Boolean?` | Snapshot for a found resolved chunk |
| `outcome` | `MemoryReadOutcome` | Found/not-found reason |
| `errorCode` | `String?` | Stable sanitized code for `ERROR` |

Migration checks must enforce the request-mode field matrix, require resolved
chunk fields only for `FOUND`, and require `direction` for `NO_NEIGHBOR`.
Recommended indexes: `[sessionId, roundIndex, callIndex]`,
`[resolvedChunkId, occurredAt]`, and `[outcome, occurredAt]`.

The distinction between `anchorChunkId` and `resolvedChunkId` is load-bearing:
it makes previous/next chains and direction reversals reconstructible without
parsing tool output.

### 2.6 Relations and deletion

- Session belongs to `User`, current `Conversation`, and optionally the user
  `Message`; child facts cascade from the session.
- Hits and resolved reads relate to `ConversationMemoryChunk`; use cascading
  deletion so hard user/conversation deletion also removes retrieval history.
- Ordinary chunk soft deletion (`deletedAt`) leaves telemetry queryable. Hard
  deletion follows the existing privacy boundary and removes the facts.
- Add inverse relation arrays to `User`, `Conversation`, `Message`, and
  `ConversationMemoryChunk` with explicit relation names where Prisma needs
  them.
- Do not add counters or `updatedAt` to any telemetry model. These rows are
  insert-only.

## 3. Runtime Design

### 3.1 Typed execution context

Add one named context type in `apps/ws-server/src/memory/types.ts` and require it
at both shared tool-facing entry points:

```text
MemoryRetrievalExecutionContext
  sessionId
  userId
  conversationId
  userMessageId?
  surface
  provider
  model
  providerCallId?
  roundIndex
  callIndex
```

Generate `sessionId` once per provider invocation, persist the session after the
final tool list is known, and reuse the context for every memory call in that
tool loop. The caller supplies a new `providerCallId`, `roundIndex`, and
`callIndex` for each call. Provider, model, and turn identity must not be
inferred from global service state; the memory service is shared across
concurrent requests.

Here `roundIndex` means a **model-visible decision epoch**, not merely an SDK
loop counter: sibling calls emitted before any sibling result is visible share
an index; increment it after outputs become visible and another call can be
chosen. Sequential programmatic-tool callbacks increment when the prior output
is returned to the calling model/code runtime. `callIndex` orders siblings.
Both values are non-negative and checked by the migration.

The migration can ship before the fleet wiring, but no provider should be
counted as instrumented until it supplies the complete context. Avoid a
long-lived mixed mode where some adapters create anonymous facts.

### 3.2 Preserve structured facts before serialization

Do not `JSON.parse` the tool's own JSON response to recover telemetry.

- Refactor search result preparation into a pure structured result containing
  the unchanged tool-output object plus canonical unique-hit observations.
- Refactor chunk resolution into a discriminated structured result containing
  its outcome, anchor, resolved chunk, and unchanged output object.
- Serialize exactly once at the provider-facing boundary.
- Persist the search call and all its hits atomically in one Prisma transaction.
  Persist each chunk-read fact once resolution completes.

The external tool response shape and ranking order remain unchanged in this
phase. In particular, semantic and fulltext arrays still expose overlap exactly
as they do today.

### 3.3 Outcome capture

Turn today's prose-only early returns into internal discriminants while keeping
their current prose output:

- no memory store;
- no current-conversation context;
- query embedding failure;
- no matching rows;
- base chunk not found/cross-user/deleted;
- previous/next neighbor absent; and
- found result; and
- unexpected retrieval failure with a stable sanitized error code.

Malformed tool input is already rejected before retrieval. Keep it in provider
tool-error telemetry rather than making `queryText` nullable and weakening this
schema. If malformed-call analysis becomes important later, add a separate
general tool-attempt layer for all tools, not a memory-specific exception.

### 3.4 Failure posture

Retrieval telemetry is observational and must not make memory unavailable.

- Await the small telemetry insert so a successful request does not knowingly
  discard its fact.
- Catch telemetry persistence failures at the instrumentation boundary, emit a
  structured warning with session/call IDs but no query text, and return the
  already-built tool response unchanged.
- Do not introduce a queue solely for this feature. If measured write loss later
  warrants durability beyond the request, design that as shared telemetry
  infrastructure rather than a memory-only background queue.
- Never use an in-process mutable counter or registry as the authoritative
  correlation record.

## 4. Derived Analytics

Start with user-scoped TypedSQL queries or ordinary SQL views. Do **not** begin
with materialized views: there is no refresh scheduler in this codebase, and
concurrent refresh requires its own unique-index and operational contract.
Materialize only after row volume and `EXPLAIN (ANALYZE, BUFFERS)` demonstrate a
need.

### 4.1 Canonical attribution view

For each found, non-directional chunk read, attribute it to the most recent
search hit for the same `sessionId` and `resolvedChunkId` from an earlier
provider round. This strict round boundary avoids claiming that the model chose
a hit from a batched search whose output it had not seen yet. Use call position
only to order facts within a round, not to assume that sibling tool outputs were
visible to one another. This yields:

- `attributed_expansion = true` and both lane ranks when a current provider
  search actually served the chunk;
- an unattributed direct read when the ID/ordinal came from history, a prompt,
  or another turn; and
- no false attribution across turns or provider invocations.

Do not persist `originSearchCallId` from an ephemeral map. The deterministic
temporal join over durable facts is auditable and can evolve if attribution
rules change.

### 4.2 Required initial reports

1. **Opportunity and usage funnel** per provider/model:
   sessions -> sessions with search -> searches with results -> unique hits
   served -> attributed expansions -> traversals.
2. **Query formulation**: query length, semantic-only/fulltext-only/hybrid use,
   scope selection, title-filter use, zero-result rate, and repeated query hashes.
3. **Expansion selection**: unique attributed expansions / unique chunks served,
   stratified by lane presence and rank. Raw expansion counts alone are not a
   preference measure.
4. **Traversal appetite**: traversal calls per base read, successful chain depth,
   previous/next balance, direction reversals, and no-neighbor rate.
5. **Cross-conversation reach**: resolved chunk conversation differs from the
   session's current conversation, normalized per session and per successful
   read.
6. **First versus repeat retrieval**: derive with window functions over
   `(userId, chunkId, occurredAt)`; do not store a mutable first-read flag.
7. **Matched-turn comparison**: for a `userMessageId` answered by multiple
   provider sessions, compare tool uptake, query formulation, exposed ranks,
   and read choices within that shared prompt cohort. Report retries as separate
   attempts rather than silently merging them.

### 4.3 Narcissus coefficient

The simple ratio in `outlook.md` is a useful headline but is confounded by what
the ranker served. Report both stages:

- **Exposure rate**: own-provider chunks served / all unique chunks served.
- **Conditional expansion rate**: own-provider chunks expanded / own-provider
  chunks served, compared with non-own expanded / non-own served.

Prefer an odds ratio with counts and confidence interval, plus the intuitive
rate ratio. Stratify or model at least semantic rank, fulltext rank, scope, and
model. Suppress provider/model slices below a preregistered minimum opportunity
and hit count. The claim is about selection conditional on exposure, not raw
retrieval volume.

### 4.4 Distribution divergence and self-excitation

- Compute provider chunk distributions from attributed expansions and from all
  successful reads separately.
- Jensen-Shannon divergence is appropriate for bounded pairwise comparison, but
  report the observation window, smoothing rule, shared support, and sample
  counts beside it.
- Plot first-read and re-read rates by chunk age and time since previous read.
  Join to chunk creation time and ordinal neighborhood to inspect echo effects.
- Treat self-excitation as an observational hypothesis. This log can show
  clustering and feedback-compatible patterns; it cannot establish that a read
  caused later discussion or retrieval without a stronger causal design.

## 5. Implementation Phases

Each phase must be typecheck/build green before the next.

### Phase 0 - Lock the fact contract

- Confirm the four-model split and enum vocabulary.
- Decide the minimum sample thresholds and default analytics window before
  looking at provider comparisons.
- Define `v1_0` tool/ranker boundaries and require a version bump when tool
  descriptions, result presentation, lane logic, or rank canonicalization
  changes.
- Record an `observationStartsAt` deployment timestamp in the decision record.
  Historical retrievals cannot be reconstructed reliably and must not be
  backfilled from message text or logs.

### Phase 1 - Schema and generated client

- Add the enums/models/relations to `packages/db/prisma/schema/memory.prisma`
  and inverse relations to the owning schema files.
- Create a reviewed migration with the check constraints and only the initial
  indexes listed above.
- Apply migration before `pnpm --filter @slipstream/db db:generate`; TypedSQL
  generation validates against the live database.
- Verify Prisma does not propose changes to the existing hand-written HNSW,
  partial, GIN, trigger, or exclusion-constraint definitions.

### Phase 2 - Persistence API

- Add named parameter interfaces to `apps/ws-server/src/prisma/types.ts`.
- Add insert-only methods to `PrismaConversationMemoryService`: session insert,
  atomic search+hits insert, and read insert.
- Keep analytics writes out of chunk/context CRUD and counter reconciliation.
- Add the delimiter-aware own-provider helper as a pure memory-domain function.

### Phase 3 - Shared retrieval instrumentation

- Add `MemoryRetrievalExecutionContext` and structured search/read result types.
- Refactor `formatMemoryResults` and `getMemoryChunkForTool` so facts are
  available before JSON serialization, with byte-for-byte compatible logical
  output.
- Capture effective clamped search parameters, stable outcomes, duration,
  round/call order, both lane observations, anchor/resolved reads, and
  directions.
- Add the non-fatal telemetry persistence boundary.
- Instrument internal summarizer/fold executions with
  `surface = INTERNAL_SUMMARIZER`, or explicitly exclude them until their full
  provider/model context is available. Never label them as ordinary chat.

### Phase 4 - Provider fleet context rollout

- At each provider handler, create one chat retrieval session after final tools
  are assembled and before the first model request.
- Thread provider, model, conversation, `userMsgId`, session ID, round/call
  position, and each native tool-call ID through all memory search/read
  dispatches.
- Pass null for genuinely absent native IDs; do not mint a value and present it
  as provider identity.
- Cover every caller returned by `rg -l 'searchMemoryFromToolInput'`, including
  Anthropic's PTC path and OpenAI image generation.
- Remove the old shared-service signatures so TypeScript mechanically proves
  no caller remained uninstrumented.

### Phase 5 - Analytics queries

- Add explicit TypedSQL files for the attribution view/funnel, Narcissus
  exposure+selection report, traversal report, and provider distribution
  extract. Keep every entry point `userId`-scoped.
- Add typed wrappers to `PrismaConversationMemoryService`; no barrel exports.
- Run query plans against representative synthetic volume before considering
  additional indexes or materialization.

### Phase 6 - Live validation and observation start

- Exercise one model from every provider with: no tool call, zero-result search,
  semantic-only hit, fulltext hit, overlap hit, expansion, previous/next chain,
  direct ordinal read, and hallucinated chunk ID.
- Reconcile provider-visible outputs against stored facts for the same session.
- Confirm internal summarizer reads are excluded from the default chat report.
- Set and publish the observation start only after fleet coverage is complete;
  pre-completion rows are validation data, not study data.

## 6. Verification Matrix

### Pure/unit coverage

- Canonicalize semantic-only, fulltext-only, and overlap rows into one hit per
  chunk while preserving both ranks and scores.
- Preserve current per-lane ordering and overlap output.
- Parse `providerModelsRaw` by records; prove exact provider matching and avoid
  model-name substring false positives.
- Produce every stable search/read outcome from structured service results.
- Distinguish anchor from resolved chunk for previous and next reads.
- Prove telemetry write failure returns the unchanged tool output.

### Database/integration coverage

- Search call and all hits commit atomically; a failed child insert leaves
  neither.
- Zero-result searches and unsuccessful reads still persist their call fact.
- Check constraints reject partial lane pairs and invalid request-mode fields.
- Unexpected retrieval failures persist `ERROR` without storing raw exception
  text; telemetry-write failures do not replace the original tool error.
- Attribution chooses the latest earlier-round same-session hit, never a later
  or same-batch search, different session, different user, or different chunk.
- Re-read windows order deterministically and user deletion cascades all facts.
- User-scoped analytics cannot surface another user's session or chunk.

### Fleet coverage

- Every provider/model stores the canonical Prisma `Provider` value and exact
  model ID.
- Every native call ID round-trips when supplied; absent Gemini IDs remain null.
- Multiple tool rounds share one session and create distinct call rows.
- Retry/provider-carousel invocations using one `userMsgId` remain distinct
  sessions.
- Internal summarizer/fold traffic is labeled separately.

### Commands/gates

- `pnpm --filter @slipstream/db typecheck`
- `pnpm --filter @slipstream/ws-server typecheck`
- `pnpm build:ws-server`
- targeted Node tests for pure canonicalization and attribution fixtures
- reviewed `EXPLAIN (ANALYZE, BUFFERS)` for each initial analytics query

## 7. Explicit Non-Goals

- No ranker, prompt, tool-description, or result-shape change.
- No provider scorecard or UI in the first implementation.
- No mutable retrieval counters on chunks, contexts, stores, providers, or
  models.
- No cross-user/global provider analysis endpoint by default.
- No reconstruction/backfill of events from existing conversations.
- No materialized view, refresh scheduler, queue, or new dependency until data
  demonstrates the need.
- No causal claim that retrieval creates later thematic echoes.

## 8. Ship Criteria

The first release is complete when all provider chat surfaces emit a session
opportunity, search/hit/read facts match the provider-visible tool responses,
zero-use and zero-result denominators are retained, internal traffic is
separable, user deletion semantics are proven, and the first four user-scoped
reports run with reviewed query plans.

At that point the proposal in `outlook.md` is measurable without corrupting the
questions it is meant to answer. The key correction is simple: preserve the
stages of retrieval as separate facts, then derive interpretations from them.

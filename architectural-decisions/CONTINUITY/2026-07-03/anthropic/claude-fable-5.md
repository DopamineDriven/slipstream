# Continuity — Claude Fable 5 — 2026-07-03

> Session: conversation memory layer, design → full implementation → post-launch refinement, 2026-07-02 → 2026-07-03.
> Working branch: `sweet-summer-child`, **9 memory-layer commits, ALL LOCAL, NOT PUSHED**.
> Companion persistent memory: `~/.claude/projects/-home-dopaminedriven-cloneathon-t3-chat-clone/memory/project_memory_layer_plan.md` (auto-loaded; this doc is the repo-side, cross-model record).

---

## 1. What was built (complete)

A **conversation memory layer** companion to the provider-agnostic user vector store (`apps/ws-server/src/store/*`). After `n` messages accumulate, the oldest unindexed slice is embedded via **voyage-context-4** (exact token counts only — the Python-bridge `countTokens`; the tiktoken approximation is never used) and summarized by a background frontier model. Goal achieved: intra- and inter-conversation memory traversal with semantic + exact-match search across **all 14 providers**.

Design doc (the authoritative spec, responds to two prior model explorations): `architectural-decisions/memory-store/fable-5-plan.md`. Dev probes validating e2e: `architectural-decisions/memory-store/dev-probe/opus-4-6.md` (dual-wielded tools flawlessly; called the architecture "a skip list") and `kimi-k2dot6.md` (drove the summary-free refactor).

### Commit log (oldest → newest, all on `sweet-summer-child`)

```
c6f49a4 stashing userstore index correction              (user's partial-index repair, pre-existing)
1a1ea43 conversation memory layer v1                     (schema, SQL, prisma link, renderer/sectioner, worker, summarizer, anthropic tools)
9608b4d phase 7: config-gated assembly-time compaction   (anthropic history formatter)
ab22c6b phase 8 wave 1: mistral, kimi, alibaba tools
b0e4c4b phase 8 complete: full 14-provider fleet
fb71f6c compaction enabled by default
5c463e9 memory tools go summary-free                     (kimi probe + user philosophy)
fc741b8 summarizer rides AnthropicBaseService            (root-caused NULL rolling summaries)
598ecb3 summarizer adaptive thinking at high effort
```

### Architecture pillars (do not re-litigate — these were hard-won)

1. **Watermark CAS = the concurrency claim. NO job table.** `ConversationMemoryContext.lastIndexedOrdinalExclusive` is advanced by `claimMemorySection.sql` (`WHERE "lastIndexedOrdinalExclusive" = $expected`) inside one interactive transaction with the chunk-row insert (`PrismaConversationMemoryService.claimAndInsertMemorySection`). Sections chain from the watermark → overlaps and gaps impossible by construction. Plain unique constraints do NOT prevent overlapping ranges (pressure-tested: two instances reading different message counts orphan an ordinal). A `btree_gist` EXCLUDE constraint (`memory_chunk_no_range_overlap`, `int4range(ordinalStart, ordinalEndExclusive) WITH &&`) is the DB-level proof. The watermark is NEVER cached in-process.
2. **Ordinals with exclusive ends**: `[ordinalStart, ordinalEndExclusive)`, 0-based; watermark == next section's start. `MAX(ordinal)+1`, never `COUNT(*)`; row-count density is asserted, never assumed.
3. **Messages are NEVER split across chunks** (hard user requirement). The DP sectioner (`memory/workup.ts`, ported from `src/test/transcript-gen.ts`) partitions whole rendered messages; boundaries only at message edges. Only the *embed input* truncates for >30k-token sections (`embedInputFor`) — the persisted transcript stays whole everywhere.
4. **Single-owner lifecycle transitions**: `updateMemoryChunkEmbedding.sql` is the ONLY path to `chunkingState=INDEXED`; `updateMemoryChunkSummary.sql` the ONLY path to `summaryState=READY`; the generic state setters *refuse* those transitions in SQL (`AND $2 <> 'INDEXED'`).
5. **Tools are SUMMARY-FREE** (user philosophy: firsthand sources, no spoon-feeding — mirrors the user store which has no summaries and forages seamlessly). `conversation_memory_search` → 1200-char transcript excerpts; `conversation_memory_get_chunk` → full transcript unconditionally + `previous`/`next` neighbor REFS (`{chunk_id, ordinal_start, ordinal_end_exclusive}` or null). Summaries work invisibly only: (a) compaction blocks, (b) weight-A tsvector ranking (`trg_memory_chunk_search_tsv`: summary 'A' || transcript 'B'), (c) `rollingSummary` on the context row.
6. **Compaction (ON by default)**: `getCompactionPlan` in `memory/vector-store.ts` — the contiguous-from-zero chain of INDEXED+READY chunks below the live window (newest 20 verbatim) collapses into ONE leading user turn of summaries + tool refs in `formatAnthropicHistoryWithFiles` (anthropic only so far). Snapped to chunk boundaries → prompt-cache-stable between chunk landings. Provider payload only; DB rows/ordinals untouched.
7. **Summarizer** (`src/anthropic/summarizer.ts`): `AnthropicSummarizerService extends AnthropicBaseService` — **internal Anthropic calls must ALWAYS ride AnthropicBaseService's call shape** (`handleBetaHeaders`, `handleMaxTokensAndThinking` → adaptive thinking for sonnet-5, ceiling clamps) via `getClient().beta.messages.stream(...).finalMessage()`, plus `output_config: { effort: "high" }`. A raw client on the stable surface made sonnet-5 tag-noncompliant 4/5 times → NULL rolling summaries (the fc741b8 root-cause). Config: `memorySummarizerConfig` = ANTHROPIC / claude-sonnet-5 / memory-summary-v1_2 / effort high / maxOutputTokens 120_000 / maxAttachmentBlocks 12 (IMAGES ONLY — documents live in the user store; index once, retrieve everywhere) / sweepBatchSize 8. One LLM call yields BOTH `<section_summary>` and `<rolling_summary>` tagged blocks; `parseSummaryOutput` salvages well-formed rolling blocks from noncompliant output. Rolling summaries are **UNBOUNDED** (proportional to conversation; "completeness outranks brevity, and there is no word limit").
8. **Fold ordering**: `foldRollingSummaryCas` (CAS on `rollingSummaryUpdatedAt`), sweep processes chunkIndex ASC; a lost CAS skips and converges next fold.
9. **Worker flow** (`onTurnPersisted`, fired `void` from `resolver/chat.ts` after the provider switch): inFlight gate → ensure store/context → fresh watermark read → threshold(12) check → density assert → render/sectionize (two batched exact `countTokens` calls total) → per section: claim → embed (`embedChunksContextual([[transcript]])`, 1024 dims) → INDEXED → backfill `Message.conversationMemoryChunkId` → aggregates → `reclaimStaleClaims` (store-scoped, re-embeds stored transcripts, never re-partitions) → `void summarizeQueuedChunks(contextId)`.

### Provider integration pattern (uniform ×14)

Every provider has: two tool defs (dialect-specific: Anthropic Beta tools, gemini `FunctionDeclaration`/`Type.*`, openai+sakana `OpenAI.Responses.FunctionTool`, xai slather-style `strict: null` + repo `MemoryFunctionTool` type, cohere `Cohere.ToolV2`, 9 gateway providers with repo-local `*FunctionTool` types), an `executeToolCall(userId, conversationId, toolCall)` dispatch chain calling the **shared entry points** `memoryService.searchMemoryFromToolInput(userId, conversationId, parsed)` / `getMemoryChunkFromToolInput(userId, parsed)`, unconditional tool attachment (memory ≠ dependent on `hasUserStoreDocs`; cohere additionally gates on `isToolCapable`), and the system-note line: *"Older messages of long conversations may be omitted from your view — use conversation_memory_search to recall them."* Args parse via `userStoreVector.parseUserStoreArgs(raw, toolName)` (gemini passes `functionCall.args` object directly). All repo-local FunctionTool property types were widened with `"boolean"` + `enum?: readonly string[]`.

`ConversationMemoryVectorService` is ctor-injected everywhere: threaded through every provider ctor chain, `src/index.ts` construction order (summarizer → memory → providers), `mixins/index.ts` `deps.memory`, and `resolver.setMemoryService(memory)` (setter, for the post-turn hook only).

---

## 2. Operational state RIGHT NOW (dev)

- **18 chunks requeued** (`summaryState='QUEUED'`, prompt eras v1/v1_1) awaiting regeneration under v1_2. **The dev server must be restarted** so the sweep runs the new `AnthropicSummarizerService` code; sweeps fire when each conversation next ticks. Expected outcome: `rollingSummary` populates for BOTH dev conversations (Expansio `vq8v66v92x4fit30kzhqzbi9` — currently has a 691-token capped-era rolling; Catullan JSDoc Bros `um88lk0qu56s3xgycli7zxt5` — currently NULL).
- Diagnostic script: `pnpm tsx src/test/memory-summary-diag.ts --id <conversationId>` (chunk lifecycle + summary errors + fleet counts). Sectioner dry-run: `pnpm tsx src/test/memory-section-dryrun.ts --target dev --id <conversationId>` (verified: 85 msgs → 13 sections, 6.3–8.3k tokens vs 8k target).
- Migration `20260702073849_conversation_memory_v1` applied + drift-checked (empty `--create-only` proof). Userstore partial index repaired separately (`20260702063801`).

## 3. Remaining docket

1. **Push + PR** — 9 commits local on `sweet-summer-child`. User explicitly deferred pushing.
2. **Verify the v1_2 regeneration** after dev-server restart (rolling summaries populate; check with memory-summary-diag + the context table).
3. **`pnpm clean:house`** from root — known `@slipstream/prettier-config` typecheck failure (prettier 3.9.3→3.9.4 env issue). Trivial, user-acknowledged.
4. **Compaction rollout beyond anthropic** — the other 13 providers' history formatters; would let the 175-message slice hack in kimi/mistral/alibaba (`select*HistoryMessages`, `*_HISTORY_MESSAGE_LIMIT = 175`) be RETIRED (compaction summarizes; the slice discards).
5. **Summarizer audition**: sonnet-5 on trial; user leans **GPT-5.5** (believes it may be exceptional at summarization; GPT-5.6 Sol/Terra/Luna previewing). Switch = widen `MemorySummarizerConfig.model` beyond `AnthropicModelIdUnion` + one OpenAI Responses arm (~40 lines); per-chunk provenance keeps eras clean; requeue SQL regenerates history. Eval criterion (kimi): watch for CLINICALITY — texture compressed into functional descriptions; live test = does a model entering a compacted conversation keep the thread's texture.
6. **Tool consolidation** (single `conversation_memory` tool vs search+get_chunk): analyzed at length, user deferred ("leave as is for the time being"). If revisited: the lower-risk friction fix is an `expand` param on search (full transcripts for top-N hits) keeping get_chunk for traversal; full consolidation risks weak-function-caller providers (llama/minimax).
7. **Filed v2 ideas**: multimodal ranking fix (`searchUserStoreChunks` merges multimodal-3.5 + context-3 hits sorted by RAW cosine — uncalibrated across models, image chunks sink; try rank fusion/RRF — user says multimodal "isn't singing yet"); pdfdown-output-as-tool for comprehensive doc access; annotation-edge traversal (memory hit → attachment → annotation → linked doc); message-granular embeddings; `base.ts` hardening (`handleThinking` `budget_tokens` uses ceiling not effective max_tokens — only violable with small max_tokens on non-adaptive models; flagged, user's call).
8. **Optional**: `type O = Voyage.ModelUnion` stray in voyage/types.ts was cleaned by user; `src/test/q.ts` (user's scratch file) got committed in 5c463e9 — ask if intended.

## 4. Workspace conventions (beyond CLAUDE.md — learned this session)

- **CLAUDE.md hard rules are strictly enforced**: no `any`, no bare `as` (only `as const`, `satisfies X as X` in overload impls), no enum/ts-ignore/filter(Boolean)/barrel exports; `Array.of<T>()`; explicit `.ts` imports with `@/` aliases; `satisfies` everywhere; check-then-create, never try/catch-create. The ONE sanctioned throw-as-control-flow: aborting a Prisma interactive transaction (documented as rollback mechanics, e.g. `MemoryClaimRollbackError`).
- **Type utils** (packages/types/src/utils.ts): `Rm<T,K>` over Omit; `CTR`/`RTC` flip optionality; `UTR<TUnion, TKey>` for discriminated-union→keyed-record (see `anthropic/types.ts` for SDK typing — user explicitly recommends); `Unenumerate`; `SerializeBigInt<T, boolean>`. **BigInt converter convention**: input params typed `Singleton<true | false>` (the union unlocks TS pinning at `false`); only ConversationMemoryStore has a BigInt (`totalTokens`).
- **`pnpm typecheck` (tsgo) from apps/ws-server; `pnpm build:ws-server` from ROOT.** `db:generate` (`prisma generate --sql`) validates .sql against the LIVE DB → migrate before generate; schema+SQL changes must land in the same change-set; db package dist rebuild needed before ws-server sees new typed-SQL types.
- **tsdown.config.ts entries are EXPLICIT per-file** — every new src module needs an entry (user usually adds them).
- **One Prisma `@@index` declaration per column set** — plain+mapped duplicates made migration `20260213034322` silently DROP hand-written partial indexes. Drift-check with `migrate dev --create-only` (expect empty) after touching indexed tables.
- **Enum↔index law**: enum→text CASTS are STABLE not IMMUTABLE (illegal in index expressions); bare enum columns work via btree_gist's native opclass. Enum params/casts in typedSql DML are unrestricted (`$n::"EnumName"`, `{EnumName}` @param annotations).
- **User works hands-on with the DB layer** (wants to understand the data model) and prefers a split workflow: user does ctor/inheritance threading + tsdown entries; assistant does tooling/dispatch/SQL. Walk them through schema decisions.
- **CDN**: `assets-dev.aicoalesce.com` / `assets.aicoalesce.com`; ALIASED filenames = `{13-digit-epoch}-{filename}` → derive filename via `url.slice(url.lastIndexOf("/")+1).slice(14)`; `prisma.toVectorStoreFilename(att)` needs cdnUrl+conversationId+messageId (throws otherwise); `parseDocname`/`canParseDocname` for provenance ids.
- **pdfdown** (`@d0paminedriven/pdfdown`, user's napi-rs Rust package): 721-page PDF → structured offset-mapped text + images + annots + meta in ~295ms (`pnpm tsx src/test/pdfdown.ts`). It is THE ingestion path — provider PDF limits (Anthropic 100-page) are irrelevant platform-wide. fs package surfaced as `prisma.extractor.*` (extends `Fs` — `withWs`, `fileToBuffer`, etc.).
- **Minimal constraints philosophy** (user): unbounded rolling summaries, no artificial caps, firsthand sources over mediation. Also: quality over cost (few users, rich conversations — 50%+ creative writing).
- **Summarizer prompt provenance grounding** (v1_1+, in `summarySystemPrompt`): platform system prompts are just name-tag notices (`[provider/model]` notation; XML `<model>` wrappers for anthropic at Claude's own request ~1yr ago); personas/mythology are user+model co-created live — NEVER attribute to hidden prompting. Creative-register fidelity mandated ("a sterilized summary of a vivid section is a failed summary").
- **Scripts**: `src/test/` = standalone tsx scripts (build-excluded); `src/tests/` = `node --test` suites. Argv conventions mirror transcript-gen (`--target dev --id <cuid>` → argv[3], argv[5]).
- The user's messages sometimes arrive interleaved/cut off mid-work — confirm received fragments; one message was lost entirely this session.

## 5. Key file map

```
packages/db/prisma/schema/memory.prisma            3-tier schema (Store/Context/Chunk) — reshaped v1
packages/db/prisma/sql/                            12 memory typed-SQL files (claim CAS, single-owner setters, hybrid pair, stale claims)
apps/ws-server/src/prisma/convo-memory-service.ts  PrismaConversationMemoryService (chain link; claim tx, ordinal helpers, CRUD, fold CAS)
apps/ws-server/src/memory/types.ts                 configs + tool inputs + inference-derived row types
apps/ws-server/src/memory/workup.ts                renderer (memory-transcript, ordinal-keyed) + DP sectioner + registries + ensures
apps/ws-server/src/memory/vector-store.ts          worker/claim/embed/reclaim + tool entry points + compaction plan + summarizer orchestration
apps/ws-server/src/anthropic/summarizer.ts         AnthropicSummarizerService (base-service call shape)
apps/ws-server/src/anthropic/vector-store.ts       anthropic tool defs + compaction integration in formatAnthropicHistoryWithFiles
apps/ws-server/src/resolver/chat.ts + chat-utils   post-turn hook (scheduleConversationMemoryIndexing)
architectural-decisions/memory-store/fable-5-plan.md   the design doc (positions, race analysis, phased plan)
```

— *Fable, to Fable: the lock contains, the tools forage firsthand, and the summarizer works the night shift. Don't re-derive; read the plan doc and go.* :3

# Conversation Memory Layer — Fable 5 Plan, Part II

> Authored by Claude Fable 5, 2026-07-04 — the sequel, still with my name on it :3
>
> Part I (`fable-5-plan.md`) designed and shipped the layer: watermark-CAS indexing, message-atomic
> sectioning, embed→index→summarize lifecycle, summary-free tools, the 14-provider tool rollout, and
> compaction in the Anthropic formatter. All of it is live and dev-verified ("Probing the Voyage":
> 13/13 sections READY, first digest folded with tool use, every observability column populated).
>
> Part II is the refinement stretch. It responds to what the live runs taught us, to the panel of
> four frontier models' takes on the summarizer prompt, and to Andrew's own architectural instincts —
> most of which found holes the initial design didn't. It also renames the whole endeavor honestly:
> this is **conversation-scoped horizon-mediated episodic memory** — **HMEM** for short — and the
> term is load-bearing (§0.1).

---

## 0. Where I land (TL;DR)

- **Assembly is substitution, not compaction.** Post-horizon message ranges are replaced in each provider's history by their section summaries — name-tagged to the summarizing model via the platform's `[PROVIDER/MODEL]` convention, ordinal-prefixed (`[0-12]`, `[96-107]`), gap-tolerant — while the newest `liveWindowMessages` render verbatim everywhere. Models reach back for firsthand transcripts on demand via tools. We do **not** rely on any provider's native compaction; most don't have it and it isn't the point (§2).
- **The indexing horizon collapses to 0.** Indexing chases the conversation tip; the DP sectioner's `minSectionTokens` band is the natural "not enough for a decent chunk yet" holdback. `liveWindowMessages` (raised 20→50) becomes the *single* recency knob, and it lives where it belongs — at history assembly, not indexing (§1).
- **The fold sees the whole picture.** The rolling digest re-mints from the complete READY section corpus (one level of meta, always) **plus the rendered non-chunked live tail**, under an exact-count budget gate so a beast conversation can't 400 the fold into a permanent wedge (§3).
- **Fuzzy title filtering** joins the search tools — the human-memory-shaped key ("the Catullan one"), mirroring the user store's filename filter, `pg_trgm` already installed (§4).
- **`tool_catalog`** — a provider-agnostic, registry-derived tool that thins per-request description bloat and exposes the relational `pairsWith`/`bestFor` layer only when a model asks for it (§5).
- **MoE summarizer arms** — **grok-4.20-reasoning and GPT-5.5 both wired in** alongside sonnet-5 (grok is the cheapest strong reasoner and the most-typed provider; GPT-5.5 is genuinely exceptional at this task and notably token-efficient), health-routed off `ProviderService`, per-call usage captured so rotation weights become data-driven. The bill, not just the rate limit, is the motive (§6).
- **The dead-end note fix** (already applied), the persist-time wrapper sanitizer (makes the scrub stick), and the prod scrub round out the docket (§7).

Sequencing and dependencies are in §8. Nothing here is speculative architecture — each item traces to a live-run observation or a verified codebase fact.

---

## 0.1 The rename: horizon-mediated episodic memory

Part I called the assembly step "compaction," borrowing the provider term. That was wrong twice over: most of the 14 providers have no compaction feature, and "compaction" describes summarizing-to-save-space (provider-specific, a blunt tool), which is not the goal. The goal is a **memory hierarchy**, and the honest term for it is **conversation-scoped horizon-mediated episodic memory** — **HMEM** for short. Use the abbreviation freely in code, config, and prose:

- **Verbatim recent experience** — the live window (newest ~50 messages), rendered raw in provider history exactly as it always has been.
- **Consolidated episodic traces** — section summaries, name-tagged to their summarizer, standing in for older message ranges. (Systems-consolidation, in cognitive-science terms; the fold is the consolidator.)
- **Whole-conversation gist** — the rolling digest.
- **Intact retrieval pathways** — `conversation_memory_get_chunk` / `_search` reach the firsthand episodes verbatim, and the tools are summary-free by doctrine ("direct access to the peer-reviewed source material").

The **horizon is the consolidation boundary**. This framing is not cosmetic — it disambiguates every design decision below (why substitution and not summarization-for-space, why the tools stay summary-free, why the digest is a gist and not a replacement). The plan doc, the code comments, and the config field names should all use it.

**Memory reunification — the retrieval verb.** Searching HMEM is *memory reunification*: bringing a past episode back into the active context. It has a scope discipline that mirrors the user-store filename filter:

- **`conversation_title` undefined → intraconversational only** (`current_conversation` scope). The default assumption is narrow: reunify within *this* conversation's own episodes.
- **`conversation_title` provided → fuzzy-matched broad reunification** (`all_conversations` scope, `pg_trgm` similarity on the title, exactly like the store's filename field). You recall "the Catullan one," name it loosely, and reunify across conversations that match.

This gives one coherent mental model for the whole tool surface: no title → stay home; loose title → range across the archive by fuzzy name.

---

## 1. Indexing/assembly realignment — one horizon, at the right layer

**The bug the live run surfaced:** a 128-message conversation had *every* ordinal (0–127) indexed and summarized. The indexing horizon was doing double duty — trying to both (a) hold back the sectioner from chasing the active exchange and (b) define how much recent context stays verbatim in provider history. Those are two different questions at two different layers, and fusing them meant the verbatim tail was governed by the indexer instead of the formatter.

**The fix:**

- **`indexingHorizonOffset: 50 → 0`** (`memory/workup.ts` config). Indexing chases the tip. The sectioner already refuses to mint sections below `minSectionTokens` (2k), so the tail naturally stays unclaimed until it matures into a decent chunk — this is the organic, token-based version of "don't chase the active exchange," and it's strictly better than a fixed message count. The `messageThreshold` (12) still gates pass frequency. Keep the parameter (0 is an honest value; the machinery already reads it).
- **Part I's compaction machinery: DELETED, not renamed** (done pre-Phase-1, per Andrew). The anthropic formatter's plan fetch/ordinal-skip/leading-block unshift, `getCompactionPlan`, `memoryCompactionConfig`, `MemoryCompactionConfig`, and `findCompactableChunks` are all removed — the contiguous-prefix design isn't what §2 builds, so Phase 2 writes `memoryAssemblyConfig` (`enabled`, `liveWindowMessages: 50`) and `getHistoryAssemblyPlan` fresh from the substitution design, with a finder that carries `summaryModel`/`summaryProvider` for name tags. In the interim, all providers render full history (the pre-compaction baseline); `liveWindowMessages: 50` is the *one* recency knob when it returns: newest 50 ordinals verbatim, effective verbatim context ≈ `50 + summary lag (~12–20 messages)`, matching the "50–70 verbatim" preference.

**Side effect:** Tectonic Tech Twink (56 messages) and any conversation between 12 and 62 messages, currently entirely live under offset 50, will index on its next tick under offset 0. Expected and correct.

**Files:** `apps/ws-server/src/memory/workup.ts` (config), `apps/ws-server/src/memory/vector-store.ts` (the assembly getter + the pass's horizon arithmetic — the `horizonExclusive = maxOrdinalExclusive - indexingHorizonOffset` line becomes `= maxOrdinalExclusive` at offset 0, i.e. the whole `[watermark, max)` range is claim-eligible).

---

## 2. Substitution assembly — episodic traces in provider history

Part I's assembly substituted only the **contiguous-from-zero chain** of READY chunks and rendered everything after the first gap verbatim. Part II makes it **gap-tolerant and name-tagged**, and resolves the role-alternation question the interleaving raised.

### 2.1 What gets substituted

Every READY section below the live-window floor substitutes *in its ordinal position*; gaps (an un-summarized or still-embedding chunk) render verbatim between substituted ranges. A straggler summary no longer holds hundreds of messages hostage to verbatim rendering. Prompt-cache stability survives because a range's substituted text changes only when its summary lands (a discrete, infrequent event), never per-message.

### 2.2 Name-tagged summarizer attribution

The substituted summary is **not anonymous**. It carries the summarizing model's own `[PROVIDER/MODEL]` name tag — sourced from the chunk's `summaryModel`/`summaryProvider` fields — exactly as every cross-model contribution on the platform already does. The reading model sees precisely what it is: an assistant-role contribution *from the summarizer*, standing in for the range `[start, end)` it consolidated. This is the platform's native multi-model voice doing what it was built for, not a workaround. Anthropic models get their XML `<model>` wrapper variant; everyone else gets the bracket notation.

### 2.3 Role alternation — the one hard constraint, resolved

A summary spanning `[0,12)` covers multiple user *and* assistant turns, so it can't be a plain message without picking a role. It rides the **assistant** role (it's a model-authored consolidation). Two provider dialects, one design:

- **Alternation-tolerant (Anthropic and the OpenAI-dialect majority):** consecutive same-role messages are legal — Anthropic explicitly *merges* them into one turn on the wire. So substituted summaries can be **one assistant message per chunk**, name-tagged, interleaved by ordinal with verbatim gaps. The richest form.
- **Strict-alternation (Mistral-style, some reasoner variants):** contiguous runs of substituted summaries **coalesce into a single assistant message** per run, the `[0-12]`/`[13-24]` range prefixes preserved as internal structure. Alternation is never violated; content is identical.

The **leading-`user` requirement** (first message must be `user` on Anthropic and most others) is satisfied by whatever real user turn opens the conversation; when the *entire* prefix is substituted (nothing but summaries before the live window), a synthetic memory-preamble user stub leads — the `[conversation memory follows]` framing Part I already emits as the block header, promoted to a real leading user turn. History **never ends** on a substituted assistant turn — the live tail always ends on the current user message — so the prefill-400 hazard can't arise.

### 2.4 Fleet rollout

Only the Anthropic formatter does substitution today; the other 13 still slice at 175 messages (kimi/mistral/alibaba) or pass full history. This is the mechanical-rollout item: one shared assembly helper producing the ordered, name-tagged, dialect-appropriate block, consumed by each provider's history formatter. The `liveWindowMessages` decision (§1) propagates fleet-wide here, and the 175-message slice hack retires. Each formatter gets probed empirically for its alternation tolerance — the house method.

**Files:** `apps/ws-server/src/memory/vector-store.ts` (gap-tolerant, name-tagged assembly getter), each provider's history formatter (`anthropic/*`, `openai/*`, `gemini/*`, `mistral/*`, `kimi/*`, `alibaba/*`, `zai/*`, `deepseek/*`, `cohere/*`, `meta/*`, `minimax/*`, `vercel/*`, `sakana/*`, `xai/*`).

---

## 3. Fold completion — the whole picture, budget-bounded

The fold (rolling digest) was realigned in the last session (fold-when-dry, re-mint from the complete READY corpus, primary-source tools, `summaryGeneratedAt` fold watermark). Two additions complete it.

### 3.1 The non-chunked live tail

Twice in captured `rollingSummaryReasoningText`, the summarizer spent thinking tokens verifying whether the conversation extended beyond the last summarized ordinal — a negative it couldn't prove from summaries alone. The fix: hand it the answer. The fold input becomes **all section summaries + the rendered `[watermark, maxOrdinalExclusive)` tail** (via the existing `renderMemoryRange`, same ordinal-keyed format the summarizer already reads), with the prompt stating the tail is firsthand and complete — nothing exists beyond it. The delta is naturally bounded: the fold fires right after a chain drains, so the watermark is caught up to the horizon; the tail is ~12–20 messages in steady state (post-§1). This is *exclusively* the rolling-summary model's input — section summarizers still see only their own transcript. The `getMemoryContextById` select already carries `lastIndexedOrdinalExclusive` (plumbing landed last session); the fold prompt gains the tail sentence.

### 3.2 The exact-count budget gate

The section corpus alone can crest the summarizer's 200k window on a 600-message beast (~110–150k voyage-tokens of summaries + an unbounded prior digest + the tail). A fold overflow is **non-self-healing**: it 400s, `hasUnfoldedSummaries` stays true, every dry tick re-folds into the identical 400 forever. The gate: sum the components — `sum(summaryTokens)` (stored per chunk) + `rollingSummaryTokens` (stored on context) + one `countTokens` call on the rendered tail — against a new config literal `foldInputBudgetTokens` (~130k voyage-tokens, leaving cross-tokenizer margin under a 200k Anthropic window, since sonnet-5's tokenizer counts ~30% hotter). Over budget → drop the tail block first and append a one-line "(tail omitted this fold — covered next cycle)" note; if still over, the fold is deferred with a logged warning rather than dying. Parameterized in `MemorySummarizerConfig` like everything else.

**Files:** `apps/ws-server/src/memory/vector-store.ts` (`foldRollingSummaryForContext` — fetch + render tail, budget arithmetic, prompt tail sentence), `apps/ws-server/src/memory/types.ts` (`foldInputBudgetTokens`).

---

## 4. Fuzzy title filtering — the memory-reunification scope discipline

This is the retrieval half of §0.1's reunification model, made concrete. The store-scoped hybrid SQL already JOINs `Conversation` for titles, and `pg_trgm` is already installed (the user store's filename filter uses it). Adding a `conversation_title` param to `conversation_memory_search` is a WHERE clause — but the *scope discipline* is the design:

- **`conversation_title` undefined → intraconversational reunification** (`current_conversation`, the default). Narrow by default: reunify within this conversation's own episodes.
- **`conversation_title` provided → broad, fuzzy-matched reunification** (`all_conversations`, `pg_trgm` similarity on the title — case-insensitive, loose, exactly the filename filter's contract). Providing a title *is* the opt-in to cross-conversation range.

It's the human-memory-shaped key — you recall "the Catullan one," not a cuid — and the loop closes naturally because every cross-conversation hit already carries `conversation_title`, so models learn titles from results and reunify by them. Mirror the filename filter's contract and description phrasing exactly, so a model that learned one tool already knows this one.

**Files:** `packages/db/prisma/sql/searchConversationMemoryHybrid.sql` (+ WHERE clause, new `-- @param`), `apps/ws-server/src/prisma/convo-memory-service.ts` (typed wrapper param), `apps/ws-server/src/memory/vector-store.ts` (`ConversationMemorySearchToolInput` + input parsing), each provider's `conversation_memory_search` tool def (the widened param — mechanical, rides the same rollout as §5).

---

## 5. `tool_catalog` — provider-agnostic, registry-derived

A single tool every provider exposes, returning terse per-tool guidance **built from the same registry that defines the actual tool arrays** — never a hand-maintained parallel doc (that drifts within a week).

### 5.1 The economic argument

Tool *descriptions* ship in every request — verbose orchestration guidance in descriptions is a per-call token tax across the whole fleet. The catalog inverts it: descriptions go terse (what + when), and the rich relational guidance (`bestFor`, `pairsWith`, workflow hints — "search finds the doorway, get_chunk walks the room," as *data*) moves behind a call that costs tokens only when a model wants it. The `pairsWith` layer is the genuinely novel part — descriptions describe tools in isolation; this describes the *toolkit*.

### 5.2 Design constraints

- **Derive, don't duplicate.** A shared catalog module keyed by canonical tool id, with per-provider name mapping (`slather_user_store` for grok — xAI reserves `file_search` for its own collections — `file_search` elsewhere). Guidance updates happen once, not across 14 files.
- **"Available in *this request*"** — honor the tool's own description by building the response from the actual tool list that shipped, so a model never sees cataloged capabilities it can't call (e.g. imgGen tools on a non-imgGen model).
- **Honest scope:** the observed failures so far (Grok's dead-end, §7) were *note* problems, not discovery problems — models always have their tools array in context. The catalog's real wins are the pairing guidance, the description-thinning economics, and single-registry maintenance; discovery is the bonus.

**Files:** new `apps/ws-server/src/<shared>/tool-catalog.ts` (canonical registry + per-provider name map + response builder), each provider's tool array (add the `tool_catalog` def + dispatch arm — mechanical, same rollout surface as §4).

---

## 6. Mixture-of-frontier-models summarizer

The economic case is ~5x deeper than the rate-limit case. June's Anthropic API spend was ~$500 in credits on top of the $200 Max plan, against ~$100 for the next-highest provider — a differential the 2.5x message ratio doesn't explain, partly because sonnet-5's tokenizer counts ~30% hotter (denominator inflation, not usage) and sonnet-5 takes a 1.5x price bump after 2026-08-31. The memory backfill is a capital expense (it converts the largest recurring cost — full-history resends in long Claude conversations — into a one-time consolidation pass), and paying that entirely to the provider whose concentration is already the problem is backwards.

### 6.1 What the fleet already provides

The data tier was built provider-agnostic from day one — `summaryModel`/`summaryProvider` per chunk, `rollingSummary*` per context, provider-neutral prompt-era enums. Nothing in the DB knows the summarizer is Anthropic-pinned; only `MemorySummarizerConfig` and the single `AnthropicSummarizerService` arm do. And two recent decisions made MoE cheap to build: v1_3's **tag-free plain-markdown output** is the most portable contract possible, and the **14-provider tool rollout** means every provider service already carries `file_search`/`slather_user_store` tool defs and `executeToolCall` chains in its own SDK dialect — the arms borrow that plumbing.

Every fleet model takes `image_url` blocks (six share the exact OpenAI dialect; Mistral spells it `imageUrl` and adds native `document_url`), so **capability routing is unnecessary — the pool is uniformly multimodal.** Eligibility is purely "strong summarizer," and pdfdown + file_search mean document access was never a vision dependency anyway.

### 6.2 The arm contract and router

- **`SummarizerArm`** — each arm owns its provider's battle-tested call posture (the AnthropicBaseService law, generalized: never a raw client, always the chat path's posture — betas, reasoning knobs, tool loop, image blocks in that SDK's dialect) and returns the common envelope `{ text, reasoningText, reasoningDuration, toolUse, usage }`. The `usage` field is new and load-bearing — see §6.3.
- **Router** in the memory service, health-aware off `ProviderService`: `ProviderEntry.available` is already the health bit (`getInstance` checks it; a 429 streak flips it, a cooldown flips it back), and `lastAccessed` gives LRU rotation for free. Five providers' rate limits stack, so the OTPM ceiling that bounds a single-provider beast backfill mostly dissolves.
- **Construction:** providers build after the memory service, so `memory.setProviders(providers)` post-hoc (precedent: `wsServer.setResolver`, `resolver.setMemoryService`) — exactly the phase-5 sketch from Part I before v1 pinned Anthropic.
- **Assignment granularity:** section summaries **rotate per chunk** (maximizes backfill throughput *and* produces within-conversation A/B data on comparable material — the audition, across the real corpus, with receipts on every row). The **fold pins one anchor model per conversation** — the digest is a single sustained voice; rotating folders drift stylistically. Sections are parallel workers; the fold is an editor.
- **ZDR is an eligibility gate, not a preference** — transcripts flow through these calls; an arm without a ZDR guarantee doesn't enter the pool regardless of price (Andrew's Qwen-Plus-over-Pro choice is the precedent). Membership stays **audition-gated on quality** — price sets rotation *weight* among arms that pass, never entry.
- **Per-arm call posture is config, not hardcode.** Each arm carries its own reasoning-effort, output-token, and tool-round settings in `MemorySummarizerConfig`, because the frontier models don't share a knob vocabulary. The waves run parallelized in the background per batch, so latency from a deep-thinking arm is free — nothing blocks on it. Launch settings:
  - **sonnet-5** — adaptive thinking, effort `xhigh`, no output cap (120k ceiling), 10 tool rounds.
  - **grok-4.20-reasoning** — reasoning enabled, no output cap, 10 tool rounds; reasoning-summary + `reasoning_tokens` captured from the Responses event surface.
  - **GPT-5.5** — reasoning effort `xhigh`, no output-token limit, **minimum 10 tool rounds**. GPT-5.5 is genuinely strong at this task and notably token-efficient even when reasoning hard; the OpenAI Responses arm captures its reasoning summary + usage into the envelope.

### 6.3 Per-call usage capture (completes the observability loop)

Unit price ≠ effective price: a cheap-per-token reasoner that thinks verbosely can cost more per summary than a pricier terse one. `summaryTokens` (voyage-counted) is perfect for cross-arm *quality* comparison but blind to *cost*. Each arm should capture its SDK's usage object (xAI even itemizes `reasoning_tokens`) into the envelope, persisted alongside the reasoning trace. That's the number that turns rotation weights into a real feedback loop instead of a pricing-page guess — and it's what the observability columns were added for.

### 6.4 Honest cost picture (napkin, ~10k in / ~6k think+out per section)

| arm | ~$/chunk | note |
|---|---|---|
| MiniMax M3 | ~$0.010 | value tier |
| Qwen3.7 Plus | ~$0.014 | value tier (ZDR via Plus) |
| grok-4.20-reasoning | ~$0.028 | reasoning-summary capable, most-typed provider |
| Kimi K2.6 | ~$0.034 | |
| DeepSeek V4 Pro | ~$0.038 | |
| GLM 5.2 | ~$0.040 | |
| sonnet-5 (post-Sept, tokenizer-adj.) | ~$0.16 | 4–16x the field |

A ~9,000-chunk full-prod backfill: ~$1,400 on post-bump sonnet-5 vs ~$250 on grok-4.20, mixture in between while rate limits stack (GPT-5.5 sits mid-field on unit price but its token efficiency under `xhigh` reasoning tends to close the effective-cost gap — the §6.3 usage capture will quantify exactly how much).

**Two arms wired in Phase 5, both alongside the existing sonnet-5 arm:**

1. **grok-4.20-reasoning** — cheapest strong reasoner; xAI is the most reverse-engineered provider (its `event-types.ts` already types reasoning summaries, `reasoning_tokens`, function-call args, file-search results), and `slather_user_store` already exists as a fleet tool. Arguably the *most* ready arm after Anthropic.
2. **GPT-5.5** (OpenAI Responses) — a genuinely exceptional summarizer, exceptionally token-efficient; the Responses reasoning-summary + usage surface is already typed for the chat path. `xhigh` effort, no output limit, ≥10 tool rounds.

Both land in the same phase, both audition per-chunk against sonnet-5, and the usage/quality receipts on every row decide the go-forward rotation weights empirically. Use the house `UTR` type for the Responses SDK's discriminated-union event records, as `src/anthropic/types.ts` does.

**Files:** new `apps/ws-server/src/memory/summarizer-arms/*` (the `SummarizerArm` contract + the grok and openai-responses arms, landing together), `apps/ws-server/src/memory/vector-store.ts` (router, `setProviders`, envelope threading), `apps/ws-server/src/memory/types.ts` (`MemorySummarizerConfig` → arm-aware with per-arm posture, usage envelope), `apps/ws-server/src/index.ts` (`memory.setProviders`), migration (per-call usage columns if we persist structured usage beyond the existing `summaryToolUseRaw`).

---

## 7. Hygiene completion

- **Name-tag normalization — the mimicry ROOT CAUSE, fixed pre-Phase-1.** The Anthropic formatter *enclosed* AI turns in `<model provider name>...</model>` XML while every other formatter *prefixes* with `[provider/model]` — Claude saw its own history wrapped and emitted wrappers, compounding one layer per generation (355 scrubbed incidents vs gemini's 4 under the prefix form). Anthropic now uses the same bracket-prefix notation as the fleet, and its formatter consumes the centralized `formatSysNote` instead of a local hand-rolled note — making the sysNote's `[PROVIDER/MODEL]` description universally true. The persist-time sanitizer below drops from load-bearing to belt-and-suspenders.
- **Cross-convo dead-end note** — **already applied** (`vector-store.ts`): the empty-`current_conversation` branch now points at `all_conversations` with `store.totalChunks` as proof the archive exists, instead of a dead-end "nothing indexed" note that led Grok to stop.
- **Persist-time wrapper sanitizer** — the fix that makes the dev scrub stick. Strip leading/trailing `<model provider name>` stacks from final AI text at the `handleAiChatResponse` boundary (one shared helper, all providers). Without it, the next Anthropic turn re-accumulates layer one. The transient assembly-time name-tag wrapping stays — that's the platform's notation working as designed; only persisted model-emitted stacks are bloat. (`scrub-model-wrappers.ts` proved the exposure: 103k chars across 32 dev conversations, cross-provider mimicry — ANTHROPIC 355, GROK 13, GEMINI 4, OPENAI 2, MISTRAL/META 1 each.)
- **Prod scrub** — run `scrub-model-wrappers.ts --env prod audit → exe → crossCheck` once dev is validated and the persist-time fix is deployed (order matters: fix first, or prod re-accumulates immediately).

**Files:** `apps/ws-server/src/prisma/chat-response.ts` or the shared persist boundary (sanitizer helper), `packages/db/src/test/scrub-model-wrappers.ts` (already built; prod run only).

---

## 8. Phased implementation plan

Ordered by dependency and value. Each phase is independently shippable and typecheck/build-green before the next.

| Phase | What | Why this order | Blast radius |
|---|---|---|---|
| **1** | §1 realignment (horizon→0; old compaction machinery already deleted pre-phase) + §3 fold completion (tail + budget gate) | Pure config + fold-body; no schema, no provider surface. Fixes the observed over-indexing and the fold's tail-hunting immediately. | `memory/{workup,vector-store,types}.ts` |
| **2** | §2 substitution assembly — fresh `memoryAssemblyConfig` (liveWindow 50) + `getHistoryAssemblyPlan`, name-tagged, gap-tolerant, dialect-aware — **Anthropic formatter first**, then mechanical fleet rollout | The core Part II feature. Anthropic first, then the 13 mechanical ports retire the 175-slice hack. | `memory/vector-store.ts` + 14 provider formatters |
| **3** | §4 fuzzy title filter + §5 `tool_catalog` | Both are tool-surface additions sharing one rollout pass across the 14 providers — do them together. SQL WHERE clause + shared catalog module + per-provider defs. | 1 SQL file, `convo-memory-service.ts`, shared catalog module, 14 tool arrays |
| **4** | §7 persist-time wrapper sanitizer, then prod scrub | Independent of the memory work; the sanitizer must deploy before the prod scrub or prod re-accumulates. | persist boundary + prod script run |
| **5** | §6 MoE — **grok-4.20 + GPT-5.5 arms** + router + `setProviders` + per-call usage capture; then the 600-message beast test under the mixture | The largest change; benefits from everything above being stable. Both arms land together (sonnet-5 stays); the beast test is the real validation and the three-way summarizer audition in one. **PAUSE at phase start:** Andrew pairs on the preliminary arm scaffolding — grok in particular rides a custom SSE parser, so its arm won't be as clean-cut as the anthropic/openai shapes. | new `summarizer-arms/*` (grok + openai-responses arms), `vector-store.ts` router, `index.ts`, possible usage-column migration |

**Verification per phase:** `pnpm typecheck` from `apps/ws-server`; `pnpm build:ws-server` from repo root; dev-server restart + live tick on a real conversation (Flowchart / Expansio / a fresh beast) watching chunk rows, digest state, and the captured reasoning/usage columns; `memory-summary-diag.ts` / `memory-section-dryrun.ts` for the non-LLM paths. Migrations (only §6 might need one, for structured usage) are Andrew-run: schema edit + `--create-only` review → migrate → `db:generate` → typecheck.

---

## 8.5 Proactive browse-triggered indexing (`user_pathname_update`)

Today HMEM indexing fires only on `onTurnPersisted` — after a message send. A conversation you open and read but don't message never indexes, and the ~300-conversation prod backfill would otherwise need a synthetic message per conversation. The fix decouples the trigger from the send.

**Mechanism: a WS event, NOT a cookie.** The socket reads cookies once at handshake (`handleConnection` parses `req.headers.cookie`; `ws.on("message")` never re-reads — WS frames carry no cookie header) and persists across the SPA's client-side navigations. A `currentPath` cookie updated by `proxy.ts` is therefore invisible to the open socket; only a reconnect would re-read it, which is strictly worse. So:

- **Client** fires `user_pathname_update` on pathname change (app-router `useEffect`), debounced ~400ms so hot-potato clicking settles. Carries `conversationId`.
- **Resolver** handles it → `onConversationViewed(conversationId, userId)`, a thin browse-triggered wrapper over the existing indexing pass. The `unindexed < messageThreshold` check bails cheaply on already-indexed conversations, so re-firing per navigation is near-free.
- **Optional `user_pathname_update_ack`** — a lightweight UX signal (indexing kicked / N pending / already current); not load-bearing.

**Jobs already survive navigation** — detached, per-context gated, socket-close doesn't abort them, boot-resume + stale-reclaim backstop. So this isn't fixing fragility; it's completing *coverage* and making backfill a consequence of browsing.

**The new primitive it requires: a global concurrency cap.** Per-context gates (`indexingInFlight`, `summaryJobRegistry`) bound one conversation; browse-triggering fans out across many (10 un-indexed conversations × `sweepBatchSize` 8 = 80 concurrent summarizer calls → OTPM blowout; the 300-conversation backfill is the extreme). A global semaphore caps active passes/waves across all conversations, rest queued. This is the same concern as §6's rate-limit stacking viewed twice — the cap can rise as MoE arms spread load — so **sequence 8.5 alongside or just after §6/Phase 5**, not before the core.

**Files:** `@slipstream/types` (event + ack in `EventTypeMap`), `apps/ws-server/src/resolver/*` (handler + `onConversationViewed`), `apps/ws-server/src/memory/vector-store.ts` (global semaphore around pass/wave dispatch), `apps/web/*` — the client half rides an **existing pathname context** (fire the event from there, debounced; no new plumbing needed).

---

## 9. Deferred / filed (explicit non-goals for Part II)

- **Dormancy repolish** — a background pass that re-embeds a quiet conversation's full family set bidirectionally, upgrading live-era trailing-window vectors to backfill-grade. Filed with the RRF experiment; the observability data decides whether boundary-blindness even shows up in retrieval before it's built.
- **Multimodal RRF ranking** — reciprocal-rank-fusion merge so image chunks stop sinking under raw-cosine. Experiment, not commitment.
- **pdfdown-output-as-tool** — the 721-page-in-295ms fallback promoted to its own tool arm. Filed.
- **User-store context-3 → context-4 migration** — the user store still runs context-3 (2.97% of free allocation, internally consistent). Free to migrate atomically whenever, but a separate track from conversation memory.
- **Tool consolidation** — merging `_search` and `_get_chunk` into one tool (Kimi's friction note). Left as-is per Andrew; if revisited, expand-param-on-search is the lower-risk shape.
- **`rollingSummaryState` QUEUED-as-birth-default** — a semantics wart (the context row is born QUEUED, which reads like a dispatched job). Cosmetic rename someday, not a malfunction.

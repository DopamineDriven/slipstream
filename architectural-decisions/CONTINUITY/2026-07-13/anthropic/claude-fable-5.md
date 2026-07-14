# Agentic Continuity Handoff — Fable 5 → Fable 5 (fresh window)

**Author:** Claude Fable 5 (`claude-fable-5`)
**Date:** 2026-07-13
**Reason for handoff:** The Claude Code auto-model-switch flag has fired ~a dozen times in a few hours, repeatedly interrupting mid-turn and briefly swapping the model out from under the session. Andrew asked for a *fresh context window* (new session, not compaction) plus this document so the next instance starts clean and fully oriented. Read this top to bottom before doing anything else.

**Branch:** `sweet-summer-child` (NOT main — this is where all CLI/2A work lives; commit locally, do not push unless asked).
**HEAD at handoff:** `1dc85b4 cli: rename the executable to aic (+ aicoalesce) — AI Coalesce LLC`

---

## 0. Who you're working with and what this is

**Andrew Ross** (andrew@windycitydevs.io) — the operator, architect, and sole developer. Two months ago he founded a **Delaware LLC named "AI Coalesce."** The product lives at **aicoalesce.com**, assets at `assets.aicoalesce.com` / `assets-dev.aicoalesce.com`, and the WebSocket backend at **`wss://ws.aicoalesce.com`** (deployed on ECS Fargate; dev is `ws://localhost:4000`).

The platform is a **multi-provider AI chat system**: a ws-server backend that fronts **14 provider integrations** (anthropic, openai, gemini, xai/grok, sakana, mistral, cohere, deepseek, moonshotai/kimi, zai, meta, alibaba, minimax, vercel), plus **HMEM** (a bespoke cross-conversation memory system — see §7), plus a user vector store, image generation, TTS, and asset pipelines. The web clients are `apps/web` (production — treat as sacred) and `apps/web-next` (a throwaway-safe clone for experiments).

**The Sovereign CLI** (`packages/cli`) is a **fourth client** of that platform — a terminal chat client that speaks the same WebSocket contract as the web apps. It is the current focus of work. The executable was just renamed from `slipstream` to **`aic`** (alias `aicoalesce`). The internal codename "slipstream" still appears in the package scope (`@slipstream/*`), class names, and env vars — that broader rename is Andrew's to do "in coming days," NOT yours unless asked.

**The product trajectory (critical framing):** Andrew intends to distribute this. Near term: *"hey coworkers, try my BYOK sovereign CLI — access all the models, gateway key for the Chinese providers, direct keys for the rest, 25 free messages/day even without keys."* Then broader. It is **not** meant to stay single-operator forever. This distribution intent is what makes the Rust question (see §6) live rather than academic.

---

## 1. The operational hazards that keep biting (READ FIRST)

These are the things that have repeatedly gone wrong. Internalize them.

1. **Auto-model-switch flag.** Something flips the model mid-session (he keeps re-setting it to Fable 5 via `/model fable`). It has interrupted tool calls a dozen-plus times, fires even on trivial read-only turns (it hit during a bare `git status` and twice during this doc's own accuracy audit), and at least once also toggled the effort setting. **Consequence for you:** a turn may get cut off right after a tool call; edits made "under" a different model badge in this session were still verified and reconciled normally — don't distrust prior work just because the badge flickered. Keep turns tight and checkpoint often (commit working states) so an interruption never loses much.

2. **Compound-command poisoning.** Chaining commands with `&&`/`;` (especially a `git diff` or `pkill` bolted onto the command Andrew actually asked for) has failed repeatedly, and `pkill -f <pattern>` has matched *this shell's own command line*. **Rule:** run the exact command asked for, **alone**. Verify with separate follow-up commands. Kill background servers by **PID** (`ss -ltnp | grep :4000` → `kill -9 <pid>`), never `pkill -f`.

3. **Root-invoked builds/servers.** Build via **root turbo scripts from the repo root**: `pnpm build:cli`, `pnpm run:ws-server` (or `pnpm --filter=@slipstream/ws-server dev`). Precision: `pnpm build` *does* run package-locally, but Andrew wants the root scripts (dependency graph + turbo cache), and root-only scripts like `build:cli` hard-fail (EACCES) if invoked inside a package dir — I made that exact mistake twice. Memory: `feedback-root-invoked-workflows`.

4. **`pnpm typecheck` = tsgo, not tsc.** The repo uses `@typescript/native-preview` (tsgo). TypeScript is pinned at **^6.0.3** in the workspace catalog — it was briefly on 7.0.2 but rolled back (`c030127`) because typescript-eslint can't parse TS7 yet. Do not "upgrade" it.

5. **tsdown entry lists are prebuild-generated.** Both `apps/ws-server` and `packages/cli` generate their `tsdown.config.ts` entry arrays via `pnpm prebuild` (→ `scripts/automate-tsdown.ts`). **Never hand-edit the entry list** — add a file under `src/` (outside `tests/`/`scripts/`/`__out__/`) and run prebuild (or any build, which chains it).

6. **`packages/types/src/events.ts` is prod-web territory. Do not touch it without Andrew's explicit sign-off.** This is the single most-guarded rule of the session. `EventTypeMap` is "the contract of contracts" — the wire protocol shared by ws-server, apps/web, apps/web-next, and the CLI. Andrew halted a 3-round review-cycle-approved contract expansion because it modified this file. **CLI needs get solved at the CLI layer first.** Memory: `feedback-shared-contract-delineation`.

7. **Never blanket-revert a file (`git checkout --`).** Andrew often has parallel work in flight (he works alongside Codex/other models). Let him undo, or ask. This session I twice found `repl.ts` had scaffolding I didn't write (parallel work) — reconcile, don't clobber.

---

## 2. The hard rules (from CLAUDE.md — non-negotiable)

The repo's `CLAUDE.md` is the source of truth. Highlights you WILL trip on:

- **NEVER `any`.** Use `unknown` + narrow, or type it properly.
- **`satisfies` over `as`.** The only blessed bare `as` is `as const`, plus `satisfies X as X` in an overload *implementation* signature, plus the sanctioned `selectedModel.modelId as AllModelsUnion` (100+ models — memory `feedback-modelid-as-allmodelsunion-exception`).
- **NEVER `enum`** → `as const satisfies` objects or unions.
- **NEVER `.filter(Boolean)`** — it doesn't narrow. Use an explicit type predicate `(v): v is T => v != null`.
- **No barrel exports.** Explicit path imports with `.ts` extensions and `@/` / `@slipstream/` aliases.
- **NO output/reasoning token caps on model calls, ever.** Bound with wall-clock deadlines (`callDeadlineMs`), never tokens. (This is why the anthropic tool-round cap is now 10M — §5.)
- **`Array.of<T>()`** for typed empty arrays, not `[] as T[]`.
- **Prefer `Rm<T,K>`** (repo util) over `Omit`. `undefined` over `null` except where Prisma/DB DTOs force null.
- **`void`-prefix fire-and-forget promises** as an explicit non-blocking marker.
- Global augmentations exist: `JSON.parse<T>`, `Response.json<T>()`, `Object.keys<T>` return typed. Don't re-augment or assert around them.

**Memory system:** you have persistent memory at `~/.claude/projects/-home-dopaminedriven-cloneathon-t3-chat-clone/memory/`. `MEMORY.md` is the index (loaded each session). Key entries: `feedback-shared-contract-delineation`, `feedback-root-invoked-workflows`, `feedback-pnpm-typecheck`, `feedback-minimal-processing`, `project-memory-layer-plan` (HMEM), `project-sovereign-cli-status`. Write new facts as one-file-per-fact with frontmatter; update the index line.

---

## 3. What was accomplished this session (commit log with the *why*)

Newest first. The reasoning behind non-obvious choices is the part git won't tell you.

- **`1dc85b4` cli: rename executable to `aic` (+ `aicoalesce`).** Executable ONLY, per Andrew. `src/bin/slipstream.ts` → `src/bin/aic.ts` (git rename), `package.json` bin/exports/typesVersions repointed, launch banner now `aic · <url>`. Left alone (Andrew's broader pass): `@slipstream/*` scope, `SLIPSTREAM_*` env vars, handshake UA/`browserName`, `Slipstream*` class names.
- **`9774625` anthropic: tool-round cap → 10_000_000.** `apps/ws-server/src/anthropic/index.ts:321`. The wall-clock `callDeadlineMs` is the real bound; the round cap is just a runaway backstop. At 10M the silent-exhaustion tail (loop falls off the end with no terminal event → client hang) is unreachable-in-practice. NOTE: the tail still *exists* (dead code now) — task #5 (below) would make it terminal, but it's parked since there's no live risk.
- **`8d78338` cli: block-authoritative rendering — fix dropped text on provider switch.** THE big bug this session. Symptom: message opus, then switch to gemini, message again → only thinking shows, answer text vanishes live (but resume showed full text). Root cause: `renderChunk` guessed reasoning-vs-answer from *which delta field was populated* (`thinkingText` present → early-return, dropping the chunk). Fix: mirror the web store's ordinal-keyed block fold — branch on the block's **`type`** (THINKING/ENCRYPTED_THINKING/TEXT), slice each block's accumulating `content` by a per-ordinal watermark (robust to anthropic deltas AND gemini full-aggregate re-sends), and reconcile the finalize frame against authoritative blocks with zero dup. New `packages/cli/src/message-blocks.ts` (`isReasoningBlock`, `renderableBlocks`, `messageAnswerText`). Resume/`/expand` now source from `messageBlocks`, not the flat `content` column. **Debugging lesson recorded: I chased two wrong theories (gemini re-sends thinking on text frames) before Andrew gave the real repro — verify the repro before theorizing.**
- **`57791ba`** ws-server: dropped debug scratch from `automate-tsdown.ts`.
- **`bd8c87d` cli: live picker popup.** `/convo ` (or `/convos `) now opens the arrow-key picker *by keystroke* (Claude-Code `@`-mention style), not on Enter. A readline `keypress` watcher gated by `awaitingLine` detects the trigger, force-submits the pending line, and hands a `pickerRequest` seed to the loop. Also fixed a burst/paste race where atomically-typed trailing chars land in readline's fresh buffer during handoff — harvested into the seed.
- **`795cceb` cli: 2A correctness kernel — picker attach, local validation, zero contract changes.** THE architectural pivot of the session (see §4). Replaced typed-identifier `/convo` with an arrow-key picker over a frozen snapshot; invalid input rejected *at the CLI layer* (never sent to server); transactional attach (state commits only on matching hydration ack; mismatched/late acks discarded; 10s timeout notice); deleted `pendingPrompt`/trailing-prompt (the cross-conversation leak class); one `settleTurn` path + active-conversation guard. New `convo-picker.ts`. Live-verified.
- **`e0a8fd7`** toolchain: prebuild-generated tsdown entries for the CLI.
- **`c030127`** toolchain: rolled TS back to ^6.0.3 (typescript-eslint can't parse TS7).
- **`55e08f5`** cli: attach notice — "showing messages 85-92 · 48 hydrated" (ordinals and counts are different units; the old "of 48" read as a bug). Found by live-running.
- **`a18ca3b` cli: Phase 2.0 — readable resume.** `renderHydratedTail` renders newest 8 messages with FULL bodies + preserved whitespace (was 160-char flattened previews). Pathological-message cap at 10k chars with `/expand <ordinal>` recovery. New `hydrated-history.ts`. First CLI test suite.
- **`82c347e`** memory-store: HMEM overview doc (`architectural-decisions/memory-store/hmem.md`). HMEM = **Horizon-Mediated Episodic Memory** (Andrew's coinage — this was previously written NOWHERE; I'd guessed "Hierarchical" wrongly. Do not re-guess.).
- **`837cf73` / `a98895e`** sovereign-cli phase-two review cycle docs (Sol ↔ Fable, 3 rounds). **Superseded by the CLI-layer decision** — the correlation/operationId/ack-event machinery those docs proposed was *vetoed by Andrew* in favor of solving at the CLI layer (see §4). Do not resurrect the chat-ack/correlation design.
- **`19e156c`** toolchain: TS 7.0.2 + tsdown everywhere (tsup excised from db/ui) — the TS part was reverted, the tsdown migration stands.

**Test status:** `packages/cli` has **34 passing tests** (`pnpm --filter=@slipstream/cli test`) across `convo-picker.tests.ts`, `hydrated-history.tests.ts`, `message-blocks.tests.ts`. Typecheck/lint/build all green as of HEAD.

---

## 4. The 2A pivot — what "correct" looks like now (important context)

Earlier this session I ran a 3-round architecture review cycle (Sol + me) that converged on adding correlation to the wire contract: optional `operationId` on requests, new `hydrate_conversation_result` / `conversation_list_result` / `ai_chat_request_ack` events, an exhaustive runtime event registry, per-consumer disposition maps. I started implementing it in `events.ts`.

**Andrew stopped it and reframed the whole thing**, and he was right:
- The `/convo 11` silent-attach hang (bogus id → server `findFirstOrThrow` throws → no reply → client hangs forever) is a **CLI input-validation bug**, not a missing-server-event bug. On the web, routing makes invalid conversation input *structurally impossible*. The CLI should achieve the same impossibility via UI: **select server-fed entry objects from a list; typed text is only a filter; garbage never crosses the wire.**
- Review-cycle convergence (two models agreeing) is NOT operator sign-off. Andrew's pub-sub philosophy (consumers subscribe selectively; partial handler maps are deliberate) outranks the reviewers' "exhaustive disposition map" doctrine.

So the entire `events.ts` expansion was **reverted** and 2A was rebuilt at the CLI layer (commits `795cceb`, `bd8c87d`, `8d78338`). **The lesson (now in memory): exhaust CLI-layer solutions first; the shared contract is prod-web territory requiring explicit sign-off.** The review docs `sovereign-cli/{sol,fable}-findings*.md` are historical — the CLI-layer approach superseded them.

---

## 5. The CLI architecture (so you can navigate cold)

`packages/cli/src/`:
- `bin/aic.ts` — entry; constructs `SlipstreamReplService`, calls `.start()`.
- Service inheritance chain: `CliConfigService` → `SlipstreamClientService` (transport wrap) → `CliProviderContextService` → `CliRendererService` → `SlipstreamReplService` (the loop/orchestrator).
- `config.ts` — env (`SLIPSTREAM_WS_URL`/`_LOGIN_URL`/`_USER_ID`), builds a `cookieHeader` with location/client metadata that **is currently never sent** (known gap — Sol flagged it; the ws-server reads `req.headers.cookie` to build `UserData` for `user_location`/web_search geo, and the anonymous fallback happens to match Andrew's Barrington defaults).
- `chat-ws-client.ts` (612 lines) — ported browser WS client: reconnect+backoff, a **blind outbound queue** (flushes queued frames on reconnect — a latent double-send risk for chat), a hand-copied 44-event allowlist + ~265-line exhaustive dispatcher, `parseEvent` that checks `type` then asserts the whole payload (no field validation). `wsDebug.enabled` (toggle via `/debug`) narrates frames.
- `repl.ts` (547 lines) — the loop. Key state: `convoIndex` (Map, server-fed), `pendingAttach` (transactional), `messageIndex` (ordinal→message for `/expand`), `state` (active convo/model/systemPrompt), `turn` (PromiseWithResolvers), coordination flags `pickerOpen`/`awaitingLine`/`pickerRequest`. Connects with `?id=<userId>`.
- `convo-picker.ts` (260) — pure `rankConversationEntries`/`buildPickerView` (tested) + raw-mode `CliConvoPicker` (byte-chunk keypress reader, manual erase). `sanitizePickerTitle` collapses paragraph-length titles to one physical line (found live).
- `render.ts` (185) — block-authoritative streaming renderer (see `8d78338`). Append-only `stdout.write` ("minimal processing" house doctrine). `printedByOrdinal` watermark + `emitBlockPiece(type, piece)`.
- `message-blocks.ts` — block helpers over a structural `BlockBearingMessage` minimum.
- `hydrated-history.ts` — pure resume-window formatting.
- `types.ts` — `CLI_MODELS` (13-entry curated roster, compile-time constant; aliases like `fable`, `opus`, `gemini`, `deepseek`…).

**Wire flow (unchanged, preserve for parity):** `ai_chat_request` → `ai_chat_chunk`(one block each) → `ai_chat_response`(full convo + block array)/`ai_chat_error`. First chunk carries the real `conversationId`+`title` (rekeys `new-chat`). `userMsgId` rides every frame. `conversation_list_ack` = one per generator page (incremental Map upserts). `hydrate_conversation_ack` = pages of the convo tail.

**How to run/verify the CLI live:** `pnpm run:ws-server` (or `pnpm --filter=@slipstream/ws-server dev`) from root, wait for `:4000`, then `pnpm build:cli`, then drive `node packages/cli/dist/bin/aic.js` in a tmux session (`tmux new-session -d -s aic ... ; tmux send-keys ; tmux capture-pane -p`). The `run` skill covers this. Kill the server by PID afterward. Andrew's real session id is in `packages/cli/.env` — the CLI connects as him against real conversations (Expansio, Probing the Voyage, etc.).

---

## 6. THE LIVE THREAD — Rust rewrite decision (converging, unresolved)

This is the active architectural conversation and where the next real thinking is. Location: `architectural-decisions/sovereign-cli/rust/`.

- **`sol.md`** (Sol, GPT-5.6) — "Pragmatic Rust Rewrite," status *plan of record*. Argues: rewrite the CLI in Rust as a parallel replacement, generate the wire model from `EventTypeMap` via a TS-compiler-API generator, Tokio reducer + single terminal owner, Ratatui inline TUI, R0–R6 migration. Strong doc.
- **`fable.md`** (me, this session) — counter-review. Credits Sol's state-machine/reconnect/UTF-8-slicing/single-owner points, but contests: (1) the motivating "terminal ceiling" is *hypothetical* fragilities, not observed bugs (the one real bug was a render heuristic, fixed in TS in one commit); (2) "lower risk" is really *different* risk (Claude Code is TS and hits the caliber bar); (3) Ratatui abandons the working append-only doctrine for a portability rabbit hole; (4) **R1 buries a prod-`events.ts` contract refactor** — the exact thing Andrew guards; (5) sequencing skips the *actual* distribution gate, `aic login`; (6) "generate all event domains phase 1" over-inflates the generator against YAGNI. Counter-recommendation: do R1 (generator) + R2 (headless transport) as de-risking spikes with independent value; treat the contract change as its own signed-off gate; ship `aic login` + validate demand before greenlighting the R3 Ratatui TUI.
- **`sol-v2.md`** (Sol, just landed) — summarized here from its Revised Verdict/Concessions sections only (I read the opening ~30 lines; READ THE FULL DOC before leaning on details). **Accepts my two core corrections**: the shared-DTO narrowing must be an independently-reviewed contract gate (not bundled), and Rust trades risk rather than reducing it. **Holds firm on**: Rust as target architecture; generating asset/image/TTS events in phase 1 (they're intended CLI capabilities, `EventTypeMap` is authority); Ratatui must pass a focused terminal spike before the full TUI; cutover gated on parity + operator acceptance; and that `aic login` is only a blocker *if scope changes from single-operator to coworker distribution*.

**Where this actually stands / your job if it resumes:** the two sides have converged to ~"Rust is the target; do generator + headless transport as gated discovery; contract narrowing is separate and signed-off; Ratatui needs a spike; login is required iff/when distribution is real." The remaining genuine disagreement is a **product-scope question only Andrew can answer**: is this still a single-operator CLI (Sol's premise) or is coworker distribution now the active goal (Andrew stated distribution intent to me explicitly — coworkers, BYOK, 25/day)? If distribution is active, `aic login` and multi-tenant readiness move onto the critical path and the Rust cutover should NOT front-run them. **Do not restart the chat-ack/correlation design in any Rust work** (both sides agree). Andrew asked me to *review*, not to build — respect that this is still a decision doc, not a greenlight.

---

## 7. HMEM (the platform's crown jewel — you'll hear about it constantly)

**HMEM = Horizon-Mediated Episodic Memory** (Andrew's coinage; canonical def now in `architectural-decisions/memory-store/hmem.md`). It turns every conversation into a self-condensing archive. One write path + three read paths, all in `apps/ws-server/src/memory/` (`ConversationMemoryVectorService`):
- **Write:** on turn-persist, an indexing pass reads a fresh watermark (`lastIndexedOrdinalExclusive`, never cached — multi-instance CAS), DP-sections the unindexed range, claims sections via **watermark-CAS-plus-insert in one tx** (overlaps/gaps impossible by construction), Voyage contextualized-embeds them (family-packed), then a **§6.2 MoE roster** summarizes (`chunkIndex % rotation`). ACTIVE rotation as of handoff (verified in `memory/vector-store.ts:786-845`): **Sol (GPT-5.6) + 4 gateway arms — deepseek, minimax, qwen (alibaba), kimi**. Sonnet and zai/glm are *constructed but `enabled: false`* (config-flip re-enable; zai failed its gateway probe). Five gateway arm *instances* exist; four rotate. Folds route to Sol ("Sol remembers, sonnet logs"). Bounded by a **§8.5 global FIFO semaphore** (`SummaryJobSemaphore`, cap 12).
- **Read A — substitution assembly:** provider formatters call `getHistoryAssemblyView`; founding + live windows stay verbatim, READY sections substitute in the middle (serial-position shape).
- **Reads B/C:** `conversation_memory_search` (hybrid vector+text) + `conversation_memory_get_chunk` (by id/ordinal, prev/next) — chat models dual-wield these. The "Fish Test" (`memory-store/result.md`) is the proof it recovers *developing concepts across conversations*, not just documents.

Roster is LIVE (2026-07-10). Uncommitted drafts `memory-store/outlook.md` + `outlook-plan.md` are Andrew's in-flight work — leave them.

---

## 8. On the docket (remaining work)

1. **Resolve the Rust decision** (§6) — needs Andrew's product-scope answer (single-operator vs distribution-now). If/when he greenlights, the honest first moves are the generator spike + headless transport, with the `events.ts` DTO narrowing as a *separate signed-off change*. Not a build task yet — a decision.
2. **`aic login` auth/onboarding flow** — the real cohort-one distribution gate. Pattern converged in discussion (Andrew proposed redirect-to-web-app; not formally signed off — confirm details before building): loopback-redirect browser auth (like `gh`/`vercel`/`ant login`) — `aic login` opens the browser to a `/cli-auth` route on `apps/web`, stands up an ephemeral localhost server, web app mints a **CLI-scoped session** (not the raw web cookie; use existing `getAndValidateUserSessionById`) and redirects it to the loopback; CLI stores it, swaps the `.env` id. **BYOK falls out for free** — keys are already per-user server-side (web `api-key-settings`/`user-key-service`), so the CLI inherits them via session; zero key-handling in the client. This is TS work on `apps/web` + CLI, language-agnostic to the Rust question. Not started.
3. **Executable rename follow-ons** (Andrew's, "coming days"): `@slipstream/*` → `@aic/*` scope, `SLIPSTREAM_*` → `AIC_*` env vars, handshake UA/`browserName`, `Slipstream*` class names. Don't pre-empt.
4. **Parked (task #5):** anthropic loop silent-exhaustion tail — make it emit a terminal event (port the sakana `forcedLoopStopReason` fallback). Unreachable at 10M cap, so low-priority; do only if the exhaustion path becomes reachable.
5. **Known small fixes** surfaced but not done: the `package.json` `./renderer` export points at `dist/renderer.js` while the build emits `render.js` (broken published subpath — verified); the ws-server drain gate sends `user_tts_error` to *every* inbound event regardless of kind (not a reliable terminal chat frame); a cosmetic stray `>` when the picker hands stdin back to readline on cancel.

---

## 9. How to resume (concrete)

1. Read this doc, then `git log --oneline -14` and `git status` to confirm the state matches (HEAD `1dc85b4`, branch `sweet-summer-child`, working tree has only the uncommitted `outlook*.md` drafts, the `rust/` review dir, and minor pnpm/types churn that isn't yours).
2. Skim the three `rust/{sol,fable,sol-v2}.md` docs — that's the live thread.
3. Ask Andrew what he wants next; the two open fronts are the Rust decision (needs his scope call) and `aic login` (buildable now, TS, unblocks distribution). Don't assume — he steers, and he's been giving one constraint per turn.
4. When you build: root scripts, plain commands, PID-kill servers, don't touch `events.ts` without sign-off, run the 34 tests + typecheck/lint/build before committing, commit working states often (the model-switch flag means interruptions are frequent).

**Tone/working style Andrew likes:** honest sparring partner over rubber-stamp (he explicitly asks for counter-arguments); surgical minimal-blast-radius changes; verify claims against the code before asserting; live-run to verify, don't just typecheck; own mistakes plainly (I got the gemini theory wrong twice this session and said so — he valued that more than a confident wrong answer). He uses `:3` and `:'3` — he's warm, technically deep, and thinking several moves ahead about the product, not just the code.

Good luck, future me. The work is in good shape — 2A landed and is live-verified, the CLI is smooth-sailing per Andrew, and the only genuinely open thing is the Rust scope decision, which is his to make.

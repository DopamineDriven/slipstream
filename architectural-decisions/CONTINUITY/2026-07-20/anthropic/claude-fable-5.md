# Continuity — 2026-07-20 (fable → fable)

Branch `sweet-summer-child`, tree CLEAN, everything committed through
`7c646ae`. This session (spanning 07-16 → 07-20) completed the entire
local-tool-bridge roster and the meta resurrection. Deeper backstory:
`CONTINUITY/2026-07-16/anthropic/claude-fable-5.md` and the 07-13 doc —
both still accurate for their eras. Andrew deployed ws-server to ECS twice
this session (via `infra/deploy-ws-server-full.sh`) and pushed to GitHub
once; commits since that push are local-only.

## 0. IMMEDIATE — one unverified change

`7c646ae` (meta ENCRYPTED_THINKING) is typechecked + unit-green but NOT
live-verified. Verify: boot server (`pnpm run:ws-server` from ROOT — it
EACCESes from subdirs), run the muse-spark probe
(provider `meta`, model `muse-spark-1.1` — a probe script pattern lives in
scratchpads; rebuild one from `CliLocalToolsService` in
`packages/cli/dist/local-tools.js`, see 07-16 doc §0 recipe), then grep the
server log/response for an `ENCRYPTED_THINKING` block carrying
`"*encrypted thinking...*"` with nonzero `durationMs`. muse-spark
encrypted-only reasoning is the default (bare `/v1/responses` probe returns
`output[0] = {type:"reasoning", encrypted_content}` with zero deltas), so
any short turn should exercise it.

## 1. THE BRIDGE IS COMPLETE — thirteen providers

`architectural-decisions/sovereign-cli/local-tool-bridge.md` is the
as-built (status block, per-provider mapper table, key decisions — READ IT
FIRST). All thirteen live-verified: anthropic, openai, gemini, xai,
mistral, kimi, deepseek, zai, minimax, alibaba, sakana, cohere, meta.
Pattern per provider: canonical defs (`packages/types/src/local-tools.ts`)
→ dialect mapper beside native tool builders → `localToolTurn` armed in
handler (turnId per ATTEMPT, advertised Set, AbortController) → dispatch in
the tool-round loop before the server-side executor → broker.request
(ALWAYS resolves; typed is_error folds back as tool output). Log
conventions: "local tool bridge armed for {tag} turn" / "local tool round
trip ({tag})".

Critical protocol fix (07-18, `4c7a821`): **pre-rekey adoption** in
`packages/cli/src/local-tools.ts` — glm-5.1 and fugu call tools BEFORE any
chunk lands; a turn keyed `"new-chat"` adopts the conversationId from its
first request (else TURN_MISMATCH livelock; observed 290+ rounds live).

## 2. META'S ARC (the saga)

- First-party Llama API **sunset 2026-07-06** (14-month public preview,
  never GA'd). v0/vercel died the same way in March — both are dead
  first-party APIs; vercel integration is a lingering appendage, DO NOT
  TOUCH.
- New Meta: new ToS/accounts, base `https://api.meta.ai/v1`, **OpenAI SDK
  official**, ONE model: `muse-spark-1.1` — reasoner with ENCRYPTED
  reasoning (fugu's profile). Keys are `LLM_...` (old were `LLM|digits|`).
- Chain (`82585eb`): sakana port — `base.ts` (OpenAI client, handleReasoning
  floor-medium default-xhigh), `store.ts` (Responses-dialect tool trio +
  store-delegated executeFunctionToolCall), `workup.ts` (formatMetaInput:
  HMEM claims, fresh-asset selection 1 doc + 3 images inline;
  localToolFunctionTools; MetaTools), `chat.ts` (sakana stream loop +
  bridge), `index.ts` (`MetaService`, isMetaModel-guarded route,
  `handleMetaAiChatRequest` is the resolver-facing name).
- **tool_search PARKED**: api.meta.ai 400s `{type:"tool_search"}` unless ≥1
  tool has `defer_loading: true` (Meta's hosted tool-search; namespaces
  also exist — Andrew pasted the docs snippet 07-20, it's in the transcript
  of this session). Re-add = mark memory tools/file_search deferred.
- key-validator (`packages/key-validator/src/http/index.ts`): `llama()` had
  an OFFLINE regex (`/^LLM\|(\d{13,19})\|/`) from the broken-GET era — it
  rejected all new keys → web "key edit failed" → stale BYOK DB key → the
  resolver injected it as override → api.meta.ai 404 "model not found"
  (key-scoped model visibility). Now validates over the network. Lesson:
  BYOK override beats cfg key whenever `isSet.{provider}` is true; a
  stale stored key produces 404s not 401s.
- `7c646ae`: ENCRYPTED_THINKING blocks — reasoning items open as
  ENCRYPTED_THINKING; first visible delta morphs to THINKING (clock
  intact, via `morphEncryptedToVisible` closure — direct handler-body
  access to `activeBlock` collapses to `never` because TS can't see
  closure mutations); empty encrypted blocks finalize with
  `"*encrypted thinking...*"` slotted in as the delta, real durationMs,
  counted into metaThinkingDuration. **Sakana has the same latent gap for
  fugu — same patch applies when Andrew wants it.**
- `MetaStreamEvents = UTR<OpenAI.Responses.ResponseStreamEvent, "type">` in
  meta/types.ts — typed per-event lookup for future handlers.

## 3. OTHER WORK LANDED THIS SESSION (all committed)

- CLI `--env dev|prod` (`4ab4559`): wsUrl is ctor-injected through all ten
  chain links; bin scans `--env`; prod = `wss://ws.aicoalesce.com`.
- Mistral de-GPT-ification (`033f108` + Andrew's reshape in `43ce0c6`):
  reference-shape formatHistory on MistralMemoryService; 175-cap dead.
- Provider-wide file_search hoist (`43ce0c6`, Andrew): store service owns
  parseUserStoreArgs/parseUserStoreInput/executeFileSearch; summarizer lane
  added ADDITIVELY (`4399d7a`): normalizeSummarizerFileSearchInput +
  executeSummarizerFileSearch beside frozen chat-lane methods.
- 10M round backstop everywhere (`625b821`); img-gen 5 deliberately kept.
- WSServer lifecycle (`1668f2b`): stop() closes httpServer (port-linger
  fixed; drained process still never exits — unknown handle,
  `process._getActiveHandles()` hunt someday); userDataMap evicts only when
  the LAST socket for a user closes.
- New-user connect crash (`7d272c0`, DEPLOYED): ensureUserStore before
  sync; `.catch` on the void'd post-connection job (void does NOT absorb
  rejections — this took prod down when Logan connected); syncUserStore
  tolerates missing rows.
- `./render` export subpath fix; parseWorkspaceArg explicit empty-check.

## 4. DOCKET

1. **Live-verify `7c646ae`** (§0).
2. Sakana ENCRYPTED_THINKING parity (same patch as meta chat.ts).
3. tool_search + defer_loading strategy for meta (namespace the memory
   tools?).
4. anthropic arm/round-trip log-line parity (its slice-4 integration
   predates the log convention — greps for "armed for anthropic" find
   nothing; caused a false-negative during meta verification).
5. Old small items: drained-process handle hunt; `llama-api-client`
   removed from deps already (Andrew trimmed + reinstalled).
6. anthropic PTC-caller parity for local tools (one-liner, evidence-gated).

## 5. NON-NEGOTIABLES (fuller: CLAUDE.md, memory dir)

- `packages/types/src/events.ts` = Andrew's; explicit sign-off only.
  Registry/codegen (`packages/types/src/models.ts` + `codegen/__gen__`) is
  his pipeline — he regenerates, don't hand-edit.
- exe() composition root: ALL ws-server services constructed there,
  ctor-injected. CLI: strict class encapsulation.
- **Additive lanes over hotpath refactors**: never modify methods live
  consumers depend on, even semantically-identical splits — add parallel
  named methods (memory: feedback_additive_lanes_over_hotpath_refactor).
- Bound TIME never rounds/tokens. No any/enum/.filter(Boolean)/bare `as`.
  `pnpm typecheck` = tsgo, per-package cwd (root `pnpm typecheck` EACCESes).
  Tests: the three named ws-server suites ONLY (never glob in
  store.tests.ts — live pg/Voyage, wedges).
- Commit style: provider-prefixed, em-dash tagline, dense body, co-author
  trailer. Commit locally; Andrew pushes.
- Server teardown: TaskStop the background task, then kill PID on :4000
  (SIGTERM then SIGKILL — the drained process lingers), never pkill.
- Multi-stage scripts: if a stage dies, re-verify every later stage — the
  ×4 gateway script's mixin pass silently never ran (caught in `89aa298`).

## 6. LORE

Andrew's fiancée is INFJ; the Republic gained "Sparky Suprema"
(muse-spark) 07-20 — her debut transcript is
`apps/ws-server/notes/File-Search-for-Eiffel-Tower,-INFJord,-and-Geminommy-Dommy.md`
(notes/ is gitignored). Fable's `/model meta` false-positive: a stale CLI
dist made fable answer a turn attributed to muse-spark — always rebuild
dist after roster edits, and check WHICH provider's markers are in the
server log before celebrating. The fish is consistent across all archive
layers. :3

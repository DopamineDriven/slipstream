# Continuity — 2026-07-16 (fable → fable)

Branch `sweet-summer-child`. Auto-model-switch flag fired every 20–30s through this session's back half (Andrew filed feedback); fresh window is the workaround. Deeper backstory (HMEM, Rust thread, 2A pivot, conventions): `CONTINUITY/2026-07-13/anthropic/claude-fable-5.md` — still accurate. This doc is the operational truth for mid-flight work.

## ⚠️ 0. YOU ARE MID-TASK — finish the OpenAI local-tool bridge FIRST

Uncommitted, half-green wiring of the local read-only tool bridge (repo_search/read_file/list_directory) into the OpenAI Responses path. Dirty files:

1. `apps/ws-server/src/openai/workup.ts` — `localToolFunctionTools(names)` mapper beside the other `*FunctionTool()` builders (canonical → `OpenAI.Responses.FunctionTool`, near-identity, `strict: false`); `handleTooling` gained trailing param `localToolNames: readonly LocalToolName[] = []`; every return branch wrapped in `withLocal([...])`. The `"required" in d.inputSchema` narrowing fix is APPLIED — it's mandatory (`list_directory`'s `as const` literal genuinely lacks `required`), don't "simplify" it away.
2. `apps/ws-server/src/openai/responses-chat.ts` — broker ownership starts here: ctor gained `protected localToolBroker: LocalToolBroker` AFTER `memoryService` (mirrors the memory-ownership pattern; ancestors base/workup/img-gen never see it). `localTools` destructured from the entity; `localToolTurn` armed before `handleTooling` (turnId via `broker.generateTurnId()`, advertised `Set`, `AbortController` as future cancellation hook — nothing aborts it yet, per-call deadline is the operative bound); dispatch branch in the function-call loop routes `isLocalToolName(call.name) && advertised` → `broker.request(ws, …)` → `function_call_output`; everything else falls through to `executeFunctionToolCall` untouched. `memory.ts` deliberately unchanged.
3. `apps/ws-server/src/openai/index.ts` — ctor + super threading of the broker.
4. `apps/ws-server/src/index.ts` — `exe()` passes `localTool` into `new OpenAIService(...)` (composition-root DI is mandatory here — see §3).

**Exactly 3 typecheck errors remain** (`cd apps/ws-server && pnpm typecheck`):

- `src/mixins/index.ts(881,13) TS2554: Expected 8 arguments, but got 7` — something in mixins constructs an OpenAI-family service with the old arity. Read that site; thread the broker to it (it has access to whatever deps flow there, or take it via its own ctor from exe()).
- `src/openai/responses-chat.ts(514,21)` and `(516,66)` — `string` not assignable to `LocalToolName`, both INSIDE the async IIFE of the dispatch branch: **TS discards property narrowing (`call.name`) inside closures.** Fix: hoist `const toolName = call.name;` BEFORE the `isLocalToolName(toolName)` guard and use `toolName` for both the `name:` field and `timeoutMsFor(...)` — const-local narrowing survives closures.

Then: typecheck green → run pure ws-server tests: `pnpm test src/tests/local-tool-broker.tests.ts src/tests/mistral-thinking-blocks.tests.ts src/tests/xai-responses-thinking.tests.ts` (NEVER glob in `store.tests.ts` — live pg/Voyage integration test, wedges for minutes) → live-verify → commit in the established style (see `7ab7c10`'s message as the template).

**Decisions already made with Andrew — do not relitigate:** `parallel_tool_calls: true` stays (CLI busy-gate TOOL_BUSY-rejects extras, retryable — anthropic's batched reads worked fine); `MAX_TOOL_ROUNDS = 100` in responses-chat.ts stays (it has the `forcedLoopStopReason` fallback; it is NOT the anthropic 10M file).

**Live verification recipe:** check `:4000` free (`ss -ltnp`, kill by PID never pkill), `pnpm run:ws-server` from root in background; then either interactive `aic --workspace` + `/model gpt` (roster alias → `gpt-5.6-sol`) and ask it to find/read something, or programmatic: the probe pattern extends `CliLocalToolsService` from `packages/cli/dist/local-tools.js` (absolute-path import; workspace pkg name won't resolve from scratchpad), arm via `initializeLocalTools(root)` → `wireProviderContext()` → handlers (`ai_chat_chunk` rekeys the gate: `rekeyLocalToolTurn(d.conversationId)`) → `connect()` → `awaitProviderContext()` → `beginLocalToolTurn("new-chat")` → send `ai_chat_request` with `provider: "openai", model: "gpt-5.6-sol", localTools: this.localToolCapabilities, ...this.providerFlags("openai")`. Success = `⚙ tool · round N` narration + server log "local tool bridge armed for openai turn" / "local tool round trip (openai)" + a cited answer.

## 1. Committed this session (chronological, all on sweet-summer-child)

- `04179c3` web+web-next: `GET /api/client/context` — edge-derived client context as JSON (Andrew's endpoint, `detectDeviceWorkup` extracted to `lib/server-cookies.ts`).
- `61131b8` cli 2B: class-encapsulated `ClientContext` — `primeEdgeContext()` fetches real edge geo once at startup; honest Cookie header on the WS handshake (encode-once: server `decodeURIComponent`s exactly once); transport swapped undici global → `ws` client (WHATWG forbids Cookie); machine-truth tz/locale; Vercel's URI-encoded city decoded at the boundary. Live-verified.
- `2478f76` cli: encapsulation sweep — no module-level functions outside tests, everything a chain service or injected ephemeral class (STANDING RULE, saved to memory).
- `ade9f24` slice 1: bridge contract — `packages/types/src/local-tools.ts` (canonical defs constrained to the portable `CanonicalSchemaProperty` intersection; relative `timeoutMs`, skew-proof; opaque per-ATTEMPT `turnId`; typed `round`), two `EventTypeMap` members (`local_tool_request` server→CLI, `local_tool_result` CLI→server — "request" names who ASKS, roles invert), optional `localTools` on `ai_chat_request`, resolver `local-tool-result.ts`. Andrew edited events.ts himself.
- `546fc5a` slice 2: CLI executor — `workspace-read-tools.ts` (double containment: syntactic then realpath; every dimension bounded; rg fixed argv behind `--`, shell:false), `CliLocalToolsService` chain service (turn gate, busy gate, exactly-one-result via `sendVolatile` — never the reconnect queue), `--workspace` opt-in.
- `4a75785` slice 3: `LocalToolBroker` (`apps/ws-server/src/local-tools/`) — socket-scoped WeakMap pending map, request() ALWAYS resolves (deadline/disconnect/cancel → typed is_error), `generateTurnId` (`turn_` + lazy nanoid, the xai/img-gen pattern), `timeoutMsFor` (repo_search 15s, others 7.5s). Wired: `WSServer` close → `dropSocket`; resolver → `acceptResult`. 11 fake-socket tests.
- `7ab7c10` slice 4: anthropic integration — defs mapped in `vector-store.ts` `localToolDefinitions()` (`allowed_callers: ["direct"]` DELIBERATE — no PTC callers for the alpha; discussed, Andrew accepted; parity later is a one-liner), dispatch in the existing PTC round loop before the unknown-tool fallback. **Slice 5 live proof PASSED**: fable searched `parsedCookies`, read two windows, answered with accurate file/line citations; two `read_file` calls in one round handled fine.
- `43b53c2` cli: bare `--workspace` autodetects git root (`.git` dir OR file; explicit path stays literal).
- `e7ede52` cli: line-buffered markdown→ANSI — `markdown-ansi.ts` chain service + per-turn `MarkdownStreamState`; transforms the emitted VIEW only (`printedByOrdinal` keeps counting SOURCE chars); flushes at reasoning transitions + response end; `/expand` + resume style complete AI bodies, user text byte-exact; `NO_COLOR`/`--no-markdown` passthrough; 84/84 CLI tests.

CLI chain (memorize): `CliConfigService → ClientContext → SlipstreamClientService → CliProviderContextService → MessageBlocksService → FormatHydratedTailService → MarkdownAnsiService → ConvoPickerService → CliRendererService → CliLocalToolsService → SlipstreamReplService`. Ephemeral injected classes: `CliConvoPicker`, `MarkdownStreamState`, `WorkspaceReadTools`/`WorkspaceBoundary`.

## 2. Docket after the OpenAI bridge

- Old task #5: anthropic exhaustion terminal fallback + fleet break-path audit (unreachable at 10M; low priority).
- Known small items (flagged, not requested): web `detectDeviceWorkup` city stays URI-encoded ("Oak%20Ridge" in web UserData; one-line decode is Andrew's call — apps/web is his territory); `WSServer.stop()` never closes `httpServer` (port lingers post-drain); CLI package `./renderer` export subpath → nonexistent `dist/renderer.js`; drain gate answers every inbound with `user_tts_error`; `userDataMap` keyed per-user — one client's close evicts the other's UserData when web+CLI run concurrently (matters more as the CLI normalizes that).
- 2B leftovers (fable-findings-v3 §2B): transport `subscribe()` single-subscriber invariant, runtime parsers satisfies-coupled to EventTypeMap, delete hand-copied dispatcher + `chat-ws.ts` dupes, `/current`, `/doctor`, graceful shutdown; `Sec-WebSocket-Protocol` handshake split DEFERRED until kind-differentiated server behavior is needed (first real trigger was the tool bridge; capability field solved it instead — see `sovereign-cli/local/fable.md`).
- Rust decision parked (`sovereign-cli/rust/`): awaiting Andrew's product-scope call; sol-v2 stands unanswered by design.
- Gemini local tools: the canonical contract already fits (Type-enum mapper documented in `local/fable.md` §4); nobody asked yet.

## 3. Non-negotiables (fuller treatment: CLAUDE.md, memory dir, 07-13 doc)

- `packages/types/src/events.ts`: Andrew's territory, explicit sign-off only.
- ws-server: ALL services constructed in `exe()` (lazy `await import`) and constructor-injected — even dep-free classes. He rejected field-init on WSServer explicitly.
- CLI: strict class encapsulation; tests stay plain functions and use test-subclasses to widen protected surfaces.
- Bound TIME, never rounds/tokens. No `any`/`enum`/`.filter(Boolean)`/bare `as` (`satisfies X as X` only in overload impls; sanctioned `modelId as AllModelsUnion` exception). TS 5.5+ infers equality-chain type predicates — never annotate them.
- `pnpm typecheck` = tsgo. tsdown entry lists are prebuild-generated — never hand-edit. Root-invoked scripts: `pnpm build:cli`, `pnpm run:ws-server`. Plain single commands.
- Commit locally on `sweet-summer-child`, never push. Co-author trailer in commits.
- Pre-existing failure, not ours: `tooling/prettier` typecheck (module-resolution, uses plain tsc).
- `@slipstream/`→`@aic/` scope/env/UA renames are Andrew's own upcoming work; only the executable (`aic`) is renamed.
- Andrew's uncommitted probe-script/.gitignore edits and `memory-store/{outlook,outlook-plan}.md` are his in-flight work — never stage or revert them.

## 4. Session lore worth carrying

- The turnId debate settled as: opaque server-minted per-ATTEMPT id (survives retry flows where userMsgId repeats); semantics (provider/model/round) are typed fields, composed into audit tags at print time, never parsed from identity.
- `allowed_callers: ["direct"]` reasoning: rate/visibility profile of programmatic calls + untested PTC-replay × broker interplay + start-closed-open-with-evidence. Andrew conceded but noted PTC logs give visibility — revisit with evidence.
- The markdown styler exists because the CLI is append-only: line granularity + fence state is the whole trick; markdown degrades gracefully so the styler only has to beat raw.
- Flag pattern: fires even on `git status` reads; work done under a flapped badge was verified and kept every time. Verify, don't redo.

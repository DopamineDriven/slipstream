# Local Read-Only Tool Bridge — Implementation Outline

**Author:** Claude Fable 5
**Date:** 2026-07-14
**Inputs:** [`sol.md`](./sol.md) (provider-neutral bridge outline),
[`fable-findings-v3.md`](../fable-findings-v3.md) §3-alpha (the plan-of-record
spec this implements), the live tree as of commit `2478f76`.
**Status:** Implementation outline for Andrew's review — the `events.ts`
slice is gated on his explicit sign-off.

## Verdict on sol.md

Adopt roughly 80% of it, most of it near-verbatim. The contract module, the
socket-bound broker, the double-containment boundary, the `input: unknown`
posture, and the volatile-send discipline are all correct and correctly
reasoned — several are catches I'd have wanted a reviewer to make (the
reconnect-queue poisoning in particular is real: our `ChatWebSocketClient.send`
queues when the socket isn't OPEN, and a replayed `local_tool_result` after
reconnect answers a promise that died with the old socket).

The remaining 20% splits three ways: two **doctrine violations** to correct,
one **framework to defer**, and a handful of **ground-truth mismatches** where
sol.md was written without the tree in front of it.

## Adopted verbatim (or nearly)

1. **`packages/types/src/local-tools.ts`** — names, error-code union, per-tool
   output shapes, `LocalToolRequest`/`LocalToolResult`, canonical JSON-Schema
   definitions, `isLocalToolName`. Exactly two new `EventTypeMap` members;
   one optional `localTools` capability field on `ai_chat_request`
   (strong-additive on both counts). Capability absent → zero tool
   definitions attached to the provider request — the hard flag, never
   inferred from user agent.
2. **Socket-bound correlation.** `WeakMap<WebSocket, Map<turnId:toolCallId,
   pending>>` — serialized IDs alone never confer authority; another socket
   cannot satisfy a pending call even knowing every identifier. This
   supersedes v3's `operationId` envelope (superseded by the 2A CLI-layer
   pivot) with something strictly stronger.
3. **The broker always resolves, never rejects.** Timeout, turn abort,
   disconnect, duplicate, stale — every path synthesizes a typed failure
   result. This is v3's exactly-one-terminal invariant applied to the
   inverted (server→CLI) direction; a vanished CLI can never wedge a
   provider loop.
4. **Double containment:** `resolve(root, path)` + syntactic `..`/absolute
   rejection first, `realpath` + re-check second (symlink escapes), NUL-byte
   rejection, binary sniff, every dimension bounded (bytes, lines, entries,
   depth, matches, subprocess time, subprocess buffer). `rg` is a fixed
   executable with structural argv, `--` before the query, `shell: false`.
   No model value ever becomes a command string.
5. **`input` stays `unknown`** across the wire; the CLI narrows with explicit
   validators. JSON Schema guides generation; it validates nothing.
6. **`sendVolatile`** on the transport: returns `false` instead of queueing
   when the socket isn't OPEN. `local_tool_result` uses it exclusively.
7. **Direct `ws.send` for `local_tool_request`** — never the Redis broadcast
   path. The provider turn and the originating socket live on the same
   instance by construction; the relay must never fan a tool request out.
8. **CLI turn gating** (reject `TURN_MISMATCH` / `TOOL_BUSY` / late-arrival
   `DEADLINE_EXCEEDED` before touching the filesystem) and the audit line
   per execution.

## Corrections

### 1. `MAX_TOOL_ROUNDS = 8` — house-rule violation, and a fresh one

Sol's orchestrator caps tool rounds at 8 and **throws** on exhaustion. We
spent this week eliminating exactly this bug class: the round-8/9 UI hang
came from a silent round cap, the fleet backstop is now 10M, and the house
rule (CLAUDE.md, "Model Call Budgets") is explicit — *bound time, never
rounds*. The throw additionally violates exactly-one-terminal (an uncaught
throw emits no terminal frame — the precise `anthropic/index.ts:1209` defect
2A flagged). Correction: the **turn-level wall-clock deadline** (the
existing `callDeadlineMs`-style abort signal) is the only loop bound; if it
fires, the turn finalizes through the normal error path as `ai_chat_error`.
Per-call deadlines (15s search / 7.5s read / 7.5s list) are wall-clock and
stay.

### 2. Relative deadline, not absolute epoch

`deadlineAt` as epoch-ms assumes the CLI clock and server clock agree. Same
machine today, not forever — clock skew silently pre-expires or over-extends
requests. Ship `timeoutMs` (relative); each side computes its own local
deadline and both enforce. Skew-proof, one-line change, painful to retrofit
after the field is on the wire.

### 3. `turnId` is server-minted — sol §6 presumes IDs we don't have

Sol reuses a *client-generated* `userMsgId` as `turnId`. Ground truth: the
CLI sends no `userMsgId` — it's server-owned (first-chunk contract), and
changing message-ID ownership is a prod-web-contract question that has
nothing to do with this feature. Correction: the **server mints `turnId`**
per `ai_chat_request` (it owns the turn), stamps it on every
`local_tool_request`, and the CLI **echoes** it. CLI-side gating needs no
foreknowledge of the ID under the alpha's one-turn/one-tool constraint:
accept iff a turn is in flight AND `conversationId` matches the active
conversation AND no execution is running; echo `turnId` back. Server-side,
the socket-bound key (`turnId:toolCallId`) still kills every stale/cross-turn
case. All of sol's rejection properties survive with zero new contract
surface on `ai_chat_request` beyond `localTools`.

### 4. The §3 ProviderAdapter framework — defer it

`ProviderTurn`/`ProviderAdapter`/`ProviderLocalToolLoop` is a provider-layer
rewrite smuggled in as a sub-section — the same move I flagged in the Rust
review (R1 burying a contract refactor). Our providers aren't shaped as
adapters, and the anthropic service **already has** a streaming tool-round
loop dispatching `server_tool_use` (PTC/code-execution), model `tool_use`,
and the HMEM memory tools (`anthropic/index.ts:317-600`). The alpha
integrates there: inside the existing dispatch, `isLocalToolName(name) &&
capabilityAdvertised` → `broker.request(...)` → feed the `tool_result`
block back into the existing continuation machinery; every other name takes
today's path untouched. Sol's real requirement — *the shared types never
import a provider SDK* — is satisfied by the contract module alone.
`packages/types/src/local-tools.ts` IS the provider-neutral core; the
canonical-turn interface can be extracted later, when a second provider
actually joins, as a refactor of two working implementations instead of a
speculative framework under zero.

**The one adapter piece that survives into the alpha: definition
translation** (Andrew's catch). The canonical JSON-Schema definitions are
the *source*, never the literal wire payload — Google requires its
`Type.OBJECT`/`Type.STRING` enum dialect, Anthropic carries extra fields
(`allowed_callers` under PTC), OpenAI has strict-mode flags. The tree
already establishes the pattern: the HMEM memory tools are defined
per-provider in native dialect. Two rules make the mappings total and
mechanical:

1. **Canonical schemas constrain themselves to the portable intersection**
   — flat object, primitive leaf types (`string`/`integer`/`boolean`),
   `description`, `required`. All three tools already comply; this is a
   standing constraint on any future tool, not a convention. Each
   provider's mapper lives beside that provider's existing tool
   definitions (anthropic: near-identity into `input_schema`; gemini:
   the `Type`-enum walk, unsupported keys like `additionalProperties`
   dropped). No general JSON-Schema transpiler.
2. **`allowed_callers` is a security boundary, not syntax.** Local tools
   are direct model calls ONLY — explicitly not invocable from inside code
   execution. A PTC loop programmatically firing filesystem reads is a
   capability escalation the one-call-at-a-time audit story doesn't cover.
   The anthropic mapper restricts callers deliberately rather than
   inheriting the memory tools' settings.

### 5. Encapsulation + chain placement (post-`2478f76` reality)

Sol's chain sketch is stale (predates `ClientContext` and the encapsulation
sweep) and his executor module is built from module-level helper functions —
now banned in this package. Corrections:

- `WorkspaceBoundary` and `WorkspaceReadTools` stay classes; `asRecord`,
  `requiredString`, `optionalInteger`, `errorCode`, etc. become private
  methods (validator methods on `WorkspaceReadTools`, path logic on
  `WorkspaceBoundary`). `ToolFault extends Error` stays.
- `CliLocalToolsService` splices into the real chain:
  `… → CliProviderContextService → CliLocalToolsService →
  MessageBlocksService → … → SlipstreamReplService` (positional link, per
  the house pattern). It owns the `local_tool_request` handler, the
  active-turn gate, the busy flag, and the audit log.
- `WorkspaceReadTools` is an owned instance created by
  `initializeLocalTools(workspaceRoot)` — the `CliConvoPicker` pattern:
  a non-chain class with real state, constructor-built, not spliced.
- Flat files per package convention: `src/local-tools.ts` (chain service) +
  `src/workspace-read-tools.ts` (executor + boundary). The prebuild glob
  picks both up; no tsdown hand-edits.
- Repl surface: `beginLocalToolTurn`/`endLocalToolTurn` wrap the existing
  send/settle path (`settleTurn` already exists); a dim one-line narration
  per call — `⚙ repo_search "parsedCookies" · 12 matches · 230ms` — because
  the stderr JSON audit is for debugging, and the dopamine ping deserves to
  be visible.

### 6. Small defects in sol's sketch (fix in implementation)

- Unknown-tool rejection labels the result `name: "read_file"` — sol
  self-flagged it; canonical result `name` widens to `string`.
- `errorCode(error) === 1` for rg's no-match exit relies on `code` being a
  number across platforms/abort paths — narrow explicitly (`typeof code ===
  "number" && code === 1`), everything else is `EXEC_FAILED`.
- web/web-next need **no changes** (Andrew's call, overriding v3's
  disposition-map doctrine): registration in `events.ts` is the
  acknowledgment — opt-in consumers simply never dispatch what they don't
  handle, exactly as `ConversationList`/`ConversationListAck` behave today.
  The contract slice touches `packages/types` only.
- Drain interplay: during ws-server drain the message gate rejects inbound
  frames, so an in-flight `local_tool_result` dies at the door and the
  broker's deadline synthesizes the terminal — correct by construction, but
  worth a test.

## Implementation slices (each independently green)

1. **Contract** *(gated on Andrew's sign-off — touches `packages/types`
   only; web/web-next unchanged)*: `packages/types/src/local-tools.ts`,
   two `EventTypeMap` members, optional `localTools` on `ai_chat_request`,
   runtime registry entries, CLI allowlist additions.
2. **CLI executor (offline-testable)**: `workspace-read-tools.ts` +
   `local-tools.ts` chain splice + `sendVolatile` on the transport + tests
   (containment matrix, validator matrix, windowing/truncation, busy/
   mismatch gating via synthetic `local_tool_request` injection). No server
   required to prove this slice.
3. **Server broker**: `apps/ws-server/src/local-tools/local-tool-broker.ts`
   (sol's, with relative deadlines), resolver wiring for
   `local_tool_result`, `dropSocket` on close. Unit-tested with a fake
   socket.
4. **Anthropic integration**: capability check → merge canonical definitions
   into the existing tool array → local-name dispatch inside the existing
   round loop → `tool_result` continuation → wall-clock bound only →
   exactly-one-terminal audit of every break path (the 2A server obligation,
   arriving with the feature).
5. **Live proof**: local ws-server + `aic --workspace .`, ask Fable to find
   and explain an unfamiliar implementation; the recorded session with
   file/line references is the alpha's success criterion (both reviewers,
   independently, per v3).

## Test gate (delta over v3's)

- Traversal / absolute / symlink / NUL / URL-encoded-dot paths →
  `PATH_OUTSIDE_WORKSPACE` or `INVALID_INPUT`, never execution.
- Truncation metadata present at every bound (bytes, lines, entries,
  matches).
- Stale `turnId`, duplicate `toolCallId`, wrong-socket result, post-deadline
  result: rejected without execution or double-settle.
- CLI disconnect and deadline expiry mid-call each produce exactly one
  terminal turn event server-side.
- Capability absent ⇒ provider request carries zero local tool definitions
  (assert on the outbound Anthropic payload, not on downstream behavior).
- `local_tool_result` never enters the reconnect queue (socket-closed send
  returns false; nothing replays).
- Round-loop bound is wall-clock: a synthetic always-calls-tools model hits
  the turn deadline and finalizes as `ai_chat_error`, not a round cap.

## Open for Andrew

1. **Sign-off:** slice 1's exact shapes (this doc + sol.md §1 as amended
   above) before `events.ts` is touched.
2. **Branch posture:** plan of record says experimental branch; everything
   this week has landed on `sweet-summer-child`. Either works — slices 1–3
   are inert without slice 4.
3. **Workspace opt-in UX:** `--workspace <root>` argv flag vs `/workspace`
   repl command (I lean argv flag: capability is fixed at connect time,
   which keeps mid-turn capability flips unrepresentable).

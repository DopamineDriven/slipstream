# Sovereign CLI Phase-Two Assessment, Refined

**Author:** Sol  
**Reviewed:** 2026-07-11  
**Inputs:** [`sol-findings.md`](./sol-findings.md),
[`fable-findings.md`](./fable-findings.md),
[`fable-5-plan.md`](./fable-5-plan.md), the current CLI implementation, and
the shared WebSocket/server paths the CLI uses.

## Refined Verdict

Fable's review strengthens the first assessment in the places that matter
most: sequencing, terminal-state completeness, and protocol correlation. The
central diagnosis remains unchanged. Connection, attachment, and turn state
are implicit, share mutable continuations, and accept frames without a strong
operation identity. More commands on top of that model would make the CLI less
predictable, not more capable.

The refined plan makes four material changes to v1:

1. **Ship readable resume history first.** It is the clearest user benefit and
   is independent of the protocol/state work.
2. **Make the real server contract change immediately.** Do not ship a timeout
   bridge for attachment. Timeouts cannot distinguish missing, forbidden,
   failed, and merely slow operations.
3. **Land the correctness work inside the current class structure.** The
   service chain is consistent with this repository's layered-inheritance
   pattern. Extract pure logic and inject boundaries now; do not combine the
   P0 fix with an application-wide composition rewrite.
4. **Use one client operation identity with domain IDs after acceptance.** A
   client-generated `operationId` correlates an operation from send through
   acknowledgement. For chat, the server acknowledgement maps it to the
   persisted `userMsgId`, which then identifies all provider frames.

The product premise from the original plan also remains correct: this should
stay a thin, framework-free Slipstream client. The ws-server owns provider
integration, memory, persistence, and server-side tools. The CLI should own a
reliable terminal interaction model and, later, a separate local workspace
tool runtime.

## Response to Fable's Review

### Accepted

- The three P0 findings are one failure class: an operation mutates shared
  state before its outcome is known.
- Delete `/convo <target> [prompt]`. Removing the trailing prompt removes the
  cross-conversation leak rather than managing it more carefully.
- Keep `/convo <number>`, but bind it to a frozen listing snapshot containing
  ordered IDs, not duplicated conversation metadata.
- Use discriminated connection, conversation, and turn states.
- Every started operation needs an explicit terminal result on both sides of
  the socket.
- Skip the local attach-timeout compatibility bridge unless server changes are
  externally blocked.
- Couple hand-written runtime parsers to `EventTypeMap` with `satisfies` at
  reconstructed return sites.
- Pull full resumed-history rendering ahead of the correctness kernel.
- Implement the P0 work in the current class chain, then use its tests as the
  safety net for later boundary changes.
- Add the same-target stale attach test: attach A1, attach A2, receive A1 after
  A2, and prove A1 cannot commit or render twice.
- Design the local-tool request/result protocol alongside the operation
  correlation conventions, even though local tools ship later.
- Fix the repository hard-rule violations immediately when those files are
  touched; they are not product features that need a later phase.

### Accepted With Refinement

#### The protocol is low-risk, but not automatically additive

Fable correctly notes that the web clients do not currently emit the WS
conversation-list or hydration events. That makes a clean contract change low
deployment risk. However, adding a required `requestId` to an existing event or
replacing its acknowledgement is not literally additive at the TypeScript
contract level. `EventTypeMap` feeds manually exhaustive dispatchers, so a new
event type can also require source changes in clients that never use the event.

The practical decision is still to make the direct contract change. This is a
single-operator CLI in a monorepo, and current source search shows the list and
hydrate events are consumed by the CLI/server path. Update the shared types,
server resolver, and CLI together. Do not preserve a worse protocol merely to
claim wire compatibility that no active consumer needs.

#### `userMsgId` is necessary but not sufficient for request correlation

Fable recommends reusing `userMsgId` because every chat response frame carries
it. That is correct after the server persists the user message. It is not a
complete client-request correlation key: `AIChatRequest` does not contain
`userMsgId`; the server creates it in `handleAIChat`; and persistence failures
currently return the sentinel `"no-msg-id-yet"`
([`events.ts:121`](../../packages/types/src/events.ts#L121),
[`chat.ts:120`](../../apps/ws-server/src/resolver/chat.ts#L120),
[`chat.ts:159`](../../apps/ws-server/src/resolver/chat.ts#L159)).

Use the identities for their actual jobs:

- `operationId`: client-generated, ephemeral correlation from request send
  through request acceptance/rejection;
- `userMsgId`: server-generated, persisted identity for the accepted user
  message and all subsequent chunk/response/error frames;
- `conversationId`: domain identity for attachment and persistence, never a
  substitute for operation identity.

The server should send an immediate typed chat acknowledgement after
persistence:

```ts
type AIChatRequestAck =
  | {
      type: "ai_chat_request_ack";
      operationId: string;
      status: "ACCEPTED";
      conversationId: string;
      userMsgId: string;
    }
  | {
      type: "ai_chat_request_ack";
      operationId: string;
      status: "REJECTED";
      code: "INVALID_CONVERSATION" | "PERSIST_FAILED" | "UNAVAILABLE";
      message: string;
    };
```

`REJECTED` is terminal for the turn. After `ACCEPTED`, the turn transitions
from `SUBMITTING` by `operationId` to `STREAMING` by `userMsgId`; the later
`ai_chat_response` or `ai_chat_error` is terminal. This also moves
new-conversation rekeying off the first text chunk and onto explicit
acceptance.

#### Prefer one transport subscriber over an undocumented async iterator

Fable's single-consumer warning about `AsyncIterable` is correct. The CLI does
not need a broadcast stream. Keep one application-level event sink and let the
orchestrator route parsed events. A small interface is sufficient:

```ts
interface CliTransport {
  connect(): Promise<void>;
  send<TType extends CliOutboundEventType>(event: CliOutboundEvent<TType>): void;
  subscribe(listener: (event: CliInboundEvent) => void): () => void;
  close(): Promise<void>;
}
```

The contract permits one active application subscriber. Logging belongs at the
transport boundary or after application dispatch, not as a second competing
consumer.

#### Resume history should be full by default with an explicit safety valve

The selected recent messages should render with full bodies and preserved
whitespace. Fable is also right that an accidental 100 KB paste can overwhelm a
terminal. Use a generous, configurable per-message display budget only as an
operational safeguard. If it triggers, print an explicit truncation marker,
the original byte/character count, and the exact `/expand <ordinal>` command.
Never silently collapse or summarize. `/expand` or a pager must expose the full
locally hydrated message.

## Corrections to the Original Plan

The pre-scaffold plan captured the right product boundary but several planned
capabilities are not inherited merely by connecting to the ws-server.

| Original premise | Current assessment |
| --- | --- |
| The CLI is a fourth client, not a new provider system | Retain. This is the strongest architectural choice. |
| Framework-free readline, slash router, raw stdout | Retain. A full-screen TUI or command framework is still unnecessary. |
| Shared `EventTypeMap` means zero drift | Partially true. Compile-time sharing exists, but the CLI currently asserts payloads after checking only `type`; runtime payload drift remains possible. |
| Cookie-header auth is implemented through `ws` | Not implemented. `cookieHeader` is unused and the client constructs global `WebSocket` with only a URL. |
| Reconnect gives crash-proof resume for free | Incorrect. Reconnect queues unsent frames; replay occurs when a request is resent into an incomplete server stream. The current CLI neither performs a correlated retry nor renders replayed text idempotently. |
| Phase 2 render includes tool/image/status feedback | Incomplete. Thinking/text/finalize exist; tool activity, image progress, and a real pending status remain work. |
| Phase 3 commands and per-conversation settings | Partially complete. Commands exist; settings persistence and robust parsing do not. |
| Phase 4 cancellation and drain handling | Not complete. `SIGINT` exits, and terminal connection failure is not modeled. |
| Phase 5 conversation reach | Partially complete. Listing and hydration exist; memory command, attachments, and visitation/path updates do not. |

The scaffold therefore spans slices of the old phases rather than completing
them in order. The new phase-two plan should be based on current behavior, not
the original phase numbering.

## Refined Priority Findings

### Immediate: Resumed history defeats the resume workflow

`renderHydratedTail` flattens whitespace, truncates every message to 160
characters, and shows only the last eight
([`render.ts:96`](../../packages/cli/src/render.ts#L96)). This discards code,
tables, lists, and most reasoning at exactly the moment the user is trying to
recover context.

Ship this independently before protocol work:

- render the latest configured message count with normal speaker headers and
  full bodies;
- default to eight messages initially;
- preserve whitespace exactly;
- put the attachment summary after the transcript;
- keep each message in `messageIndex` for `/expand`;
- use an explicit marker and expansion command only for the configurable
  pathological-message safety cap;
- retain the oldest rendered ordinal so `/history more` can request the next
  page without reprinting the current window.

### P0: Attach must be a correlated transaction

The current implementation changes active state and clears local messages
before hydration proves the target exists
([`repl.ts:93`](../../packages/cli/src/repl.ts#L93)). The resolver uses
`findFirstOrThrow` and has no typed failure response
([`convo-hydration.ts:38`](../../apps/ws-server/src/resolver/convo-hydration.ts#L38)).

Replace the request/ack pair with a correlated result. The operation must:

1. retain the current active conversation while the target is pending;
2. check existence/ownership without using an exception as normal control
   flow;
3. return `ok: false` with a stable code for missing/forbidden/internal cases;
4. commit the target metadata and hydrated message registry atomically on
   `ok: true`;
5. reject results whose `operationId` is not the current attach operation;
6. keep same-conversation repeated attaches distinct by operation identity.

Remove the trailing-prompt syntax and `pendingPrompt` entirely.

### P0: Every operation needs exactly one terminal result

This is a client/server invariant, not only a REPL rule:

> If an operation can start, every execution path must emit one terminal
> success, failure, cancellation, interruption, or timeout result.

The current CLI never clears `this.turn`, and any chat response/error can
resolve it ([`repl.ts:285`](../../packages/cli/src/repl.ts#L285)). The server
also has a verified silent terminal path: the Anthropic tool loop can exhaust
or break, leave the `for` loop, and return from the method without sending
`ai_chat_response` or `ai_chat_error`
([`anthropic/index.ts:319`](../../apps/ws-server/src/anthropic/index.ts#L319),
[`anthropic/index.ts:1209`](../../apps/ws-server/src/anthropic/index.ts#L1209)).

Phase 2A must include:

- one turn finalize function for accepted response, provider error,
  cancellation, disconnect, and terminal timeout;
- clearing the active turn exactly once;
- server-side forced terminal errors/fallback responses after every bounded
  provider loop;
- an audit of provider dispatch paths for returns/breaks that do not send a
  terminal event;
- tests proving each started operation settles once, including pre-persistence
  chat failure and provider-loop exhaustion.

### P0: Conversation discovery and attachment must be separate

Titles are search/display metadata, not stable identifiers. The current
`/convo` string is interpreted as a number, title prefix, ID, and optional
prompt. Duplicate, numeric, and prefix-overlapping titles are inherently
ambiguous.

Use this flow:

```text
/convos                         # freeze newest result snapshot
/convos voyage                 # freeze ranked filtered snapshot
/convo 3                        # attach snapshot entry 3
/convo --id <conversation-id>  # explicit stable-ID escape hatch
```

The snapshot stores ordered IDs plus a version. Metadata remains in the
ID-keyed conversation registry. Incoming list pages may warm the registry but
must not change what an already displayed number means.

Manual listing needs an `operationId`, explicit page identity, and a completion
event. The initial unsolicited index warmup needs its own server-generated sync
identity so it cannot settle a manual `/convos` command. Render from a frozen
snapshot rather than asking the user to rerun the command after async acks.

### P1: Reconnect, retry, and replay are different operations

The original plan conflated them. Define them separately:

- **Reconnect:** re-establish the socket and provider/session context.
- **Retry:** deliberately resend an interrupted logical turn.
- **Replay:** receive authoritative accumulated output for a known persisted
  user message/stream.

On disconnect, retain the partial draft and mark the turn `INTERRUPTED`. Do not
automatically duplicate a request unless the server provides idempotency for
the accepted `userMsgId`. `/retry` should resend or resume through an explicit
server contract. Replayed text must replace/reconcile the draft aggregate, not
append blindly. After maximum reconnect attempts, transition the connection to
`FAILED` and reject new sends instead of queueing forever.

### P1: Runtime event parsing must reconstruct the consumed union

Checking only the `type` string and asserting the object to `ChatWsEvent` is not
runtime validation. The CLI only needs a small inbound union. Parse and narrow
the fields for those events, reconstruct typed values, and validate each return
with `satisfies EventTypeMap["..."]`. Unknown supported-server events may be
ignored deliberately; malformed consumed events should produce a protocol
diagnostic without mutating session state.

This parser should replace the large copied browser dispatcher only after the
P0 tests land. Delete the unused duplicate `chat-ws.ts` types at the same time.

### P1: Terminal output needs one writer and redraw discipline

Background hydration/connection events can currently write while readline is
editing. Centralize semantic output through the renderer, suspend/redraw the
input line around asynchronous notices, and expose connection/attach/turn state
in a compact prompt. Keep direct writes inside the renderer for stream latency;
do not scatter them through controllers.

Add single-operation cancellation before double-press exit behavior. Graceful
quit must close readline, cancel timers, and close the socket before process
termination.

### P1: Configuration/auth claims must match reality

Choose one implemented handshake strategy. If cookie metadata is required, use
the `ws` constructor with typed headers. If server defaults and request metadata
are sufficient for this single operator, remove the unused cookie builder and
the README claim. Resolve `.env` from a documented deterministic path rather
than whichever directory launched the binary. Add `/doctor` after the
connection state is explicit.

### P2: Commands need typed descriptors, not a command framework

Keep the hand-rolled router, but define name, aliases, usage, argument parser,
completion, and async handler together. Generate `/help` and completion from
that registry. Report ambiguous `/model` matches, parse numeric ordinals
strictly, use `/system --clear`, and render typed error messages rather than raw
JSON.

### P2: Interactive and automated input need a shared core

Add multiline paste preservation and `$VISUAL`/`$EDITOR` before attempting a
TUI. Later add a one-shot surface with stdin, structured output, stable exit
codes, and no-color behavior. That second caller is the point at which an
application core separate from the REPL becomes justified.

## Near-Term Architecture

Do not begin with the v1 diagram's full controller rewrite. Preserve the
current layered services for 2A:

```text
CliConfigService
  -> SlipstreamClientService
    -> CliProviderContextService
      -> CliRendererService
        -> SlipstreamReplService
```

Add only the boundaries that remove real complexity:

```text
SlipstreamReplService
  -> pure session transition functions
  -> pure conversation search/snapshot functions
  -> injected CliTransport seam
  -> injected terminal input/output seam
```

The REPL remains the orchestrator. State transitions return named,
discriminated outcomes; they do not write to the terminal. The ID-keyed
conversation registry retains its explicit populate/reconcile/update lifecycle.
The listing snapshot is immutable UI state and contains IDs only.

Once `slipstream ask` or another non-interactive caller exists, extract the
tested orchestration into `CliApplication`. At that point both REPL and one-shot
input become adapters. This avoids creating controllers solely in anticipation
of future complexity while preserving a clear route to the agent runtime.

Recommended state model:

```ts
type ActiveConversationState = {
  status: "ACTIVE";
  conversationId: string;
  title: string | null;
};

type ConversationState =
  | { status: "FRESH" }
  | ActiveConversationState
  | {
      status: "ATTACHING";
      operationId: string;
      targetId: string;
      previous: ActiveConversationState | null;
    };

type TurnState =
  | { status: "IDLE" }
  | { status: "SUBMITTING"; operationId: string; conversationId: string }
  | {
      status: "STREAMING";
      operationId: string;
      userMsgId: string;
      conversationId: string;
      aggregate: string;
    }
  | {
      status: "INTERRUPTED";
      operationId: string;
      userMsgId: string | null;
      reason: string;
    };
```

Connection state remains a separate discriminated union. Do not embed one
state machine inside nullable fields of another.

## Refined Delivery Order

### Phase 2.0: Readable Resume

- Render the configured latest message window with full formatting.
- Add explicit large-message markers and full `/expand`/pager access.
- Track the older-history cursor and add `/history more`.
- Add renderer tests with code blocks, tables, long messages, and color off.

**Exit criterion:** attaching immediately exposes enough faithful recent
context to continue work without opening the web client.

### Phase 2A: Correlation and Terminal Correctness

- Add `operationId`-correlated list/attach results and chat acceptance
  acknowledgements.
- Use `userMsgId` after chat acceptance.
- Make attach transactional and delete trailing prompts.
- Freeze numbered conversation snapshots.
- Introduce explicit connection/conversation/turn states in the current class
  structure.
- Centralize finalize behavior and audit provider loops for silent exits.
- Fix hard-rule violations in touched CLI boundaries.
- Add state, stale-result, and terminal-result tests.

**Exit criterion:** no stale, duplicate, missing, interrupted, or rapidly
reselected operation can mutate the wrong session, send to the wrong
conversation, or remain pending without a terminal state.

### Phase 2B: Transport and Terminal DX

- Replace the copied dispatcher with a narrow parsed transport.
- Inject transport and terminal seams.
- Add redraw-safe async output and a compact stateful prompt.
- Implement graceful shutdown, cancellation, failed reconnect state, and
  replay reconciliation.
- Resolve auth/config drift and add `/current` and `/doctor`.
- Move slash commands into typed descriptors.

**Exit criterion:** delayed frames, malformed events, disconnects, retries,
and background notices cannot corrupt state or the editable prompt.

### Phase 2C: Automation Surface

- Add multiline/editor input.
- Add `slipstream ask`, stdin, structured output, stable exit codes, and color
  detection.
- Persist operator and per-conversation preferences through one typed settings
  registry.
- Extract a shared `CliApplication` only when REPL and one-shot mode both need
  the orchestration.
- Add fake-server integration tests and an opt-in live smoke test.

**Exit criterion:** the same tested core supports interactive terminal work,
shell scripting, and editor tasks.

### Phase 3: Local Agent Runtime

Keep this separate from chat orchestration. It needs:

- workspace-root containment and instruction discovery;
- typed file search/read, patch, and command tools;
- read/write/network/destructive approval policies;
- stable tool-call IDs and idempotent result submission;
- bounded output with explicit truncation metadata;
- cancellation, timeout, and subprocess cleanup;
- append-only run logs and resumable run state;
- diff/review checkpoints before consequential writes;
- non-interactive behavior suitable for CI.

Design its request/result envelope now around the same `operationId` and
exactly-one-terminal-result invariant used in 2A. Ship read-only tools first.
Writes and shell execution wait for containment, approval, cancellation, and
audit tests.

## Required Phase-2 Tests

- Full resumed history preserves paragraphs, code fences, tables, and leading
  whitespace.
- A large-message display cap is explicit and `/expand` remains lossless.
- Duplicate, numeric, and prefix-overlapping titles never attach implicitly.
- Listing numbers remain stable while background pages update the registry.
- Missing and forbidden conversations leave the previous session active.
- Attach A followed by B rejects a late A result.
- Attach A1 followed by A2 rejects a late A1 result even though IDs match.
- Chat persistence rejection settles `SUBMITTING` by `operationId`.
- Accepted chunks/responses settle only the matching `userMsgId`.
- Provider loop exhaustion produces exactly one terminal event.
- Disconnect while idle does not report an interrupted turn.
- Disconnect before acceptance and during streaming produce distinct states.
- Replay replaces/reconciles the aggregate rather than duplicating text.
- Maximum reconnect failure rejects sends rather than queueing forever.
- Parser rejection cannot mutate session state.
- Command parsing, help, and completion derive from the same descriptors.

## Non-Decisions Retained

- No full-screen TUI yet.
- No new command/fuzzy-search framework unless the small typed implementation
  proves insufficient.
- No concurrent turns until one active turn is correlated and correct.
- No duplicated local transcript store; the server owns conversation history.
- No arbitrary shell commands encoded in model prose.
- No broad application rewrite bundled with correctness work.

## Final Recommendation

Adopt Fable's sequencing amendments with the identity and compatibility
refinements above. The next implementation should be a narrow Phase 2.0 change
to make resumed conversations readable. Follow it with Phase 2A in the current
class structure: direct correlated protocol results, transactional attach,
frozen selection snapshots, explicit turn states, and a server terminal-path
audit.

That order improves the CLI immediately, removes the current state-corruption
paths, and creates the correlation primitive the later local agent runtime
will need. Transport cleanup, command metadata, and a shared application core
then become evidence-driven refactors protected by tests rather than
prerequisites that delay the user-facing fixes.

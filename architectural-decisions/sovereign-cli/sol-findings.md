# Sovereign CLI Phase-Two Findings

**Author:** Sol  
**Reviewed:** 2026-07-11  
**Scope:** `packages/cli/src`, its package configuration, the shared WebSocket
event types, and the server handlers used for conversation listing and
hydration.

## Executive Summary

The CLI has the right foundational product decision: it is a thin client of
Slipstream's existing server rather than another provider integration. It can
already connect, stream a response, switch models, create or hydrate a
conversation, and render a compact transcript. The package also currently
passes typecheck, lint, and build.

The next phase should not start by adding more slash commands. The current REPL
has three pieces of state that are implicit and weakly correlated:

1. connection state,
2. conversation attachment state, and
3. turn/stream state.

That is already producing correctness and DX problems. In particular,
`/convo` treats one string as a list number, title, ID, and optional prompt;
selects the first title prefix without detecting ambiguity; mutates the active
conversation before hydration succeeds; and stores the follow-up prompt in a
global slot that can leak into a later attach. These are state-model problems,
not fuzzy-matching problems.

My phase-two recommendation is:

- make conversation discovery and attachment separate operations;
- introduce explicit, discriminated session states and correlated requests;
- replace the copied WebSocket dispatcher with a small CLI-owned transport;
- define commands once as typed descriptors used for parsing, help, and
  completion;
- make the interaction core independent of `readline` and `process.stdout` so
  it can be tested and later driven by an interactive terminal, a one-shot
  command, or an agent loop;
- only then add local coding-agent tools, approvals, and workspace context.

## What Exists Today

The current class chain is:

```text
CliConfigService
  -> SlipstreamClientService
    -> CliProviderContextService
      -> CliRendererService
        -> SlipstreamReplService
```

This is compact and was a reasonable way to prove the end-to-end path. The
server remains the source of truth for providers, persistence, tools, memory,
and model behavior. The CLI owns configuration, terminal input, a conversation
metadata registry, active session settings, and streaming output.

The strongest parts to preserve are:

- `EventTypeMap` is the shared client/server contract.
- The conversation registry is keyed by the stable conversation ID.
- New-chat rekeying follows the server's literal `"new-chat"` contract.
- Hydrated and live messages are indexed by ordinal.
- Streaming text uses direct `stdout.write`, which keeps latency low.
- The curated model roster is intentionally small and typed.
- No terminal framework is required for the current interaction model.

## Priority Findings

### P0: Conversation attachment is not transactional

`attachTo` changes `state.conversationId`, clears the current message index,
and announces attachment before the server has shown that the target exists
([`repl.ts:93`](../../packages/cli/src/repl.ts#L93)). The server hydration path
uses `findFirstOrThrow`, but the wire contract has no hydration-error event
([`convo-hydration.ts:38`](../../apps/ws-server/src/resolver/convo-hydration.ts#L38),
[`events.ts:62`](../../packages/types/src/events.ts#L62)). A missing or
unauthorized ID therefore has no typed failure path back to the REPL.

Impact:

- The prompt can claim it is attached when hydration never succeeded.
- A subsequent message targets an invalid conversation ID and fails later in a
  less understandable place.
- The previous active session and its local transcript are destroyed before
  the operation commits.

Decision: attachment needs a pending state and a success/error result. Keep the
current active conversation intact while hydration is pending, then atomically
commit the new conversation and message registry on success.

The shared event contract should add correlation and an explicit result:

```ts
type HydrateConversation = {
  type: "hydrate_conversation";
  requestId: string;
  conversationId: string;
  lowestLoadedOrdinal: number;
  take?: number;
};

type HydrateConversationResult =
  | {
      type: "hydrate_conversation_result";
      requestId: string;
      ok: true;
      conversationId: string;
      pages: HydrateConversationPage[];
    }
  | {
      type: "hydrate_conversation_result";
      requestId: string;
      ok: false;
      conversationId: string;
      code: "NOT_FOUND" | "FORBIDDEN" | "INTERNAL";
      message: string;
    };
```

If changing the wire contract is deferred, the CLI still needs a local
`attaching` state and timeout, but that is a compatibility bridge rather than a
complete solution.

### P0: A pending follow-up can be sent to the wrong conversation

`attachTo` only writes `pendingPrompt` when the new call has a non-empty
follow-up ([`repl.ts:94`](../../packages/cli/src/repl.ts#L94)). It does not clear
an earlier pending value. This sequence is therefore possible:

```text
/convo A prompt intended for A
/convo B
<B hydration arrives>
```

The prompt intended for A is sent to B. The single global slot is also not
correlated with a hydration request ([`repl.ts:307`](../../packages/cli/src/repl.ts#L307)).

Decision: remove the trailing prompt feature. After a successful attach, the
next ordinary input is the prompt. If an atomic "attach then send" operation is
later useful for scripting, model it as a named object owned by the correlated
attach request, never as shared mutable state.

### P0: Turn completion is global rather than correlated

`this.turn` is overwritten for every send, and any `ai_chat_response` or
`ai_chat_error` resolves it ([`repl.ts:285`](../../packages/cli/src/repl.ts#L285),
[`repl.ts:325`](../../packages/cli/src/repl.ts#L325)). It is never cleared after
settlement. A later idle disconnect is consequently reported as a mid-turn
disconnect ([`repl.ts:351`](../../packages/cli/src/repl.ts#L351)).

The background `void this.sendPrompt(prompt)` path makes overlapping sends
possible while `readline` is already waiting for another line. Once the CLI is
used beside the web client or gains agent/tool activity, unrelated frames are
also increasingly plausible.

Decision: use an explicit active-turn record keyed by the request's stable
identity, ideally `userMsgId` or a new client-generated `requestId`. Only
matching frames may update or settle it. Clear the record in a single finalize
path for success, provider error, disconnect, cancellation, and timeout.

### P1: Title matching is ambiguous by construction

The `/convo` parser resolves in this order: one- or two-digit listing number,
first title prefix, then first whitespace-delimited token as an ID
([`repl.ts:141`](../../packages/cli/src/repl.ts#L141)). This has unavoidable
ambiguities:

- duplicate titles silently choose whichever entry was inserted first;
- a short title that prefixes a longer title wins based on `Map` insertion
  order, not relevance or recency;
- numeric titles are interpreted as listing positions;
- a title can consume the beginning of what the user intended as a prompt;
- a mistyped multi-word title becomes a bogus ID plus a follow-up prompt;
- completion displays titles that are not unique identifiers;
- unquoted whitespace has two different meanings.

The right fix is to stop making titles attachment identifiers.

Recommended interaction:

```text
/convos                         # newest immutable snapshot
/convos voyage                 # ranked, filtered snapshot
/convo 3                        # attach by number in that snapshot
/convo --id cm123...            # explicit stable-ID escape hatch
/current                        # show active conversation and settings
```

`/convos <query>` may score normalized title matches as exact, word-prefix,
prefix, substring, then fuzzy. The scoring algorithm should return ranked
candidates, not an attachment. Duplicate titles should show a short ID suffix,
relative update time, and message count. A number refers to a frozen listing
snapshot until the next `/convos`, so incoming registry pages cannot silently
change what `/convo 3` means.

This snapshot is UI state, not a second conversation cache. Store ordered IDs
and a snapshot version; continue to read metadata from the ID-keyed registry.

### P1: `/convos` refreshes asynchronously but renders synchronously

The command sends `conversation_list` and immediately renders the existing
registry ([`repl.ts:193`](../../packages/cli/src/repl.ts#L193)). The resulting
acknowledgements update the registry but do not redraw the list. Users therefore
see stale results and may be told to try again while the requested data is
already in flight.

The server deliberately streams one acknowledgement per page, but the event
does not include `requestId`, page/cursor metadata, or `done`
([`events.ts:43`](../../packages/types/src/events.ts#L43),
[`convo-list.ts:38`](../../apps/ws-server/src/resolver/convo-list.ts#L38)). The
CLI cannot distinguish startup warming from a manual refresh or know when the
archive is complete.

Decision: add a correlated list request and page result with an explicit final
marker. Render the first page promptly, update a visible result count as later
pages arrive only when useful, and resolve the command when complete. Do not
make the user retry to observe an asynchronous result.

### P1: Resumed history is collapsed past the point of usefulness

The purpose of resuming a conversation is to recover its working context, but
`renderHydratedTail` turns each hydrated message into a whitespace-flattened
single line, truncates it at 160 characters, and displays only the last eight
messages ([`render.ts:96`](../../packages/cli/src/render.ts#L96)). Code blocks,
lists, paragraph boundaries, detailed reasoning, and most long answers are
therefore unavailable at the moment they are most useful. The user must already
know an ordinal and invoke `/expand` one message at a time to read the actual
content.

Decision: a successful attach should render the full bodies of the most recent
configured number of messages. Start with eight messages as the default to
preserve the current window size, but preserve whitespace and use the normal
speaker header and message layout for every item. Do not silently summarize or
truncate resumed history.

The intended output is:

```text
[37] you
Can you compare the two tokenizer approaches and keep the benchmark table?

[38] [voyage/voyage-3.5]
The important difference is...

| approach | p50 | p95 |
| ...      | ... | ... |

• attached · Probing the Voyage · showing messages 31-38
```

The history window should be a setting such as `historyMessageCount`, not a
hard-coded renderer argument. Add `/history <count>` to re-render a chosen
recent window and `/history more` to fetch the next older page. The attach
result should surface `hasMore` and the next ordinal cursor so older history is
available without rehydrating or reprinting the entire conversation.

Very large messages may be sent through the user's pager when requested, but
the default attach view must remain lossless for the selected message count.
Compact previews can exist as an explicit `/history --compact` mode; they
should not be the resume default.

### P1: Runtime wire validation is weaker than the types imply

`parseEvent` validates that a parsed object has a recognized string `type`,
then asserts the entire object to `ChatWsEvent`
([`chat-ws-client.ts:79`](../../packages/cli/src/chat-ws-client.ts#L79)). Event
payloads are not validated. A malformed but recognized frame can reach a
handler and fail while mutating session state. This code also contains bare
type assertions prohibited by this repository's rules.

Decision: put runtime narrowing at the transport boundary. A lightweight
hand-written parser per CLI-consumed event is sufficient; no dependency is
required. The CLI does not need to claim support for every server event. Parse
the small inbound union it consumes and return a discriminated protocol-error
result for everything else.

### P1: The transport is copied and duplicated instead of adapted

`chat-ws-client.ts` carries a large manually enumerated browser dispatcher, and
`client.ts` adds a second handler map and dispatcher on top of it. Most event
cases are irrelevant to the CLI. `chat-ws.ts` duplicates two type definitions
and is otherwise unused.

This creates multiple places to update when `EventTypeMap` changes, and it
makes the actual CLI subscription path difficult to see.

Decision: replace this with one CLI-owned transport exposing a small interface:

```ts
interface CliTransport {
  connect(): Promise<void>;
  send<TType extends CliOutboundEventType>(event: CliOutboundEvent<TType>): void;
  events(): AsyncIterable<CliInboundEvent>;
  close(): Promise<void>;
}
```

The concrete WebSocket adapter owns parsing, reconnect state, and the outbound
queue. The application consumes a typed event stream. This is composition,
which also makes a fake transport straightforward in tests.

### P1: The advertised cookie/auth path is not implemented

The comments describe a `Cookie` header, and `CliConfigService` builds
`cookieHeader`, but `ChatWebSocketClient` constructs a global `WebSocket` with
only a URL. The cookie header is never used
([`config.ts:64`](../../packages/cli/src/config.ts#L64),
[`chat-ws-client.ts:432`](../../packages/cli/src/chat-ws-client.ts#L432)). The
`ws` runtime dependency is not the constructor used by this path.

Also, `dotenv.config()` resolves `.env` from the process working directory,
while the README says `packages/cli/.env` overrides configuration. Those only
match when the CLI happens to be launched from that directory.

Decision: choose and document one real authentication/configuration path. If a
header is required, use the `ws` client explicitly with typed connection
options. If metadata in `ai_chat_request` and server defaults are sufficient,
delete the unused cookie claim and builder. Add `/doctor` or `slipstream
doctor` to print resolved endpoint, user identity suffix, config source,
provider-context status, and connection health without exposing secrets.

### P1: Reconnect is not resume

The transport reconnects and queues messages that were never sent. It does not
correlate or resume an in-flight request. On disconnect the REPL resolves the
turn and tells the user to reconnect and resend, while the socket reconnects in
the background. After the maximum attempts, the REPL receives no terminal
connection state and can keep accepting prompts into an outbound queue that
will never flush.

The renderer is also not replay-safe for text: every `data.chunk` is appended
([`render.ts:41`](../../packages/cli/src/render.ts#L41)). Only thinking text has
partial duplicate suppression. A server replay would duplicate visible text.

Decision: make connection state visible and terminal. A resumable turn needs a
server-supported resume identity and authoritative aggregate/ordinal semantics;
otherwise classify the turn as interrupted and require an explicit retry.
Never describe exponential reconnect alone as crash-proof streaming.

### P2: The command layer has no single source of truth

Command parsing, help text, and completion are separate hand-maintained paths.
They already disagree with the README, and adding aliases/options will multiply
that drift. Hand-rolled remains appropriate, but each command should be a typed
descriptor containing name, aliases, usage, summary, argument parser,
completion provider, and async handler. `/help` and completion should be
derived from that registry.

Handlers should return typed outcomes or promises rather than writing and
mutating arbitrary state. This also permits commands such as `/convos` and
`/doctor` to await actual results.

Smaller command edges worth correcting:

- `/model` uses first fuzzy match rather than reporting ambiguity.
- `/expand` accepts values such as `3abc` because `Number.parseInt` is lenient.
- `/system clear` cannot set the literal text `clear`; use `/system --clear`.
- `/quit` and `SIGINT` call `process.exit` without closing the socket.
- `ChatSessionState.showThinking` is unused; rendering owns a second value.
- Error frames are dumped as JSON instead of rendering their typed `message`.

### P2: Terminal input is adequate for chat, not coding work

`readline.question(...).trim()` is single-line and removes whitespace. Coding
requests commonly contain pasted stack traces, diffs, commands, and code whose
format matters. Output from background hydration can also arrive while
`readline` is editing a line, corrupting the visible prompt.

Phase two should add:

- multiline paste handling without trimming content;
- `/editor` using `$VISUAL`/`$EDITOR` for substantial prompts;
- a stable prompt/status line showing model, short conversation identity, and
  connection/turn state;
- redraw discipline for asynchronous notices;
- single `Ctrl+C` to cancel an active operation and a separate deliberate exit;
- TTY detection and a non-interactive mode.

Do not move to a full-screen TUI yet. These capabilities can remain built on
Node terminal primitives if input and rendering are behind interfaces.

### P2: There is no test seam or CLI test suite

There are no test/spec files under `packages/cli`. The REPL constructs
`readline` against process globals as a field initializer, configuration reads
global environment variables, and the service inheritance chain constructs
its own transport. Unit tests cannot exercise selection, state transitions, or
rendering without a real terminal and socket.

The highest-value tests are pure and deterministic:

- conversation search ranking, duplicate titles, and numeric titles;
- frozen listing snapshot resolution;
- attach success, error, timeout, and stale response handling;
- two rapid attach requests with different follow-ups (regression for the P0);
- turn correlation and unrelated response frames;
- disconnect before first chunk, mid-stream, and while idle;
- chunk replay/deduplication;
- command parsing/completion/help agreement;
- renderer snapshots with color disabled;
- fake-transport integration from input command to outbound event.

Use the workspace's existing test stack rather than adding a new dependency.

### P2: Repository type rules are bypassed in the CLI

`src/index.ts` declares global JSON/Body/Object augmentations again and includes
explicit `any` parameters ([`index.ts:13`](../../packages/cli/src/index.ts#L13)).
The shared types package already supplies these augmentations. The transport
and client also contain multiple bare `as` assertions. Lint and typecheck pass,
so the package's automated checks are not enforcing the repository's stated
hard rules.

Decision: remove the competing augmentations, use the shared declarations, and
replace assertions with real narrowing. Add focused lint rules or a repository
check so a passing build means the hard rules were actually applied.

## Recommended Phase-Two Architecture

Keep the server-centric product architecture, but replace service inheritance
with a small composed application core:

```text
TerminalInput -----------+
OneShotInput ------------+--> CliApplication --> CommandRegistry
                              |       |
                              |       +--> ConversationController
                              |       +--> TurnController
                              |       +--> SettingsStore
                              |
                              +--> CliTransport --> Slipstream WS server
                              +--> CliOutput
```

Suggested responsibilities:

- **`CliApplication`** owns the event loop and dispatches input, transport
  events, and cancellation into explicit state transitions.
- **`SessionState`** is a discriminated value, not a collection of unrelated
  optional fields.
- **`ConversationController`** owns the ID-keyed metadata registry, search,
  immutable listing snapshots, and transactional attach.
- **`TurnController`** owns exactly one correlated active turn initially,
  replay/cancel/finalize behavior, and committed message indexing.
- **`CommandRegistry`** is the source for parse, usage, help, and completion.
- **`CliTransport`** is the only code that sees raw WebSocket data.
- **`CliOutput`** receives semantic render events such as `turn.delta`,
  `attach.pending`, or `connection.reconnecting`, not raw protocol objects.
- **`TerminalInput`** owns readline/key handling; **`OneShotInput`** enables
  scripting without duplicating application logic.
- **`SettingsStore`** owns operator preferences and per-conversation settings
  with an explicit load/reconcile/write-through lifecycle.

A useful top-level state shape would be:

```ts
type ConnectionState =
  | { status: "DISCONNECTED"; reason?: string }
  | { status: "CONNECTING"; attempt: number }
  | { status: "READY" }
  | { status: "RECONNECTING"; attempt: number; nextAttemptAt: number }
  | { status: "FAILED"; reason: string };

type ConversationState =
  | { status: "FRESH" }
  | { status: "ACTIVE"; conversation: ConversationListEntry }
  | {
      status: "ATTACHING";
      requestId: string;
      targetId: string;
      previous: ConversationListEntry | null;
    };

type TurnState =
  | { status: "IDLE" }
  | {
      status: "STREAMING";
      requestId: string;
      conversationId: string;
      startedAt: number;
    }
  | { status: "INTERRUPTED"; requestId: string; reason: string };
```

The actual declarations should live in named types and follow the repository's
inference rules. The important decision is that invalid combinations become
unrepresentable: a turn cannot be vaguely "present," an attach cannot silently
be active, and a failed connection is not equivalent to a temporarily queued
send.

## DX Proposal

### Interactive commands

```text
/help [command]
/model [query]
/new
/convos [query]
/convo <snapshot-number>
/convo --id <conversation-id>
/current
/system <text>
/system --clear
/thinking on|off
/expand <ordinal>
/history <count|more>
/editor
/retry
/cancel
/doctor
/quit
```

Prefer explicit operations over overloaded cleverness. The common resume flow
becomes:

```text
❯ /convos voyage
  1  Probing the Voyage       42 messages  2h ago  ...9f3a
  2  Voyage tokenizer notes  118 messages  4d ago  ...71bc
❯ /convo 1
  attached: Probing the Voyage
❯ continue from the tokenizer results
```

The active prompt should provide compact orientation without consuming a full
status panel, for example:

```text
fable · Probing the Voyage ›
```

Connection or turn state can temporarily replace the right side. Titles must
be truncated by terminal width, with the ID suffix available through
`/current`.

### Non-interactive mode

An agent-capable CLI needs a stable automation surface even if the interactive
REPL remains primary:

```text
slipstream ask --model fable --conversation <id> --prompt "..."
slipstream ask --new --stdin
slipstream conversations search "voyage" --json
slipstream doctor
```

Requirements:

- stdout contains the requested result; diagnostics go to stderr;
- meaningful nonzero exit codes for auth, transport, provider, and usage
  errors;
- `--json` emits structured events or a final structured result;
- stdin works without a TTY;
- no ANSI when output is redirected or `NO_COLOR` is set.

This is also the cleanest harness for automated tests and future editor
integration.

## Path Toward a Lightweight Coding Agent

The present CLI is a chat client with server-side tools. A Codex/Claude Code
style client additionally needs a local, auditable action loop. Do not hide
that loop inside slash-command handlers or the renderer.

The next architectural boundary after the interaction core is stable should be
a local **agent runtime** with:

1. a workspace root and normalized path policy;
2. typed tools for file discovery/read, text search, patch application, and
   command execution;
3. an approval policy separating read-only, workspace-write, network, and
   destructive operations;
4. bounded tool output with truncation metadata;
5. an append-only run/event log for recovery and audit;
6. a provider-neutral tool-call/result protocol bridged to Slipstream;
7. cancellation, timeout, and subprocess cleanup;
8. a diff/review checkpoint before consequential writes;
9. project instruction discovery (`AGENTS.md`) with explicit precedence;
10. non-interactive behavior suitable for CI.

Start with read-only tools and an explicit plan/apply boundary. Add writes and
shell execution only after approval, path containment, cancellation, and run
logging are tested. The local runtime should emit the same semantic events to
`CliOutput` as chat turns, so interactive and one-shot modes remain adapters
rather than separate products.

This will require a deliberate server contract. Today `EventTypeMap` models
server-owned tool execution inside provider loops; it does not provide a typed
request/response protocol for a model to ask this CLI instance to operate on
the local workspace. That protocol needs stable tool-call IDs, idempotency,
result size limits, cancellation, and reconnect behavior before local tools
ship.

## Proposed Delivery Order

### Phase 2A: Correctness kernel

- Add correlated conversation list/hydration success and error events.
- Introduce explicit connection, conversation, and turn states.
- Remove `/convo <title> [prompt]`; ship deterministic snapshots and explicit
  ID attachment.
- Correlate/finalize turns and attachments in one place.
- Fix graceful shutdown and terminal connection failure.
- Add focused reducer, selector, parser, and fake-transport tests.

**Exit criterion:** stale, duplicate, missing, or rapidly selected
conversations cannot change active state or send a prompt to the wrong target.

### Phase 2B: Interaction and transport

- Replace the copied dispatcher with `CliTransport` and runtime event parsing.
- Move commands into typed descriptors.
- Add async-safe prompt redraw, compact current-state prompt, `/current`, and
  `/doctor`.
- Render the configured recent history window with full message bodies on
  attach; add cursor-based `/history <count|more>` for older context.
- Add multiline/editor input, cancel semantics, and replay-safe rendering.
- Resolve auth/config documentation and implementation drift.

**Exit criterion:** resumed conversations immediately expose a readable,
lossless recent context window, and disconnects, delayed events, pasted input,
and command errors produce deterministic output without corrupting the prompt.

### Phase 2C: Automation surface

- Add `ask`, conversation search, stdin, `--json`, exit codes, and color
  detection.
- Persist operator preferences and per-conversation settings through one typed
  settings registry.
- Add end-to-end tests against a fake server and a small opt-in live smoke
  test.

**Exit criterion:** the CLI can be used reliably from a terminal, shell script,
or editor task with the same application core.

### Phase 3: Local agent runtime

- Define the local tool protocol and approval model.
- Ship read-only workspace tools first.
- Add patch/write and command tools with containment and audit logs.
- Add plan/apply/review workflow, resumable runs, and CI mode.

**Exit criterion:** the model can inspect a repository, propose a bounded
change, obtain approval, apply it, verify it, and present the diff without
escaping the configured workspace or losing the run record.

## Explicit Non-Decisions

- Do not adopt a full-screen TUI yet.
- Do not add a command framework merely to solve command metadata.
- Do not add a fuzzy-search dependency before deterministic normalization and
  ranking prove insufficient.
- Do not persist conversation transcripts locally; the server remains the
  source of truth.
- Do not implement local tools as arbitrary command strings embedded in model
  text.
- Do not make concurrent turns a phase-two goal. First make one active turn
  explicit and correct.

## Verification Baseline

Run from the repository root on 2026-07-11:

```text
pnpm --filter=@slipstream/cli typecheck  PASS
pnpm --filter=@slipstream/cli lint       PASS
pnpm build:cli
```

The build emits a `rolldown-plugin-dts` sourcemap warning but completes. No
CLI test files are currently present. These checks validate the current
compile/package baseline; they do not exercise the runtime state and protocol
issues above.

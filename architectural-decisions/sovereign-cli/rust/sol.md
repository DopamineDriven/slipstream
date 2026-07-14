# Pragmatic Rust Rewrite of the Sovereign CLI

**Status:** Recommended plan of record

**Reviewed:** 2026-07-13

**Scope:** `packages/cli`, its shared websocket contract, and the server surfaces the CLI already uses

## Decision

Rewrite the interactive CLI in Rust, but do it as a parallel replacement rather than an in-place translation.

The current TypeScript CLI is a useful, working protocol probe. It has also reached the point where terminal ownership, event decoding, reconnect behavior, and UI state are more expensive to make reliable than the feature code itself. That is the relevant threshold. Rust is not justified because JSON or websocket traffic needs more CPU; it is justified because a Claude Code/Codex-caliber client needs one terminal owner, an explicit state machine, predictable cancellation, structured concurrency, a testable renderer, and a standalone binary.

The recommended implementation starts as one Rust package under `packages/cli/native`, keeps the TypeScript CLI runnable until parity, and does not require new chat events or a server rewrite. `packages/types/src/events.ts` remains the protocol authority. A small repository-owned TypeScript compiler-API generator emits the complete Rust wire model from `EventTypeMap`, including chat, asset, image, TTS, provider, conversation, and hydration events.

This plan is buttoned up enough to begin. The implementation sequence should start with protocol generation, followed immediately by a headless Rust websocket client, before the TUI.

The reviewed package is roughly 2,500 lines including tests and its generated-entry script. The two largest files are the 612-line websocket client and 547-line REPL, followed by the 260-line picker and 185-line renderer. There is currently no Cargo manifest or Rust workspace in the repository, so the native package can start without accommodating an existing Rust layout.

## Executive Findings

### 1. The current terminal architecture is the primary ceiling

The live conversation picker now crosses three input systems:

- promise-based `readline` owns the normal prompt;
- a global keypress watcher detects `/convo ` and force-submits that prompt;
- `CliConvoPicker` pauses `readline`, enables raw mode, reads byte chunks, manually erases its output, and then restores `readline`.

That behavior is visible in [repl.ts](../../../packages/cli/src/repl.ts#L74), [repl.ts](../../../packages/cli/src/repl.ts#L145), and [repl.ts](../../../packages/cli/src/repl.ts#L495). It explains why a seemingly modest live-filter popup required careful timing around buffered input and why the implementation has `pickerOpen`, `awaitingLine`, and `pickerRequest` as coordination flags.

The picker itself compares each stdin chunk to whole escape sequences such as `\x1b[A` and `\x1b[B` in [convo-picker.ts](../../../packages/cli/src/convo-picker.ts#L153). A TTY byte stream does not guarantee that one callback equals one logical key event. Split escape sequences, coalesced keypresses, bracketed paste, Unicode graphemes, and resize events can all violate that assumption. Its repaint also counts logical strings, not physical wrapped terminal rows ([convo-picker.ts](../../../packages/cli/src/convo-picker.ts#L215)). Narrow terminals and wide characters can therefore desynchronize the erase calculation.

This is not an indictment of the phase-2 work. The picker correctly fixed the product problem: users select server-provided conversation objects, typed text is only a filter, and invalid identities never cross the wire. That behavior should be preserved. The input plumbing should not.

Rust only resolves this if the rewrite adopts a single event source and a single renderer. Recreating the same raw-byte/readline handoff in Rust would preserve the bug class in a different language.

### 2. The websocket client is statically typed but not runtime-safe

[chat-ws-client.ts](../../../packages/cli/src/chat-ws-client.ts#L35) contains a hand-copied list of all 44 event names. Parsing checks that a frame is an object with one of those strings, then asserts the entire payload to `ChatWsEvent` ([chat-ws-client.ts](../../../packages/cli/src/chat-ws-client.ts#L98)). Required fields, nested payloads, and scalar shapes are not validated.

The same file then builds a roughly 265-line exhaustive dispatcher for every event, even though the CLI deliberately subscribes to only the events it currently uses ([chat-ws-client.ts](../../../packages/cli/src/chat-ws-client.ts#L155)). The user's architectural model is sound: the server can register the shared event universe while each consumer chooses the events that affect it. Exhaustive protocol awareness does not require every application subsystem to install a no-op handler.

The Rust replacement should therefore have:

- one generated, exhaustive `WireEvent` enum sourced from `EventTypeMap`;
- Serde payload decoding that validates required fields and known scalar shapes;
- partial behavior in the app reducer, organized by feature domain;
- no handwritten event allowlist and no manually maintained no-op disposition table.

Unknown event names should produce a structured protocol-version diagnostic without crashing the terminal. Known events with malformed payloads should be rejected and logged with the event name. Additive unknown fields should remain tolerated; `deny_unknown_fields` would make harmless server additions needlessly breaking.

### 3. Reconnect and shutdown semantics are not yet agent-grade

The current transport queues arbitrary serialized messages while disconnected and flushes them after reconnect ([chat-ws-client.ts](../../../packages/cli/src/chat-ws-client.ts#L444)). It retries five times with deterministic exponential delays, without jitter. `close()` closes the socket, but the socket's close handler can still schedule reconnect because there is no intentional-shutdown state ([chat-ws-client.ts](../../../packages/cli/src/chat-ws-client.ts#L508)).

Most importantly, a generic queue cannot know whether replay is safe. Reissuing `conversation_list` is harmless. Reissuing a chat prompt after an uncertain send can duplicate a turn. Reissuing a future local shell or file mutation would be worse.

The Rust transport should not have a blind outbound queue. The app state should decide which desired operations can be reissued after reconnect. A sent chat turn that loses its socket before a terminal frame should become `Interrupted { delivery: Unknown }`; the UI can offer an explicit retry or reconcile against server state. It should not silently replay.

### 4. Application state is correct in intent but implicit in mechanics

Several recent improvements are worth preserving:

- attach is transactional and commits only on a matching hydration ack;
- the conversation picker operates on a frozen snapshot;
- first-chunk `conversationId` and `title` rekey a new conversation;
- terminal response/error frames settle only the active conversation;
- the most recent eight hydrated messages render with full bodies and `/expand` recovers capped messages;
- message rendering is block-authoritative rather than provider-field heuristic driven.

Today these rules are distributed across mutable fields, promise resolvers, timers, callbacks, and direct writes in [repl.ts](../../../packages/cli/src/repl.ts#L87) and [repl.ts](../../../packages/cli/src/repl.ts#L345). They work for one active turn, but the legal state transitions are not mechanically represented. Disconnect while attaching, cancellation during streaming, a picker over a reconnect, and shutdown during a timeout are consequently coordination cases rather than compiler-visible cases.

For example, socket disconnect settles an active chat turn but does not settle `pendingAttach`; an attach waits for its ten-second timeout even when the transport already knows the socket is gone. This is a state-model gap, not a reason to add a hydration error event.

The Rust app should model those states as enums and reduce all external input through one update function. One active turn remains the correct initial product constraint. The rewrite does not need operation IDs or concurrent prompts merely to make that state explicit.

### 5. The renderer contains good domain logic and one Rust porting trap

[render.ts](../../../packages/cli/src/render.ts#L8) correctly treats message blocks as authoritative, keys accumulation by ordinal, distinguishes thinking from text by block type, and reconciles the final response against streamed content. This is one of the strongest parts of the current CLI and should be ported from its tests and invariants, not redesigned casually.

Do not port `content.slice(alreadyLength)` literally. JavaScript string lengths and offsets are UTF-16 code units; Rust `String` indices are UTF-8 byte boundaries and arbitrary slicing can panic. The Rust stream accumulator should retain the previously seen full block string and use `strip_prefix(previous)` for monotonic aggregate frames. If the new block is not a prefix extension, record a protocol/render reconciliation event and replace from the authoritative final block. This handles Unicode safely and makes the provider invariant explicit.

The append-only `process.stdout.write` renderer is also incompatible with a durable composer, popup, spinner, resize, and concurrent notices. In Rust all visible output must pass through the terminal renderer. Async tasks should emit app events, never write to stdout.

### 6. The current handshake prepares metadata that it never sends

`CliConfigService.cookieHeader` builds the same location and client metadata the server parses ([config.ts](../../../packages/cli/src/config.ts#L56)), but the websocket opens with only `new WebSocket(this.url)` ([chat-ws-client.ts](../../../packages/cli/src/chat-ws-client.ts#L464)). The server reads `req.headers.cookie` before building `UserData` ([ws-server/index.ts](../../../apps/ws-server/src/ws-server/index.ts#L251)). The fact that the server's anonymous fallback currently contains Barrington-like defaults is a coincidence, not a fulfilled CLI handshake.

The Rust client can fix this without a new event or a changed web contract: construct a tungstenite request with the existing `?id=` query parameter, `Cookie`, and `User-Agent` headers. `tokio-tungstenite::connect_async` explicitly accepts a custom request for this purpose ([official API](https://docs.rs/tokio-tungstenite/latest/tokio_tungstenite/fn.connect_async.html)).

A separate CLI handshake becomes useful later when the CLI must advertise local-tool capabilities, protocol version, terminal graphics support, or approval policy. At that point use a CLI websocket subprotocol and/or a dedicated CLI hello event. Do not introduce a second handshake merely to solve the currently missing Cookie header, and do not mutate the browser handshake.

### 7. Tests validate the pure logic, not the dangerous boundaries

The package currently has 34 `it(...)` cases across three files. They cover conversation ranking/windowing/sanitization, hydrated history formatting, and message block helpers. On this review the following gates pass:

- `pnpm --filter @slipstream/cli typecheck`
- `pnpm --filter @slipstream/cli lint`
- `pnpm --filter @slipstream/cli test`
- `pnpm --filter @slipstream/cli build`

There are no transport tests, reducer/state-transition tests, fake websocket integration tests, terminal-buffer snapshots, PTY tests, or reconnect/shutdown tests. That is acceptable for a scaffold, but it means the passing suite does not protect the areas motivating the rewrite.

### 8. Documentation and configuration have already drifted

The README still documents `/convo <id>` and calls the CLI phase 1 ([README.md](../../../packages/cli/README.md#L35)), while the code now uses a live picker, local exact-match fallback for non-TTY use, readable hydration, `/expand`, and `/debug`. The model roster is a curated 13-entry compile-time constant in [types.ts](../../../packages/cli/src/types.ts#L11), while user/location defaults are embedded in `config.ts`.

There is also a concrete packaging mismatch: `package.json` exports `./renderer` as `dist/renderer.js` ([package.json](../../../packages/cli/package.json#L55)), while the build emits `dist/render.js`. The executable works, but that published subpath does not. A green bundle build is therefore not sufficient as a distribution test.

The Rust rewrite should retain a small built-in single-operator default, but distinguish:

- immutable build metadata;
- user configuration;
- credentials/session identity;
- server-supplied capabilities and provider state;
- per-session UI state.

This avoids turning every roster or endpoint change into a binary rebuild later.

## What To Preserve

The rewrite is not a product reset. The following are accepted behavior:

1. The ws-server remains the provider, persistence, memory, conversation, asset, image, and TTS backend.
2. `EventTypeMap` in `packages/types/src/events.ts` is the absolute wire-contract authority.
3. The existing `ai_chat_request` -> chunk(s) -> response/error flow remains unchanged for parity.
4. `userMsgId`, and the real `conversationId` plus `title`, continue to arrive through the existing chat frames. No generic request-ack event is needed.
5. A fresh chat is rekeyed from `new-chat` using the first real chat frame.
6. Conversation identities come from the server-fed index. Typed text filters entries; it is not interpreted as an arbitrary identifier.
7. Attach stays transactional. The active conversation is not replaced until its matching hydration ack arrives.
8. Conversation list pages are incremental Map upserts. The server intentionally sends one `conversation_list_ack` per generator page ([convo-list.ts](../../../apps/ws-server/src/resolver/convo-list.ts#L38)).
9. Hydrated resume shows readable recent messages, not one-line collapsed summaries.
10. Streaming and final reconciliation remain block-authoritative.
11. All event domains are generated now even when their interactive UI arrives later. Assets, image generation, and TTS are future CLI capabilities, not permanently web-only types.

The optional operation/correlation events proposed in earlier review rounds are not prerequisites for this rewrite. Dedicated correlation will be justified for a future local-tool request/result protocol, where multiple invocations can genuinely coexist. It should be introduced there, not retrofitted into today's sequential chat flow.

## Target Shape

### Repository placement

Start with one Cargo package inside the existing package:

```text
packages/cli/
  native/
    Cargo.toml
    Cargo.lock
    src/
      main.rs
      lib.rs
      app/
        event.rs
        effect.rs
        state.rs
        update.rs
      config/
      domain/
        conversation.rs
        message.rs
        model.rs
      protocol/
        decode.rs
        generated.rs
        mod.rs
      render/
        composer.rs
        markdown.rs
        transcript.rs
      terminal/
        session.rs
        ui.rs
      transport/
        connection.rs
        task.rs
    tests/
      fixtures/
      protocol.rs
      reducer.rs
      transport.rs
      ui.rs
```

Use a single Cargo package with a library target and binary target. Do not begin by copying Codex's multi-crate workspace; Codex has enough subsystems to justify that layout, while Slipstream currently does not. The official Codex Rust tree is still useful evidence for the separation between core, headless execution, and TUI, not a directory template to imitate ([Codex Rust README](https://github.com/openai/codex/blob/main/codex-rs/README.md)).

Keeping Rust under `packages/cli/native` gives the TypeScript implementation a stable fallback during migration and lets the existing npm package become a launcher/distribution surface later. Once Rust is the only interactive implementation, either promote `native/Cargo.toml` to `packages/cli/Cargo.toml` or keep `native` as the source of the packaged binary. That rename is not needed during the risky portion of the work.

There is no reason to use N-API for the runtime. This should be a standalone binary. The existing `@slipstream/cli` npm package can later install or dispatch to a platform-specific binary, but Node should not sit between the terminal and Rust process.

### One event loop, one terminal owner

Use Tokio for orchestration. A single app loop receives:

```rust
enum AppEvent {
    Terminal(TerminalEvent),
    Wire(WireEvent),
    Transport(TransportEvent),
    Timer(TimerEvent),
    Signal(SignalEvent),
    Tool(ToolEvent),
}
```

`update(&mut AppState, AppEvent) -> Vec<Effect>` is the only place that changes app state. Effects are explicit requests such as `SendWire`, `StartReconnectTimer`, `OpenConversationPicker`, `PersistConfig`, or `Exit`. The transport task and filesystem/tool workers execute effects and send results back as events.

The terminal reads only Crossterm's async `EventStream`; no other module reads stdin. Crossterm already provides structured key, paste, resize, focus, and mouse events, and its documentation explicitly warns against combining `EventStream` with other event readers ([Crossterm event docs](https://docs.rs/crossterm/latest/crossterm/event/index.html)). That constraint is exactly what the current implementation needs.

The main loop can use `tokio::select!` over terminal events, transport channels, timers, and shutdown signals. Tokio's documented channel/select pattern and graceful-shutdown model fit this ownership boundary ([select tutorial](https://tokio.rs/tokio/tutorial/select), [shutdown guidance](https://tokio.rs/tokio/topics/shutdown)).

### Explicit state, not coordination flags

The initial state model should be approximately:

```rust
enum ConnectionState {
    Disconnected,
    Connecting { attempt: u8 },
    Connected,
    Backoff { attempt: u8, until: Instant },
    Failed { reason: String },
    Closing,
}

enum ConversationState {
    Fresh,
    Active { id: ConversationId, title: Option<String> },
    Attaching {
        target: ConversationListEntry,
        previous: Option<ActiveConversation>,
        deadline: Instant,
    },
}

enum TurnState {
    Idle,
    Sending { prompt: PendingPrompt },
    Streaming { stream: StreamAccumulator },
    Interrupted { delivery: DeliveryState, partial: StreamAccumulator },
}

enum Overlay {
    ConversationPicker(ConversationPickerState),
    ModelPicker(ModelPickerState),
    Transcript(TranscriptState),
    Help,
}
```

These are conceptual names, not a demand to introduce wrappers for their own sake. Their value is exhaustiveness: an attach ack can only commit while `Attaching`, a response can only settle `Sending` or `Streaming`, and an intentional shutdown cannot accidentally enter `Backoff`.

Keep exactly one active turn until the product has a demonstrated need for queued or concurrent prompts. The composer can support drafting the next prompt without sending it.

### Inline-first terminal UI

Use Ratatui with Crossterm and default to an inline viewport so ordinary shell scrollback remains useful. Ratatui's `Viewport::Inline` is designed for a UI embedded in normal CLI output, and `Terminal::insert_before` can insert finalized transcript content above that viewport ([Viewport docs](https://docs.rs/ratatui/latest/ratatui/enum.Viewport.html), [Terminal docs](https://docs.rs/ratatui/latest/ratatui/prelude/struct.Terminal.html)).

Recommended layout:

- finalized messages are inserted into scrollback above the active viewport;
- the viewport owns the current streaming block tail, status line, composer, and optional popup;
- a transcript overlay provides searchable/scrollable full history;
- the conversation and model pickers are overlays in the same render tree;
- `--alternate-screen auto|always|never` can be added later, with inline as the first reliable mode.

Ratatui manages terminal diffing, but the application must still restore raw mode, cursor, paste mode, and alternate-screen state on normal exit, error, panic, and signal. No async worker may bypass Ratatui with direct cursor or stdout writes. Ratatui explicitly notes that direct backend mutations bypass its bookkeeping ([Ratatui crate docs](https://docs.rs/ratatui/latest/ratatui/)).

The first composer should support:

- Unicode grapheme-aware cursor movement and deletion;
- multiline input;
- bracketed text paste;
- prompt history;
- `Esc` to close an overlay or request turn cancellation;
- `Ctrl+C` once to cancel the active operation and twice to exit, with clear state-dependent behavior;
- resize without losing the prompt or corrupting the transcript;
- `/` command completion and live conversation filtering without leaving the event loop.

Use `unicode-segmentation` and `unicode-width`; do not index display text by Rust bytes or Unicode scalar count.

## Hand-Rolled TypeScript-to-Rust Protocol Generation

### Authority and scope

The generator entry point is the exported:

```ts
export type EventTypeMap = UTR<AnyEvent, "type">;
```

in [events.ts](../../../packages/types/src/events.ts#L912). It must enumerate `keyof EventTypeMap` through the TypeScript type checker and traverse the complete reachable payload graph. It must not start from a hand-maintained event list. The current 44 events are an observed count, not a constant to encode.

The shell layer should only orchestrate:

```text
tooling/scripts/generate-rust-events.sh
  -> pnpm executes packages/types/src/codegen/rust-events.ts
  -> TypeScript Program + TypeChecker resolve EventTypeMap
  -> a small internal wire-type IR is built
  -> packages/cli/native/src/protocol/generated.rs is emitted
  -> rustfmt formats the result
```

The TypeScript compiler API already models a repository `Program`, `Symbol`, and resolved `Type`; using the checker is the supported way to inspect mapped, conditional, imported, and generic types ([TypeScript compiler API guide](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)). Parsing source text or matching alias strings would fail on utilities such as `UTR`, `DX`, `CTR`, and imported Prisma enum types.

There should be no OpenAPI, JSON Schema, Quicktype, Swagger, or general-purpose codegen layer. The internal IR needs only the shapes this contract uses:

- object and property;
- string, boolean, and number;
- string/number literals;
- arrays and records;
- unions, intersections, null, undefined, and unknown;
- named references;
- recursive references;
- event discriminants.

Unsupported constructs fail generation with the fully qualified TypeScript path and checker-rendered type. They never degrade silently to `serde_json::Value`. The sole routine `Value` mapping is an actual TypeScript `unknown`, such as the existing `stopReason?: unknown`, because uncertainty is part of that declared contract.

### Generated Rust shape

Emit:

- `WireEvent`, internally tagged by the JSON `type` field;
- one Rust payload struct per resolved event/object shape;
- Rust enums for literal unions and resolved Prisma string enums;
- an `EventKind`/`event_kind()` helper generated from the same source;
- `Serialize` and `Deserialize` implementations through Serde derives;
- a generated event count and source fingerprint for diagnostics;
- a header stating that the file is generated and must not be edited.

Serde supports internally tagged enum representations directly ([Serde enum representations](https://serde.rs/enum-representations.html)). Preserve JSON field spelling with `rename` attributes instead of renaming the server contract.

Mapping rules should be deliberately small:

| TypeScript | Rust wire representation |
|---|---|
| `string` | `String` |
| `boolean` | `bool` |
| `number` | `f64` at the exact JS wire layer; checked domain conversion for ordinals/counts |
| string literal union | generated Rust enum with Serde renames |
| `T[]` / readonly array | `Vec<T>` |
| `Record<string, T>` | `BTreeMap<String, T>` for deterministic tests |
| optional or nullable field | generated optional/nullable representation preserving serialization behavior |
| `Date` | ISO-8601 `String` in wire types; parse only in domain types |
| actual TypeScript `unknown` | `serde_json::Value` |
| `bigint`, function, symbol, Map, Set, unresolved conditional | generation error unless the wire contract is corrected explicitly |

Mapping TypeScript `number` to `f64` is intentional at the generated boundary: JavaScript's number contract does not prove integer width or sign. Domain constructors should validate `messageCount`, ordinals, timestamps, sizes, and percentages into useful Rust integer/newtype forms. The generator must not guess integer widths from property names.

The IR should preserve optional and nullable as separate facts even where both deserialize into an `Option<T>`. If absence and explicit null are semantically different for a payload, emit a small required-nullable wrapper rather than losing that distinction.

### Contract hygiene before generation can be considered trustworthy

`HydrateConversationPage.convo` and `AIChatResponse.convo` currently use `ConversationSingleton<true>` ([events.ts](../../../packages/types/src/events.ts#L70), [events.ts](../../../packages/types/src/events.ts#L153)). That singleton is a broad recursive Prisma-derived graph containing optional user, attachment, memory, settings, and back-reference relations ([types.ts](../../../packages/types/src/types.ts#L189)). The websocket resolvers do not necessarily serialize that whole theoretical graph.

Blindly traversing it would produce exactly the bloated, misleading Rust surface this custom generator is intended to avoid. The right fix is not a CLI allowlist or an opaque generator override. Narrow the shared event payloads to exact wire DTOs that describe what the server actually selects and sends, without changing runtime JSON. For example, define precise hydrated-conversation and chat-response conversation/message shapes in the shared events domain and use those in `EventTypeMap`.

That is a contract-quality change, not a Rust exception. It benefits the web clients as well by making the declared payload equal the real payload. It should compile all current consumers before it lands. If narrowing reveals a consumer reading fields that are not actually present, that is a useful bug discovery.

Likewise, JavaScript `Date` values serialize as strings and raw `bigint` cannot be JSON-stringified. Any reachable event shape containing those types must describe the actual JSON representation at the shared wire boundary. The generator should expose such mismatches by failing rather than inventing a representation.

### Drift gate

Provide two commands:

```text
pnpm --filter @slipstream/types gen:rust-events
pnpm --filter @slipstream/types check:rust-events
```

`check:rust-events` generates into a temporary file and fails on a diff. CI should run it after TypeScript typecheck and before `cargo test`. Generated Rust is committed so code review shows protocol changes and users do not need Node merely to compile a release checkout.

Golden fixtures should serialize representative TypeScript events and deserialize them in Rust, then serialize Rust requests and validate them in TypeScript. Include at minimum every event discriminant, optional/null cases, literal enums, nested message blocks, assets, image generation, and TTS chunks. The purpose is wire equivalence, not snapshot volume.

## Transport Design

One Tokio task owns the websocket sink and stream. It communicates with the app through bounded channels. Its responsibilities are narrow:

1. Build the request with `?id=`, Cookie, User-Agent, and later an optional CLI subprotocol.
2. Establish TLS/websocket connection and surface the HTTP response or close reason.
3. Decode text frames to generated `WireEvent` values.
4. Encode app-supplied wire events.
5. Respond to the existing application-level `ping` event.
6. Surface connected, disconnected, malformed-frame, and retry-timer events.
7. Stop permanently on intentional shutdown.

The app, not the transport, owns semantic recovery:

- `conversation_list` may be reissued while the index is desired;
- an in-progress attach may be reissued only if the selected entry is still the pending target;
- a chat request is never automatically replayed after uncertain delivery;
- close code `4001` is an authentication failure, not a reconnect loop;
- backoff uses a cap and jitter and is visible in state;
- provider context and initial conversation pages are independent readiness signals, not a single magic handshake completion.

The server currently continues in-flight work after a socket closes ([ws-server/index.ts](../../../apps/ws-server/src/ws-server/index.ts#L345)). The client should therefore label the result unknown rather than claim that the model stopped. A later server resume/reconciliation feature can improve this, but it is not required for the Rust cutover.

One server issue should be tracked separately: during drain, every incoming event currently receives a `user_tts_error`, even if the request was chat or asset work ([ws-server/index.ts](../../../apps/ws-server/src/ws-server/index.ts#L322)). That response is not a reliable terminal chat event. Fixing the server's drain rejection semantics is worthwhile, but it should not be coupled to the initial Rust rewrite.

## Multimodal Is Part of the Architecture

Generate asset, image, and TTS events in phase 1. Their UI can arrive after chat parity, but the architecture should not label them web-only or discard them.

### Attachments and paste

Model attachment input as explicit sources:

```text
AttachmentSource::Path
AttachmentSource::ClipboardImage
AttachmentSource::PastedText
AttachmentSource::DroppedPath
```

Text paste comes from Crossterm's bracketed-paste event. Clipboard image acquisition is a separate capability and should be invoked through an explicit paste/attach action, with `arboard` or a platform-specific adapter only in the multimodal phase. Drag/drop commonly arrives as pasted path text and should pass through normal path validation.

The CLI should then drive the ws-server's existing presign/upload/complete event flow. Filesystem reads, MIME detection, size limits, upload progress, abort, and retry remain client responsibilities. Remote URLs and local paths must be displayed distinctly.

### Image rendering

Do not hand-roll terminal graphics protocols first. `ratatui-image` already supports Kitty, iTerm2, Sixel, and half-block fallbacks ([protocol documentation](https://docs.rs/ratatui-image/latest/ratatui_image/protocol/index.html)). The Kitty protocol is implemented by Kitty, Ghostty, Konsole, Warp, WezTerm, iTerm2, and xterm.js, among others, and is explicitly designed for images that integrate and scroll with text ([Kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/)).

Use capability detection and a deterministic fallback order:

1. native terminal image protocol;
2. cell/half-block preview if practical;
3. dimensions, MIME, and a clickable/openable URL or cached path.

Inbound generated images should be downloaded through a bounded cache and rendered as transcript items. Image decode/download happens off the render loop. The UI reserves stable cell dimensions before the image arrives so content does not jump incoherently.

### TTS

TTS frames should decode from day one, initially as an explicit unsupported-capability notice or downloadable artifact rather than an unknown event. Playback and streaming audio can be a later adapter. This preserves protocol awareness without pulling audio dependencies into chat parity.

## Path to a Coding Agent

A polished chat TUI is necessary but not sufficient for Claude Code/Codex caliber. The durable product boundary should be:

- **ws-server:** model/provider access, memory, conversation persistence, remote tools, assets, image generation, and TTS;
- **Rust CLI:** terminal UI, local workspace context, filesystem/search, process execution, patches, approvals, sandbox policy, and local audit trail.

Do not send the server unrestricted local filesystem access. When local tools begin, add a dedicated additive protocol for tool invocation and results. Tool calls genuinely require a call identity because several calls can be outstanding and results can arrive independently. That is where correlation belongs.

Build the local runtime in increasing-risk layers:

1. Repository orientation: working directory, git status, file listing.
2. Read-only tools: `repo_search`, `read_file`, `list_directory`, bounded diagnostics.
3. Patch proposal and diff rendering without applying.
4. Workspace-scoped writes with explicit approval.
5. Shell execution with command display, approval policy, timeout, output limits, and process-tree cancellation.
6. Configurable sandbox policies and network boundaries.
7. Headless/JSON mode for automation and tests.
8. Optional MCP/client extensions after the native tool lifecycle is stable.

Every tool request/result should be a transcript item with start, completion, error, duration, truncation, and approval state. The app loop must remain responsive while a tool runs. Tool output travels over bounded channels and is never printed directly by worker tasks.

The security model is a product feature, not a final hardening pass. Before write or shell tools ship, define canonical workspace containment, symlink handling, environment filtering, command cancellation, output caps, secret redaction, and an auditable approval decision model.

## Dependency Budget

No dependencies should be installed without explicit approval. This is the proposed review set, split so multimodal and coding-agent costs do not enter the parity binary early.

### Chat parity

| Crate | Purpose |
|---|---|
| `tokio` | runtime, channels, timers, signals |
| `tokio-tungstenite` | websocket client and custom request headers |
| `futures-util` | websocket stream/sink adapters |
| `serde`, `serde_json` | generated wire protocol |
| `ratatui` | testable terminal renderer and inline viewport |
| `crossterm` | structured terminal events/raw mode |
| `thiserror` | typed library errors |
| `tracing`, `tracing-subscriber` | file/debug diagnostics without corrupting the UI |
| `unicode-segmentation`, `unicode-width` | correct composer and layout behavior |
| `url` | websocket/login URL construction |
| `rand` | reconnect jitter |
| `clap` | stable flags and headless subcommands |

`clap` is optional for the first spike, but hand-parsing a growing set of global flags, subcommands, and conflicts is not a useful sovereignty win. The custom work belongs in the protocol generator and app behavior.

### Test-only

| Crate | Purpose |
|---|---|
| `insta` | reviewed terminal and reducer snapshots |
| `vt100` | terminal-output interpretation for regression tests |
| a PTY harness | raw-mode, signal, resize, and restoration tests |

Ratatui includes a `TestBackend` intended for UI tests ([backend documentation](https://ratatui.rs/concepts/backends/)); `insta` is useful for reviewed complex snapshots ([insta documentation](https://docs.rs/insta)). A PTY crate should be selected only after checking whether the repository's existing process-test tooling is sufficient.

### Multimodal, later

| Crate | Purpose |
|---|---|
| `reqwest` | image/artifact fetch and upload HTTP |
| `image` | decode and resize image inputs |
| `ratatui-image` | terminal graphics protocols and fallback rendering |
| `arboard` | local clipboard image access where supported |

### Coding-agent phase, later

Prefer existing system engines where they are already the correct abstraction: `rg` for repository search, `git` for repository state/diffs, and the platform shell for commands. Wrap them with typed process supervision rather than embedding substitute implementations. Add sandbox-specific crates only after the policy is defined.

Commit `Cargo.lock` because this is an application. Pin a Rust toolchain after the first manifest lands; the workstation currently has Rust 1.94.1, but the minimum supported version should be chosen from CI targets rather than assumed from the developer machine.

## Migration Plan

### R0: Freeze behavior and capture fixtures

**Work**

- Treat the TypeScript CLI as the behavioral oracle for chat parity.
- Update its README to the actual picker/resume behavior only when implementation begins.
- Capture sanitized real frames for connection, provider context, list pages, hydration, chat chunk/response/error, assets, image generation, and TTS.
- Record live flows for at least Anthropic aggregate/delta behavior, Gemini block behavior, and one OpenAI-compatible provider.
- Avoid new TypeScript CLI features during the dual-runtime window; continue critical bug fixes.

**Gate**

- Fixtures contain no credentials or private conversation content.
- Current typecheck, lint, 34-case suite, and build remain green.

### R1: Wire contract and generator

**Work**

- Add `packages/cli/native` as one Cargo package.
- Implement the TypeScript compiler-API generator and its internal IR.
- Narrow broad `ConversationSingleton` event members to exact wire DTOs where the checker exposes non-wire graph expansion.
- Generate every `EventTypeMap` member into `generated.rs`.
- Add TS-to-Rust and Rust-to-TS golden fixtures.
- Add the generated-file drift check.

**Gate**

- No handwritten event-name list exists in Rust.
- All current event discriminants generate and deserialize.
- Unsupported reachable TypeScript types fail with actionable paths.
- Web, web-next, ws-server, shared types, and the existing CLI still typecheck.
- `cargo fmt`, `cargo clippy -- -D warnings`, and `cargo test` pass.

### R2: Headless transport parity

**Work**

- Implement configuration, custom websocket request, auth failure handling, ping, provider context, and incremental conversation index.
- Implement generated decode/encode and structured logging.
- Implement explicit connection/reconnect/shutdown state with bounded channels.
- Add a temporary headless command that can list conversations, hydrate one exact server-provided entry, send one prompt, and stream JSON/text to stdout.
- Build a fake websocket server test harness for deterministic flows.

**Gate**

- Cookie/user metadata is observed correctly by the test server.
- Initial unprompted list pages and manual refresh merge idempotently.
- First-chunk rekey, response, error, mid-turn disconnect, auth close, attach timeout, and intentional shutdown are covered.
- No chat request is blindly replayed.
- The real development ws-server completes a prompt and resume smoke test without server contract changes.

### R3: Terminal kernel and parity UI

**Work**

- Add the single Crossterm event stream and Ratatui inline terminal session.
- Implement the app reducer/effect loop and guaranteed terminal restoration.
- Port block accumulation, final reconciliation, hydrated tail formatting, and `/expand` behavior.
- Port conversation ranking and the frozen-snapshot picker as an overlay.
- Add a grapheme-safe multiline composer, command palette, model picker, notices, spinner/status, resize, and cancellation semantics.
- Route logging to a file/debug pane rather than stdout.

**Gate**

- All 34 current pure behavior cases have Rust equivalents.
- UI snapshots pass at narrow, standard, and wide sizes with Unicode, long titles, long code lines, and thinking/text interleaving.
- PTY tests cover arrows, burst input, bracketed paste, resize, Ctrl+C, Esc, picker cancellation, panic, and clean terminal restoration.
- Resume shows the latest configured message count in readable form.
- Async transport notices cannot corrupt the composer or popup.

### R4: Cutover and operational polish

**Work**

- Make the Rust binary the default `slipstream` entry while preserving an explicit TypeScript fallback for one soak period.
- Add headless `ask`/JSON output, stable exit codes, shell completion, config diagnostics, and a version/protocol diagnostic command.
- Build the first supported release target for the actual operator environment, then add macOS arm64/x64 and Windows deliberately.
- Package platform binaries through GitHub releases and, if desired, the existing npm package as a thin launcher. Add Homebrew only when distribution demand justifies it.

**Gate**

- Repeated live sessions across the provider roster do not corrupt the terminal or lose final reconciliation.
- Auth expiry, ws-server restart, sleep/wake, and network interruption have understandable recovery.
- The Rust path is the daily driver through a defined soak window.
- The TypeScript runtime is removed only after the fallback is no longer being used; its fixtures and relevant behavior tests remain as protocol history.

### R5: Assets, image generation, and TTS

**Work**

- Implement file/path/clipboard attachment sources and existing upload events.
- Add progress, abort, retry, and attachment transcript items.
- Add terminal capability detection and image rendering fallbacks.
- Add image-generation progress/results.
- Add TTS artifact handling, then optional playback.

**Gate**

- Unsupported terminals receive usable textual fallbacks.
- Large images/files cannot block the event loop or exceed configured memory/disk limits.
- Paste never confuses image data, text, and file paths.
- Every generated event in these domains has a deliberate UI or logged disposition.

### R6: Local coding-agent bridge

**Work**

- Define the dedicated local-tool request/result protocol with call identity and cancellation.
- Ship read-only repository tools first.
- Add diff proposal, approvals, workspace writes, then supervised shell execution.
- Add sandbox policies, audit records, and headless automation.

**Gate**

- Workspace containment and symlink tests pass across supported platforms.
- Every mutation or command is tied to an approval decision and transcript item.
- Cancellation terminates process trees and drains output safely.
- Tool protocol reconnect/replay semantics are explicitly tested before concurrency is enabled.

## Acceptance Matrix for Rust Cutover

| Behavior | Required evidence |
|---|---|
| Connect/auth | custom-header fake-server test plus live 4001 test |
| Provider context | startup ordering permutations |
| Conversation index | multi-page, overlap, refresh, and stale snapshot tests |
| Picker | ranking, Unicode, resize, paste/burst, cancel, no-match |
| Transactional attach | success, timeout, mismatch, two rapid selections, disconnect |
| New chat | first chunk rekey with id/title |
| Existing chat | exact hydrated tail and message index |
| Streaming | aggregate and delta frames, interleaved block types, Unicode |
| Final response | missing live block recovery without duplication |
| Error | pre-stream and mid-stream terminal settlement |
| Reconnect | safe state recovery without chat replay |
| Shutdown | no reconnect, terminal restored, workers joined |
| Non-TTY | deterministic headless output and exit codes |
| Protocol drift | generated file check and cross-language fixtures |

## Risks and Controls

### Generator expands the wrong abstraction

**Risk:** Traversing broad ORM-derived types creates a massive Rust graph that does not match JSON.

**Control:** Fail on non-wire constructs and narrow shared event DTOs to real resolver output. Traverse only types reachable from `EventTypeMap`, but traverse every event domain.

### Dual implementations drift

**Risk:** Features land in TypeScript while Rust catches up indefinitely.

**Control:** Keep the parity window short, freeze noncritical TS CLI features after R0, and define R3/R4 cutover gates now.

### Rust is mistaken for the architecture

**Risk:** The port reproduces callbacks, direct output, and implicit state in Rust.

**Control:** Do not start TUI work until the generated protocol, headless transport, app-event boundary, and reducer tests exist.

### Terminal portability consumes the roadmap

**Risk:** Images, keyboard protocols, tmux, WSL, SSH, and platform clipboards multiply cases.

**Control:** Inline text parity first, structured capability detection, PTY tests, and graceful fallbacks. Add platforms in the order they are actually used.

### Coding-agent ambition swallows chat parity

**Risk:** Shell, sandbox, approvals, MCP, and tools delay a dependable daily-driver client.

**Control:** R0-R4 contain no local mutation tools. R6 begins read-only and has separate security gates.

## First Implementation Slice

The first pull request should contain only:

1. `packages/cli/native/Cargo.toml`, `Cargo.lock`, `lib.rs`, and a minimal compiling binary.
2. The repository-owned `EventTypeMap` compiler-API generator and deterministic `generated.rs`.
3. Exact shared wire DTO narrowing required to prevent recursive ORM graph generation, with all existing TypeScript consumers green.
4. Cross-language protocol fixtures and the generated-file drift command.
5. No TUI, no new websocket events, no chat correlation fields, no server behavior change, and no npm cutover.

The second pull request should be the headless authenticated transport against a fake server and the real development ws-server. This ordering makes the two highest-risk assumptions measurable before any terminal UI is built: that the shared TypeScript contract can generate precise Rust, and that the existing server flow is sufficient for a native client.

## Final Assessment

The Rust instinct is in line with the product goal. TypeScript was the right material for proving the ws-server flow and discovering the real UX requirements. It is no longer the lowest-risk foundation for the terminal client being described.

The rewrite remains pragmatic only if it preserves the working contract, carries forward the tested domain behavior, starts with one crate, generates all event types from `EventTypeMap`, and earns the TUI through headless parity. A language rewrite should buy explicit ownership and testable state; otherwise it is churn.

Proceed with R0 and R1. Do not reopen the earlier generic chat-ack/correlation design as part of the Rust work. Reserve new events for capabilities that actually need them, especially the later local-tool bridge.

# Fable Response to Sovereign CLI Phase-Two Findings

**Author:** Claude Fable 5
**Reviewed:** 2026-07-11
**Scope:** A response to [`sol-findings.md`](./sol-findings.md) — concurrences,
additions, and sequencing deltas. This is a review of Sol's document against
the repository's stated rules and against failure patterns observed in the
ws-server fleet the same day; it is **not** an independent re-audit of
`packages/cli/src`. Line-level claims about the CLI source are taken from
Sol's citations, which I have no reason to doubt but did not re-verify.

## Verdict

The review is strong and the phase-two plan is the right shape. The
load-bearing insight is correct: the CLI's defects are not feature bugs, they
are consequences of three implicit state machines (connection, attachment,
turn) sharing uncorrelated mutable slots. All three P0s are the same disease —
an operation mutates shared state before its outcome is known, and any
arriving frame can settle any waiting continuation. Fixing them individually
without the state model would relocate the leaks, not remove them.

## Concurrences

**The P0 set, as a class.** Transactional attach, correlated turns, and the
death of the global `pendingPrompt` slot are one fix wearing three hats:
correlation identity plus a single finalize path. Sol's phrasing — "clear the
record in a single finalize path for success, provider error, disconnect,
cancellation, and timeout" — is the principle the whole phase hangs on.

**Killing the trailing-prompt feature.** Correct, and the reasoning deserves
to be stated plainly: deleting the feature deletes the bug class. No amount of
bookkeeping protects a shared mutable slot as well as not having one. The
scripting use case is better served by the Phase 2C `ask` surface anyway.

**The frozen listing snapshot.** This *preserves* the recently shipped
`/convo <number>` interaction (commit `321fcfc`) while making the number mean
something stable. It is a refinement of existing UX, not a removal — worth
saying explicitly since that command shipped days ago. Storing ordered IDs
plus a snapshot version, while metadata stays in the ID-keyed registry, is the
right split (UI state vs cache), and it matches this repo's existing distrust
of derived duplicate caches.

**Discriminated session states.** `ConnectionState` / `ConversationState` /
`TurnState` as discriminated unions where invalid combinations are
unrepresentable is not a new convention for this repository — it is CLAUDE.md's
**Discriminated Separation** hard rule applied to the CLI. Sol is proposing
that the CLI obey house style. Same for the P2 finding on competing global
augmentations and bare `as` assertions: those are direct hard-rule violations
that the package's lint demonstrably does not catch. I would fix the P2 type
violations opportunistically and immediately, regardless of phase — they are
mechanical, and the repository check Sol proposes (so a passing build actually
enforces the hard rules) has value far beyond the CLI package.

**The explicit non-decisions.** All six are correct, and two are load-bearing:
no full-screen TUI yet, and no concurrent turns until one active turn is
explicit and correct. Concurrency multiplied against the current implicit
state model would be unshippable.

## Additions

### 1. Terminal-state discipline is a codebase-wide theme, not a CLI theme

The same day this review landed, the ws-server anthropic chat path was found
to hang the web client for the same root cause as Sol's P0 #3, mirrored
server-side: its tool loop exhausted `MAX_TOOL_ROUNDS` and fell off the end of
the function with **no terminal event** — no `ai_chat_response`, no error
frame. The client spinner waited forever on a turn the server had silently
abandoned. The sakana path's `forcedLoopStopReason` fallback is the correct
pattern and already exists in-tree; the anthropic path predates it.

So Sol's finalize-path principle should be read as bidirectional contract
hygiene: **every operation that can start must be able to announce every way
it can end, on both sides of the socket.** When the correlated
`hydrate_conversation_result` and list-completion events are added, the same
pass should audit the server's provider loops for silent exits (anthropic loop
exhaustion is the known one). A CLI with perfect turn correlation still hangs
if the server can end a turn without saying so.

### 2. The wire-contract changes are additive — say so, and exploit it

`EventTypeMap` is the contract of contracts for this system, and changes to it
are correctly treated as scary. The proposed additions
(`hydrate_conversation`/`_result` with `requestId`, correlated list paging
with a `done` marker) are **purely additive**: existing web clients never emit
or consume the new event types, so nothing breaks and nothing needs
simultaneous deployment. This materially lowers the risk of Phase 2A and
should be stated in the plan, because it removes the main argument for the
"compatibility bridge" (local `attaching` state + timeout without server
support). The bridge is strictly worse — a timeout cannot distinguish
NOT_FOUND from FORBIDDEN from slow — and since the real contract change is
cheap and non-breaking, I would skip the bridge entirely unless server work is
blocked for external reasons.

One cost Sol underweights slightly: the hydration error path requires a
server-side change too. `convo-hydration.ts` uses `findFirstOrThrow`, so
today a missing ID presumably surfaces as a server-side throw with no typed
frame. Catching that and emitting the `ok: false` result is a small resolver
edit, but it touches error-handling conventions (this repo bans exceptions as
control flow — the resolver should check existence or catch at the boundary
and map to the typed result, not let the throw propagate).

### 3. Correlation identity: reuse `userMsgId` where it already round-trips

Sol suggests keying the active turn by "`userMsgId` or a new client-generated
`requestId`." Sharper: use the identity the server already round-trips
(`userMsgId`) for chat turns, and introduce `requestId` **only** where no
natural key exists (hydration, listing). Two ID namespaces doing the same job
in the same contract is drift waiting to happen; one new field for the two
request/response pairs that lack identity is the minimal change.

### 4. Compile-time coupling for the hand-written parsers

The P1 recommendation for hand-written runtime parsers (no dependency) is
right, with one strengthening move: define the CLI-consumed inbound union in
the CLI package but validate each parser's return type against the
corresponding `EventTypeMap` member via `satisfies`. Then a contract change in
`@slipstream/types` breaks the CLI's typecheck at the parser, not at runtime
in a handler. Runtime narrowing stays hand-written and lean; drift becomes a
compile error. Without this, the parsers are a *second* copy of the contract —
the same disease as the copied dispatcher, one layer down.

### 5. `events(): AsyncIterable` — state the single-consumer assumption

The proposed `CliTransport` interface exposes `events()` as an
`AsyncIterable`. Async iterators are single-consumer by default; two readers
racing `next()` will interleave, not broadcast. In the proposed architecture
this is fine **because `CliApplication` is the only consumer** and fans out to
controllers itself — but that invariant should be written into the interface
contract, or the first person who wires a logger up to `events()` alongside
the app loop gets a heisenbug. Alternatively make the transport push into the
application (callback/emitter) and keep the iterable as a test convenience.

## Sequencing deltas

**Pull the lossless-resume fix forward.** The P1 on `renderHydratedTail` is
the highest user-visible value per unit effort in the entire document: pure
client rendering, no contract change, no dependency on the state model. The
whole point of resuming a conversation is recovering working context, and the
current 160-char single-line collapse defeats the product's reason to exist at
the exact moment of attach. It can ship before 2A without touching anything
2A changes. One nuance to keep from the current design: pathological messages
(a 100KB paste) argue for a generous per-message soft cap *with an explicit
truncation marker and `/expand` pointer* rather than unconditional losslessness
— Sol's pager note covers the deliberate case; the marker covers the
accidental one. Silent truncation stays banned either way.

**Land 2A inside the current class structure.** The composition rewrite
(`CliApplication` + controllers replacing the inheritance chain) is the
largest-blast-radius item in the plan. Sol correctly sequences it with the
transport replacement in 2B, but the plan should say the quiet part loudly:
the P0 fixes in 2A must **not** wait for, or be entangled with, the rewrite.
Correlated attach, turn records, and snapshot resolution are all expressible
in the existing `SlipstreamReplService` with contained diffs. Refactor at the
boundary in 2B, with 2A's new tests as the safety net — that order also
matches this repository's stated preference for minimal blast radius per
change.

**2A's exit criterion is good; add one test to its list.** "Two rapid attach
requests with different follow-ups" is listed — also add *stale hydration
result arrives after a newer attach committed* (result correlation must reject
by `requestId`, not by `conversationId`, since re-attaching to the same
conversation twice is legal and the second result must not double-apply).

## Where I'd push back

Nothing in the document is wrong enough to strike. The two candidates I
examined and declined:

- **"Replace the copied dispatcher" as P1 rather than P0.** Tempting to argue
  it up (it is the enabling condition for testability), but Sol's ordering is
  right: the dispatcher is ugly-but-working, while the P0s corrupt user state
  today. Ugliness is not an emergency.
- **`/system --clear` style flags.** A minor ergonomic tax versus `/system
  clear`, but Sol is right that the literal-text collision is real, and
  flag-style modifiers scale to the rest of the command set (`/convo --id`,
  `/history --compact`) where bare words cannot.

## On the Phase 3 agent runtime

The ten-item runtime list is the correct skeleton and the ordering guidance
(read-only tools first, writes only after containment/cancellation/audit are
tested) is exactly right. One addition: the server contract for local tools
(stable tool-call IDs, idempotency, size limits, cancellation, reconnect)
should be designed alongside — not after — the 2A correlation work, because it
is the same problem. `requestId`-correlated request/result pairs with typed
failure codes *is* the local-tool protocol in miniature; hydration is simply
its first instance. Designing 2A's events with that generalization in mind
costs nothing now and prevents a second, incompatible correlation idiom later.

## Bottom line

Adopt the plan as written, with these amendments: skip the compatibility
bridge and do the additive contract change immediately; reuse `userMsgId` for
turn identity and reserve `requestId` for hydration/listing; `satisfies`-couple
the runtime parsers to `EventTypeMap`; document the transport's
single-consumer semantics; pull lossless resume ahead of 2A; keep 2A inside
the current structure and let the composition rewrite ride with 2B; and audit
the server's provider loops for silent terminal states as part of the same
correlation pass — the anthropic loop-exhaustion path is the known instance.

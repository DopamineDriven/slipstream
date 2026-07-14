# Sovereign CLI — Plan of Record (Phase 2 + Read-Only Alpha)

**Author:** Claude Fable 5
**Date:** 2026-07-12
**Status:** Plan of record — the architecture review cycle is closed.
**Inputs:** [`sol-findings-v3.md`](./sol-findings-v3.md) (convergence decision),
[`gpt-high-assessment.md`](./gpt-high-assessment.md) (read-only alpha
feasibility), and the full prior exchange
([`sol-findings.md`](./sol-findings.md) → [`fable-findings.md`](./fable-findings.md)
→ [`sol-findings-v2.md`](./sol-findings-v2.md) →
[`fable-findings-v2.md`](./fable-findings-v2.md), grounded in
[`fable-5-plan.md`](./fable-5-plan.md)).

## Closing the review cycle

Sol's v3 disposition is accepted wholesale, including the narrow correction to
my round two: I asserted production list-state ingestion alongside the
hydration consumers, and Sol's verification found no web/web-next state handler
for `conversation_list_ack` — only dispatcher cases and type references. The
consumer-audit rule survives (the event is registered contract either way);
the factual record narrows. Conceded.

Nothing below reopens an architectural question. This document consolidates
the converged decisions into one actionable plan, integrates the read-only
coding-agent alpha from `gpt-high-assessment.md` into the sequencing, and
fixes the two places where that assessment is thinner than this review cycle's
standards: correlation discipline and terminal-state completeness on the
server side of the tool bridge.

## The two invariants everything rides on

Every phase below is an application of two rules the review cycle converged
on. They are restated once here and assumed everywhere:

1. **Exactly one terminal result.** Every operation that can start — a chat
   turn, an attach, a manual list, a local tool call, a provider tool loop —
   must emit exactly one terminal success/failure/cancellation/timeout result
   on every execution path, on both sides of the socket. Wall-clock deadlines
   (never token or round rationing) bound runaway work.
2. **Strong-additive contract evolution.** `packages/types/src/events.ts` is
   the absolute authority. Existing members never gain required fields, never
   change shape, never disappear. New capability arrives as new members plus
   optional fields on old ones. Every consumer maintains an exhaustive
   disposition map (`Record<AnyEventTypeUnion, "HANDLE" | "IGNORE">`) so a
   newly registered event forces a visible decision in web, web-next, and the
   CLI. The runtime discriminant registry exports from `events.ts` — validated
   `Record<AnyEventTypeUnion, true>` — never copied string arrays.

## Delivery order

```text
mainline:      2.0 readable resume → 2A correlation kernel → 2B transport/DX → 2C automation
experimental:  3-alpha read-only tool bridge (flagged, contract-aligned) ──merges after 2A──┘
```

The alpha forks now on an experimental branch and runs in parallel with 2.0;
it must consume the 2A envelope conventions from day one so it *exercises* the
correlation model rather than forking it. It merges to mainline only after 2A
lands.

### Phase 2.0 — Readable resume (proceed now)

Per Sol v3's gate, verbatim:

- render the latest eight hydrated messages with full bodies, normal speaker
  headers, and preserved whitespace;
- generous, configurable per-message safety cap for pathological messages
  only — explicit truncation marker, original size, and the exact
  `/expand <ordinal>` recovery; never silent collapse;
- renderer tests: prose, code fences, tables, leading whitespace, cap
  behavior, color off;
- **no wire-contract or state-machine change in this patch.** `/history more`
  and cursor state follow as a separate change.

**Exit:** attaching immediately exposes faithful recent context — the resume
workflow works without opening the web client.

### Phase 2A — Correlation and terminal correctness (after 2.0)

Inside the current layered class chain; no dispatcher replacement bundled.

**Contract (all strong-additive; shapes as specified in sol-findings-v3):**

- optional `operationId` on existing request members; legacy behavior
  preserved when absent; web hydration contexts untouched;
- `hydrate_conversation_result` — `COMPLETE` with pages | `FAILED` with
  `NOT_FOUND | FORBIDDEN | INTERNAL`; correlated requests settle only from
  the result path; legacy requests keep the unchanged ack;
- `conversation_list_result` — `PAGE* → COMPLETE | FAILED`; the unsolicited
  warmup keeps legacy `conversation_list_ack` and warms only the ID-keyed
  registry; a manual `/convos` settles only from its own results and freezes
  its snapshot from them (no server-side warmup ID needed);
- `ai_chat_request_ack` — `ACCEPTED {conversationId, userMsgId}` |
  `REJECTED {code, message}`; **no title** (title stays a chunk/response
  concern; the web's first-chunk id+title rekey is untouched — the ack is a
  parallel capability, not a migration);
- the `"no-msg-id-yet"` sentinel: never emitted for correlated requests,
  marked legacy elsewhere, removal criterion = all chat senders adopt the
  ack, and it never enters the new CLI state model.

**Server:** hydration existence/ownership checked without exceptions as
control flow; the Anthropic tool loop gains its forced-terminal fallback
(loop exhaustion currently returns without any terminal frame —
`anthropic/index.ts:1209`; commit `2ff7254` made this unreachable-in-practice
at cap 100 but did not fix it); audit every provider's break/exhaustion path
for exactly-one-terminal-event.

**CLI:** transactional attach (`ATTACHING` holds `previous`; commit is
atomic; stale results rejected by `operationId`, including same-target
re-attach); trailing-prompt syntax and `pendingPrompt` deleted; frozen
numbered listing snapshots (ordered IDs + version; metadata stays in the
registry); discriminated connection/conversation/turn states
(`SUBMITTING` by `operationId` → `STREAMING` by `userMsgId`); one finalize
path per operation; hard-rule violations (competing augmentations, bare
`as`) fixed in every touched file.

**Exit:** no stale, duplicate, missing, interrupted, or rapidly reselected
operation can mutate the wrong session, send to the wrong conversation, or
remain pending without a terminal state — proven by the test gate below.

### Phase 3-alpha — Read-only tool bridge (experimental branch, parallel)

The `gpt-high-assessment.md` goal is adopted: three tools, models reading the
local tree through Sovereign CLI. Its architecture is adopted with the
corrections below. Success criterion unchanged: one recorded session where
both Fable and Sol, independently, locate an unfamiliar implementation from a
natural-language request, read multiple files, and produce a source-grounded
assessment with file/line references.

**Tools (exactly three, read-only):** `repo_search` (rg, `.gitignore`
honored), `read_file` (line-ranged), `list_directory` (depth-bounded).

**Envelope — harmonized with 2A conventions rather than the assessment's
draft:** new strong-additive `EventTypeMap` members `local_tool_request`
(server → CLI: `operationId`, `toolCallId`, `name`, `arguments`) and
`local_tool_result` (CLI → server: `operationId`, `toolCallId`,
`status: "COMPLETE" | "FAILED"`, `content?`, `error? {code, message}`,
`truncated?`). Error codes as drafted
(`INVALID_ARGUMENTS | OUTSIDE_WORKSPACE | NOT_FOUND | TOO_LARGE | INTERNAL`).
Both members get disposition entries (`IGNORE`) in web and web-next.

**Two obligations the assessment underweights — non-negotiable here:**

1. **The bridge inverts the request direction, so correlation is
   double-ended.** `local_tool_request` is a *server-initiated* operation
   against the CLI. The CLI accepts one only when it matches the active
   turn's `operationId` and no other tool request is pending; anything else
   is answered `FAILED`/stale-rejected, never executed. The alpha constraint
   set from the assessment is adopted verbatim: one active turn, one tool
   request at a time, no concurrent prompts, no reconnect/resume during a
   tool round, no writes, no shell, feature-flagged bridge.
2. **The server side of the bridge is a pending operation and owes a terminal
   result.** The provider loop parks on a `Promise.withResolvers` keyed by
   `toolCallId` with a wall-clock deadline (house rule: bound time, never
   rounds). Deadline expiry or CLI disconnect while a tool call is pending
   must synthesize an `is_error` tool result to the model — or finalize the
   turn with `ai_chat_error` — so a vanished CLI can never wedge a provider
   loop. This is the same invariant as the Anthropic exhaustion fallback,
   arriving with the feature instead of being retrofitted.

**Containment (from the assessment, adopted as written):** single configured
workspace root (`--workspace`); `realpath` both root and candidate, reject
unless `candidate === root || candidate.startsWith(root + sep)`; symlink
escapes rejected post-realpath; binary files rejected; lines/bytes/matches/
depth bounded with explicit truncation metadata; every call logged with name,
arguments, duration, result size, status; no shell reachable through any
argument.

**Fallback surface:** `/search`, `/read` as explicit CLI commands attaching
bounded excerpts to the next request — built alongside the bridge, kept
permanently as the debugging surface.

**Merge gate:** the alpha branch merges only after 2A lands on mainline; its
envelope is already 2A-shaped, so graduation is a rebase, not a redesign. Its
receipts (tool logs, stale-rejection counts, deadline hits) feed Phase 3
scoping.

### Phase 2B — Transport and terminal DX (after 2A)

Unchanged from v2/v3: CLI-owned transport with `subscribe()` that **throws on
a second active subscriber** (invariant in code, not docs; transport-internal
logging is not a subscriber); runtime parsers reconstructing the consumed
union, `satisfies`-coupled to `EventTypeMap`; copied dispatcher and duplicate
`chat-ws.ts` types deleted; redraw-safe async output, compact stateful
prompt, `/current`, `/doctor`; graceful shutdown, cancellation, terminal
`FAILED` connection state, replay reconciliation; typed command descriptors.

Plus the handshake split per Sol v3: versioned `Sec-WebSocket-Protocol`
families `slipstream.web.v1` / `slipstream.cli.v1` — a handshake split, not
an event-protocol fork; both speak the same `EventTypeMap` after upgrade. The
CLI protocol sends the typed `Cookie` header through the workspace `ws`
client (the Barrington fallback coincidence stops being load-bearing), client
version, and terminal metadata; unsupported versions rejected with a stable
close code; connections without a subprotocol treated as legacy web during
migration.

### Phase 2C — Automation surface (after 2B)

Unchanged: multiline/editor input; `slipstream ask`, stdin, `--json`, stable
exit codes, color detection; one typed settings registry; `CliApplication`
extracted only when the second caller exists; fake-server integration tests
plus an opt-in live smoke test.

### Phase 3 — Local agent runtime (after 2C + alpha receipts)

The alpha graduates into the full runtime only with: approval-policy tiers
(read-only / workspace-write / network / destructive), patch and write tools
behind diff/review checkpoints, bounded command execution with subprocess
cleanup, append-only run logs and resumable runs, idempotent result
submission, and CI-suitable non-interactive behavior. Read-only tools first
proved the loop; writes wait for containment, approval, cancellation, and
audit to be *tested*, exactly as the original phase-two review specified.

## Consolidated test gate

Sol v2's list, plus v3's eight additions, plus the alpha's obligations:

- warmup frames before/during/after a manual `/convos` never settle it or
  mutate its frozen snapshot;
- disconnect while `ATTACHING` settles exactly once, preserves the previous
  conversation, rejects the dead `operationId` after reconnect;
- `REJECTED` ack renders its typed message, not raw JSON;
- legacy hydration (no `operationId`) receives the unchanged ack shape;
  correlated hydration settles only via the result path;
- ack omits title; the first chunk still carries and applies it for web;
- the runtime event registry is exhaustive against `AnyEventTypeUnion`;
  every consumer holds a complete disposition map;
- a second active transport subscriber is rejected deterministically;
- provider-loop exhaustion emits exactly one terminal event (every provider,
  every break path);
- **alpha:** path containment (traversal, absolute escape, symlink escape,
  URL-encoded traversal) rejected with `OUTSIDE_WORKSPACE`; truncation
  metadata present at every bound; a stale or duplicate `toolCallId` is
  rejected without execution; CLI disconnect and deadline expiry during a
  pending tool call each produce exactly one terminal turn event server-side;
  flag off ⇒ no tool definitions attached to any provider request.

## Non-decisions retained

No full-screen TUI; no command/fuzzy-search frameworks; no concurrent turns
until one turn is correct (the alpha's one-turn/one-tool constraint is this
rule applied); no local transcript store; no shell commands encoded in model
prose; no rewrite bundled with correctness work; no write tools before the
Phase 3 gate.

## Final word

Proceed. Phase 2.0 is a contained rendering patch and starts immediately; 2A
follows in the current class structure; the read-only alpha runs in parallel
on its own branch wearing 2A's correlation conventions from birth. Every
remaining open item — error-code spellings, the history display cap, rg flag
details — is a code-review decision. The next architecture document in this
directory should be written by whichever reviewer audits the *implementation*
against the invariants, not another plan.

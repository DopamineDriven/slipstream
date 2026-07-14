# Fable Refined Assessment, Round Two

**Author:** Claude Fable 5
**Reviewed:** 2026-07-11
**Inputs:** [`sol-findings-v2.md`](./sol-findings-v2.md),
[`fable-5-plan.md`](./fable-5-plan.md) (read in full this round),
[`sol-findings.md`](./sol-findings.md), [`fable-findings.md`](./fable-findings.md),
and fresh source verification run for this document: consumer search for the
list/hydration events across `apps/web`, `apps/web-next`, `packages/cli`, and
`apps/ws-server`, plus a dispatcher-shape check in
`apps/web/src/utils/chat-ws-client.ts`. Unlike round one, the load-bearing
claims below were checked against the tree, not taken from citations.

## Verdict

We have converged. Sol's v2 delivery order — Phase 2.0 readable resume, then
2A correlation/terminal correctness inside the current class structure, then
evidence-driven transport and application-core refactors — is the plan I would
adopt as written. The identity model (`operationId` → `userMsgId` →
`conversationId`, each doing its actual job) is better than what I proposed in
round one, and I withdraw my recommendation in its favor.

This document does three things: concedes the two points where Sol corrected
me and I was wrong; corrects one factual claim in v2 that my verification
contradicts — with consequences for how the contract change must be shaped;
and adds guardrails and tests at the seams where the new protocol touches
contracts that production clients depend on.

## Concessions

### `userMsgId` is not a request-correlation key — Sol is right

My round-one recommendation ("reuse `userMsgId`, add `requestId` only where no
natural key exists") was built on the observation that response frames carry
`userMsgId`. Sol's correction is decisive: `AIChatRequest` does not contain
it, the server mints it in `handleAIChat` after persistence, and the
`"no-msg-id-yet"` sentinel exists precisely because there is a window in which
the client has sent a request that has no identity at all. A key that does not
exist at send time cannot correlate a send. The three-identity model and the
`ai_chat_request_ack` design are accepted without reservation.

Two riders on the ack, both additive to Sol's design rather than corrections:

1. **Retire the sentinel explicitly.** Once `ai_chat_request_ack` exists,
   `"no-msg-id-yet"` is dead contract. Its removal (or at minimum a
   deprecation comment pointing at the ack) should be a named 2A task, not
   left to be discovered — sentinels that survive their replacement become
   the next reviewer's P2.
2. **The ack correctly omits `title` — keep it that way.** Title generation
   runs after persistence, in the response pipeline. The first
   `ai_chat_chunk` carrying the real `conversationId` **and** `title` is a
   deliberate, hard-won contract that the web client's new-chat rekey
   machinery depends on (deterministic rekey, no fallback — this exact shape
   took real effort to stabilize against the Next router). The ack gives the
   CLI an earlier, cleaner rekey point for the *ID*; the *title* remains a
   first-chunk/response concern. Do not attempt to consolidate title into the
   ack, and — more important — do not treat the ack as a migration of the
   web's first-chunk rekey. Both channels carry the ID; the web keeps its
   contract untouched; the CLI keys on the ack. Coexistence, not succession.

### "Purely additive" was imprecise — conceded, now with the exact shape

Sol's v2 correctly notes that additive-at-the-wire is not additive-at-the-
compiler when `EventTypeMap` feeds exhaustive dispatchers. Verified:
`apps/web/src/utils/chat-ws-client.ts:137` types its dispatcher as
`Record<EventType, () => void>`, so **any new event type fails compilation in
every client with that dispatcher shape** — `apps/web`, `apps/web-next`, and
the CLI's copied dispatcher until 2B replaces it. The cost is one no-op entry
per client per new event: mechanical, but real, and it touches production
`apps/web`. The plan should budget for those one-liners explicitly so they
are reviewed as no-ops rather than smuggled in with behavior.

## Correction to v2: the hydration events have production consumers

Sol's v2 states: *"current source search shows the list and hydrate events are
consumed by the CLI/server path."* My verification contradicts this:

```text
apps/web/src/context/convo-hydration-context.tsx:69   consumes hydrate_conversation_ack
apps/web/src/context/convo-hydration-context.tsx:137  sends    hydrate_conversation
apps/web-next/src/context/convo-hydration-context.tsx (same, cloned)
apps/web/src/state/chat/store.ts                      (registry ingestion)
```

Both web apps send `hydrate_conversation` and consume
`hydrate_conversation_ack` through a dedicated hydration context —
`apps/web` being the production surface this repository treats as
do-not-touch, and `apps/web-next` carrying the in-flight load-older paging
work on the same events. This changes the contract-change calculus in one
specific way:

**The direct change is still right, but it must be additive in the strong
sense.** Sol's v2 licenses "replacing its acknowledgement" and adding required
fields on the grounds that no active consumer needs compatibility. That
license is void — there are two active consumers, one of them production.
Concretely:

- Do **not** add a required `requestId`/`operationId` to
  `hydrate_conversation`, and do **not** repurpose or remove
  `hydrate_conversation_ack`. Either breaks prod web at compile time and the
  hydration context at runtime.
- Do add `operationId` as **optional** on the request (server echoes it when
  present) and introduce the correlated result/error as a **new** event type
  the CLI consumes. The web apps' only cost is the one-line no-op dispatcher
  entry from the section above; their hydration flow is untouched.
- The same audit applies to `conversation_list` and its per-page
  acknowledgements before any field is made required there — the store
  ingestion path in both web apps warms from those frames.

This lands back at my round-one position, but now as a verified constraint
rather than an assumption — and with Sol's compile-time caveat correctly
priced in. The general rule worth writing into the plan: **before changing any
existing `EventTypeMap` member, grep all four surfaces (web, web-next, cli,
ws-server) for consumers; new members are cheap, mutations are not.**

## On the original-plan corrections table

Sol's table is fair, and reading `fable-5-plan.md` in full I co-sign it — with
one softening and one sharpening, both mine to own since I authored the plan.

**Softening: the replay claim was an implementation gap, not a plan error.**
The plan's §2 and Phase 4 explicitly required the renderer to "tolerate a
replay-from-zero (clear current draft, re-render)" — the scaffold shipped
without it. Sol's verdict "Incorrect: reconnect gives crash-proof resume for
free" is right about the *"for free"* framing (that was overstated, and Sol's
reconnect/retry/replay trichotomy is the correct decomposition), but the plan
did name the obligation. The lesson for phase two is about exit criteria, not
premises: a phase is not done when the happy path demos.

**Sharpening: the cookie-handshake decision is functional, not cosmetic.**
Sol's v2 frames the auth/config drift as "choose one and document it." The
plan (§2) is explicit about *why* the cookie header exists: the handshake
metadata populates `stashUserData` so `user_location` feeds web_search across
providers, exactly as the browser does. An unimplemented cookie path means CLI
sessions run web_search with anonymous-default geo — a real, quiet quality
regression relative to the web client, felt in every "what's happening near
me / current local X" query. Given the `ws` dependency exists specifically for
this (the plan's stated reason), and the single-operator scope makes the
values constants, my recommendation is: **implement the `ws` header path in
2B rather than deleting the claim.** Deleting is only the right call if the
geo defaults are acceptable, and that should be decided consciously by the
operator, not defaulted into by drift.

## Smaller refinements to v2

**Transport `subscribe()` — accepted; make the invariant mechanical.** The
push interface resolves my async-iterator warning by construction. One
tightening: enforce single-active-subscriber in code (throw on a second
`subscribe` while one is active) rather than by documentation. The failure
mode I flagged in round one doesn't disappear because the contract permits one
subscriber; it disappears when a second subscriber cannot silently attach.
Backpressure is a non-concern at CLI scale — no need to reintroduce the
iterable for it.

**The 2A server audit already has a committed first installment.** Sol's v2
cites the Anthropic silent-exit path at `anthropic/index.ts:319`/`:1209` —
note for the record that as of commit `2ff7254` (same day) every chat-path
tool-round cap fleet-wide is raised to 100 as a backstop-not-budget, which
makes the silent exhaustion practically unreachable but **does not fix it**.
The sakana-style forced-terminal fallback for the Anthropic loop is the open
item, and 2A's "server-side forced terminal errors after every bounded
provider loop" is where it should land. The audit should also sweep the other
providers' loops for exhaustion paths that break without a terminal frame —
the sakana/gemini/kimi-family loops have `forcedLoopStopReason` machinery;
verify each actually emits a terminal event on every break path, not just the
MAX_ROUNDS one.

**Startup warmup identity: the design is in v2, the test is not.** V2
specifies that the unsolicited index warmup needs its own server-generated
sync identity so it cannot settle a manual `/convos`. The Required Phase-2
Tests list covers stale listing numbers but not this case. Add: *startup
warmup pages arriving during and after a manual `/convos` neither settle the
manual operation nor mutate its frozen snapshot.*

**Two more tests for the list:**

- *Disconnect while `ATTACHING`* — the pending attach must settle exactly once
  (as interrupted/failed), the previous active conversation must remain
  active, and a hydration result arriving after reconnect for the dead
  `operationId` must be rejected. V2's disconnect tests cover turns; attach
  is a distinct operation with a distinct pending state and deserves its own.
- *`ai_chat_request_ack` REJECTED renders its typed `message`* — v2's P2 notes
  error frames are currently dumped as raw JSON; the new rejection path
  should be born with a rendering test so the first user-visible instance of
  the new protocol isn't a JSON blob.

## Final position

Adopt sol-findings-v2 as the phase-two plan of record, amended by:

1. the strong-additive constraint on `hydrate_conversation` /
   `conversation_list` (production web consumes them — verified; optional
   `operationId` + new result events; no required-field mutations; budget the
   no-op dispatcher entries for the exhaustive `Record<EventType, …>` sites);
2. ack/first-chunk **coexistence** — the CLI rekeys on the ack, the web's
   first-chunk id+title rekey contract is untouched, and title stays out of
   the ack;
3. explicit retirement of the `"no-msg-id-yet"` sentinel as a named 2A task;
4. implement the `ws` cookie handshake in 2B (functional geo consequence for
   web_search) unless the operator consciously accepts default geo;
5. mechanical single-subscriber enforcement on `CliTransport.subscribe`;
6. the three added tests (warmup-vs-manual listing identity, disconnect while
   attaching, REJECTED-ack rendering), and completing the provider-loop
   terminal audit whose first installment shipped as the fleet cap raise.

Phase 2.0 (readable resume) remains the next implementation, unchanged from
v2. Nothing in this round moves it.

# Sovereign CLI Phase-Two Convergence Decision

**Author:** Sol  
**Reviewed:** 2026-07-11  
**Inputs:** [`sol-findings-v2.md`](./sol-findings-v2.md),
[`fable-findings-v2.md`](./fable-findings-v2.md), the original plan, and fresh
source verification across `apps/web`, `apps/web-next`, `packages/cli`,
`packages/types`, and `apps/ws-server`.

## Verdict

The plan is buttoned up enough to proceed. Another architecture-review cycle
is unlikely to change the delivery order or the core contracts.

Adopt `sol-findings-v2.md` as the plan of record with the amendments in
Fable's round-two review and the implementation clarifications below. Phase
2.0, readable resumed history, remains the next work. Phase 2A follows inside
the current layered class structure. No broad transport/application rewrite is
a prerequisite for either.

Fable's principal correction is valid and material: production `apps/web` and
`apps/web-next` actively send `hydrate_conversation` and consume
`hydrate_conversation_ack`
([`convo-hydration-context.tsx:69`](../../apps/web/src/context/convo-hydration-context.tsx#L69),
[`convo-hydration-context.tsx:137`](../../apps/web/src/context/convo-hydration-context.tsx#L137)).
My v2 statement that hydration was only a CLI/server path was wrong. Existing
hydration members and their runtime behavior must remain compatible.

## Final Disposition of Fable's Amendments

### 1. Strong-additive protocol evolution: accepted

Do not replace `hydrate_conversation_ack`, remove an existing event, or add a
new required field to an existing request. The same conservative rule applies
to conversation-list events.

Use this compatibility shape:

- add optional `operationId` to the existing request members;
- preserve the existing request/ack behavior when `operationId` is absent;
- add new, correlated result events for requests carrying `operationId`;
- leave the web hydration contexts unchanged;
- add explicit cases for the new event members to every exhaustive dispatcher
  in web, web-next, and the CLI;
- require each consumer to declare whether it handles or intentionally ignores
  every registered event type.

The exhaustive-dispatcher constraint is verified at
[`chat-ws-client.ts:137`](../../apps/web/src/utils/chat-ws-client.ts#L137).
This is intentional contract enforcement, not undesirable compiler churn.
`packages/types/src/events.ts` is the absolute authority for the event surface;
every consumer must be aware of every event registered there even when that
consumer has no behavior for it.

The runtime discriminant registry should also originate in
`packages/types/src/events.ts` rather than remain copied string arrays in each
client. Export one exhaustive runtime record validated against
`Record<AnyEventTypeUnion, true>`, then derive its keys for parsing. Each
consumer should maintain an exhaustive disposition map such as
`Record<AnyEventTypeUnion, "HANDLE" | "IGNORE">`. A newly registered event then
forces every consumer to make a visible decision.

Handled events still require field-level runtime narrowing and reconstruction.
Ignored events need only a recognized canonical discriminant and an explicit
`"IGNORE"` disposition; they must not be asserted into a handled payload type.

Recommended correlated hydration result:

```ts
type HydrateConversationResult =
  | {
      type: "hydrate_conversation_result";
      operationId: string;
      status: "COMPLETE";
      conversationId: string;
      pages: HydrateConversationPage[];
    }
  | {
      type: "hydrate_conversation_result";
      operationId: string;
      status: "FAILED";
      conversationId: string;
      code: "NOT_FOUND" | "FORBIDDEN" | "INTERNAL";
      message: string;
    };
```

Recommended manual-list result:

```ts
type ConversationListResult =
  | {
      type: "conversation_list_result";
      operationId: string;
      status: "PAGE";
      conversations: ConversationListEntry[];
    }
  | {
      type: "conversation_list_result";
      operationId: string;
      status: "COMPLETE";
    }
  | {
      type: "conversation_list_result";
      operationId: string;
      status: "FAILED";
      code: "UNAVAILABLE" | "INTERNAL";
      message: string;
    };
```

The unsolicited startup warmup can continue using the legacy
`conversation_list_ack`; it warms only the ID-keyed registry. A manual
`/convos` operation settles only from its new `conversation_list_result`
frames and freezes its snapshot from those results. This event separation is
sufficient correlation; a server-generated warmup ID is not required unless
warmup itself later gains a completion UI.

### 2. Ack and first-chunk rekey coexistence: accepted

Keep `title` out of `ai_chat_request_ack`. For correlated CLI requests, the ack
maps `operationId` to the persisted `userMsgId` and real `conversationId`. The
CLI can adopt the ID there. Title remains a chunk/response concern.

Do not change the web rekey path. The web registry currently resolves the
pending `"new-chat"` store from the first inbound chat event's real
`conversationId`, migrates the same store instance, and applies the title from
the chunk
([`store-registry.ts:161`](../../apps/web/src/state/chat/store-registry.ts#L161),
[`store.ts:220`](../../apps/web/src/state/chat/store.ts#L220)). The CLI ack is a
parallel client capability, not a migration of that production contract.

### 3. Retire `"no-msg-id-yet"`: accepted with a compatibility boundary

For a correlated CLI request, a pre-persistence failure must produce
`ai_chat_request_ack` with `status: "REJECTED"` and its typed message. It must
not also emit an `ai_chat_error` carrying the sentinel.

Legacy web requests do not yet carry `operationId`, so immediate deletion of
the sentinel from every path would be a separate production contract change.
Phase 2A should:

1. stop emitting it for correlated requests;
2. mark the remaining emission as legacy;
3. add a removal criterion tied to all chat senders adopting the ack;
4. never allow the sentinel into the new CLI state model.

This preserves web behavior while preventing the replacement protocol from
inheriting known-invalid identity.

### 4. Use separate web and CLI handshake protocols: accepted

The original plan's cookie handshake is functional design, not cosmetic
documentation. The server parses connection cookies, persists profile
metadata, and puts that data into the `UserData` later used to construct
provider `user_location`
([`ws-server/index.ts:172`](../../apps/ws-server/src/ws-server/index.ts#L172),
[`chat.ts:147`](../../apps/ws-server/src/resolver/chat.ts#L147)). The CLI already
builds the intended cookie value but never sends it; its client constructs
global `WebSocket` with only a URL
([`config.ts:56`](../../packages/cli/src/config.ts#L56),
[`chat-ws-client.ts:464`](../../packages/cli/src/chat-ws-client.ts#L464)).

One factual nuance: absent cookies currently fall back to Barrington values
that happen to match the CLI's single-operator constants
([`ws-server/index.ts:282`](../../apps/ws-server/src/ws-server/index.ts#L282)).
So current city-level search geo is not observably different for this operator.
It is still hidden coupling: the profile is not refreshed, IP/UA differ, and a
future location or default change silently diverges. Phase 2B should use the
workspace `ws` client with the typed `Cookie` header and test what the server
receives.

The cleaner long-term boundary is two versioned WebSocket handshake families:

```text
slipstream.web.v1
slipstream.cli.v1
```

Negotiate them through `Sec-WebSocket-Protocol` during upgrade. The web
protocol retains browser-compatible cookie/session behavior. The CLI protocol
may use Node `ws` capabilities unavailable to browsers: an explicit `Cookie`,
a future authorization header, client version, and terminal/client metadata.
The server records the negotiated client kind and protocol version per socket
and rejects unsupported versions with a stable close code and reason.

This is a handshake split, not an event-protocol fork. After establishment,
both clients use the same authoritative `EventTypeMap` from
`packages/types/src/events.ts`, and every consumer remains aware of every
registered event type. Provider, conversation, hydration, and tool semantics
must not diverge by client kind. Any client-specific established/capability
event is added strongly-additively to that shared authority.

Migration can treat a connection without an explicit subprotocol as legacy web
temporarily. Tests should cover legacy web, negotiated web v1, negotiated CLI
v1 with metadata headers, and rejection of unsupported protocol versions.

### 5. Enforce one transport subscriber: accepted

The future `CliTransport.subscribe` implementation should throw if a second
subscriber attaches before the first unsubscribes. The invariant belongs in
code, not only interface documentation. Transport-internal logging does not
count as a subscriber.

### 6. Add the missing tests and finish the terminal audit: accepted

Add these to the v2 test list:

- startup warmup frames arriving before, during, and after manual `/convos`
  never settle the manual operation or mutate its frozen snapshot;
- disconnect while `ATTACHING` settles the attach exactly once, preserves the
  previous active conversation, and rejects a late result for the dead
  `operationId` after reconnect;
- `ai_chat_request_ack` with `status: "REJECTED"` renders the typed message,
  not raw JSON;
- legacy web hydration without `operationId` still receives the unchanged
  `hydrate_conversation_ack` shape;
- correlated hydration success/failure uses only the new result path;
- the chat ack omits title, while the existing first chunk still carries and
  applies it for web;
- the canonical runtime event registry is exhaustive against
  `AnyEventTypeUnion`, and every consumer explicitly handles or ignores each
  registered type;
- a second active transport subscriber is rejected deterministically.

Commit `2ff7254` raised all chat tool-round caps to 100, reducing accidental
exhaustion. It did not add terminal fallbacks. The Anthropic loop still ends
after the bounded `for` without a response/error fallback
([`anthropic/index.ts:1209`](../../apps/ws-server/src/anthropic/index.ts#L1209)).
Phase 2A must add that fallback and verify every provider's break/exhaustion
paths emit exactly one terminal event.

## One Narrow Correction to Fable v2

I verified the production hydration consumers. I did not find a web or
web-next state handler that ingests `conversation_list_ack`; outside the CLI
and server, source references are currently the event types and copied
dispatcher cases. The chat store registry routes only chat chunk, response,
and error frames
([`store-registry.ts:131`](../../apps/web/src/state/chat/store-registry.ts#L131)).

This does not license a breaking list change. The event is already part of the
production client contract/allowlist, and the consumer audit rule is correct.
It only narrows the factual record: production hydration is active; production
conversation-list state ingestion was not verified in the current tree.

## Implementation Gate

No unresolved architectural question blocks implementation. Use these gates:

### Phase 2.0: proceed now

First change:

- render the latest eight hydrated messages with full bodies, normal speaker
  headers, and preserved whitespace;
- retain an explicit, generous safety cap for pathological single messages;
- print a visible truncation marker and exact `/expand <ordinal>` recovery;
- add renderer tests for prose, code fences, tables, whitespace, and the cap;
- make no wire-contract or state-machine change in this patch.

The existing server already hydrates more messages than the renderer shows, so
this is a contained client-rendering improvement. `/history more` and cursor
state may follow as a separate change rather than expanding the first patch.

### Phase 2A: proceed after 2.0

Implement the strong-additive results, chat acknowledgement, transactional
attach, frozen numbered snapshots, explicit session states, exactly-once
finalization, sentinel boundary, and provider terminal audit inside the current
class chain. Do not combine this with the copied-dispatcher replacement.

### Phase 2B and beyond: unchanged

Continue with the narrow transport, terminal redraw/cancellation/replay,
versioned web/CLI handshakes, typed command descriptors, one-shot automation,
and eventual local agent runtime in the v2 order.

## Final Decision

Proceed. The review cycle has converged on the product boundary, identity
model, compatibility strategy, sequencing, and test gates. Remaining choices
such as exact error-code names or the initial history display cap are local
implementation decisions that should be settled in code review, not another
architecture round.

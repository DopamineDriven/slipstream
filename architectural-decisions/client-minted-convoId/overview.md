# Client-minted conversation ids (2026-10-04)

**Status: proposal. Nothing here is built.** This records a design discussion so it can be picked up
later without re-deriving it. The current new-chat flow (the router deception) is correct as built and
stays in place until a decision is made.

One code change did land from the same discussion and is noted in §1.3: the tab-title effect in
`apps/web/src/context/ai-chat-context.tsx` now also depends on `pathname`.

---

## 0. The idea in one paragraph

Today the server mints a conversation's id, so the client cannot know the real URL until the first
chunk arrives. Much of what is awkward about starting a chat follows from that: a sentinel id
(`"new-chat"`), a store that is re-keyed mid-stream, a URL swapped behind the router's back, and a
real route change after the first response finishes. If the client mints the id before it sends, the
URL is truthful from the first frame and the router half of that machine has no reason to exist.

It is not free. `"new-chat"` is the cross-repo word for a new conversation, and dictation, the asset
pipeline and the attachment registry all read it. §3 is about that ripple: the sentinel does two
jobs, the proposal removes only one of them, and the other has to keep working. On the server the
cost is accepting a client-chosen primary key safely and knowing whether a request means "create" or
"append".

---

## 1. Today

### 1.1 The flow

A new chat passes through three URL states, all served by the one dynamic route
`app/(chat)/chat/[conversationId]`:

```
/                      param "home"       the hero
/chat/new-chat         param "new-chat"   real navigation, at first prompt or attachment
/chat/<realId>         param <realId>     shallow at the first chunk, real at completion
```

1. The client navigates to `/chat/new-chat`. Three call sites do this: `chat-input/index.tsx` (the
   auto-submit `router.replace` and the post-attachment `router.push`) and `dynamic/index.tsx` (the
   prompt-click `router.push`). The prompt and the attachment batch id cross that navigation through
   `sessionStorage` (`chat.initialPrompt`, `chat.initialAttachmentsBatchId`).
2. The request goes out with `conversationId: "new-chat"`. The server persists, minting the id from
   the schema default (`@default(cuid(2))`).
3. The first `ai_chat_chunk` carries the real id and the title. `ChatStoreRegistry.resolveStore`
   finds no store under that id, sees a parked `"new-chat"` store awaiting one, and runs
   `rekeyBegin`: the same store instance moves to the real key, `history.replaceState` rewrites the
   URL without telling Next's router, and `urlTransitionInFlight` goes true. The façade's
   `decoupled` handler re-points the active id.
4. On `ai_chat_response` (done) or `ai_chat_error`, `recoupleIfInFlight` clears the flag and the
   façade's `recoupled` handler runs the mandatory `router.replace("/chat/<realId>")`.

### 1.2 Why it is built this way

Telling the router mid-stream would change the route's params, which re-suspends the page and
remounts the streaming surface. So the URL leads and the router is reconciled only when the stream
is over. See memory `project_newchat_router_deception`; that reasoning still holds under a
server-minted id.

### 1.3 What it costs

- **A visible re-render after the first response.** The final `router.replace` is a real param
  change on `[conversationId]`. The page resolves its params with `use(params)`, which suspends into
  `loading.tsx`, the full-area branded loader. The user sees it right after the answer completes.
- **The tab title was clobbered at that same moment.** `chat/layout.tsx` exports a static
  `title: "Chat Home"`. When the router finally commits the real route, Next re-renders that
  `<title>` over the imperative `document.title` the façade set at the first chunk, and the effect
  had no reason to run again because the title itself had not changed. Fixed 2026-10-04 by adding
  `pathname` to that effect's dependencies. Existing conversations were never affected, because
  there the route commits first and the title arrives after.
- **A bail in the path-sync that can pin the façade to the wrong store.** The façade follows the
  route only when its current store is idle:
  `if (status.isStreaming || status.urlTransitionInFlight) return;`. The `urlTransitionInFlight`
  half exists only for the deception. Meanwhile the chat surface renders the façade's store but
  hydrates it from the *route's* conversation id. If the façade is pinned to conversation B while
  the route says A, A's cached pages are poured into B's store and the screen shows that store.
  This was found while investigating a stale-view report on 2026-10-04 (which turned out to be a
  second tab, not this path); the hazard is real regardless.
- **A sentinel threaded through many subsystems.** See §3 and the inventory in the appendix.

---

## 2. The proposal

The client mints a cuid2 before the request and navigates to `/chat/<id>` at the moment it navigates
to `/chat/new-chat` today.

```
/                      param "home"       the hero
/chat/<mintedId>       param <mintedId>   real navigation, at first prompt or attachment
                                          nothing changes after this
```

What disappears on the client:

- the parked `"new-chat"` store, `isAwaitingRealId`, and the `awaiting-id` phase
- `rekeyBegin`, `recoupleIfInFlight`, `urlTransitionInFlight`
- the façade's `decoupled` / `recoupled` handler and its `router.replace`
- the `urlTransitionInFlight` half of the path-sync bail
- the post-response loader flash and the title clobber, since no route change follows the stream

What stays:

- the three navigation sites, which now carry the minted id instead of the sentinel
- the `sessionStorage` handoff of prompt and batch id across that navigation
- the first-chunk contract: it still carries the id and the title; the id is simply an echo now
- the unbound-to-bound transition for assets and dictations (§3), reduced to a one-way flag

The route change does not vanish, it moves to where it is cheap: before any content exists.

---

## 3. The ripple: the sentinel does two jobs

`"new-chat"` is used across the web app, ws-server, the types package and the CLI. It means two
different things, and today one string serves both because the route provides it.

| job | what it says | who reads it |
|---|---|---|
| **1. No id yet** | this chat has not been given an id | the chat store key, the registry's rekey, the route param, the persist path's create branches |
| **2. Unbound** | this row belongs to no conversation yet | the asset pipeline, dictations and their draft ids, the attachment registry's bucket, the recoverable-dictation query |

The proposal removes job 1. **Job 2 is a real state that still exists**: between the mint and the
first persist there is an id but no conversation row. Anything created in that window, an upload or
a recording, still belongs to no conversation.

### 3.1 What breaks if nothing else changes

Today the side systems do not ask "is this bound?". They derive it from the route:

```ts
// asset-context.tsx, stt-context.tsx
useState(pathConvId ?? "new-chat");
```

Once the route param is a minted id, each of them reports a real-looking id for a conversation with
no row:

- **Assets.** The upload carries that id. `resolver/asset-fetch.ts`, `asset-complete.ts` and
  `prisma/utils.ts` treat anything other than the sentinel as a conversation to connect to, so the
  server tries to bind the attachment to a row that does not exist.
- **Dictations.** `stt-context.tsx` sends `conversationId: key === "new-chat" ? null : key`, so the
  insert would carry the minted id and fail the same way. The draft id would embed the minted id,
  losing its fixed-width birth marker (59 characters for a recording born on a new chat, 75
  otherwise). And the recoverable query is tri-state, `undefined` for all, `null` for new-chat only,
  a string for one conversation: unsent recordings from an abandoned chat would be filed under an id
  nobody will ever visit, where today they resurface on the next new chat.
- **Attachment registry.** Pre-send uploads land under the unbound key on the server, while the
  client's navigation warmer would ask for the minted id's bucket and miss. Opening one item still
  resolves, because the by-id lookup falls through to a global search.
- **The web ORM and `pathname-context.tsx`** both special-case the sentinel as "home or new chat".

### 3.2 The remedy: split the two jobs

Keep `"new-chat"` as the cross-repo word for **unbound**, which is what those systems mean by it
already. Stop using it as a URL and as a store key.

That needs one client-side fact: **has this conversation been persisted yet?** The chat store is
where the id is minted, so it knows: it minted the id and has not yet seen a frame for it. Job 2's
consumers read a derived value instead of the raw route param:

```ts
const boundConversationId = persisted ? conversationId : "new-chat";
```

- Assets, dictations, the registry warmer and draft ids keep sending the sentinel until `persisted`
  flips, then the real id, exactly as they do today across the rekey.
- The flip happens on the first frame for that id, which is the same moment the server has already
  coupled the batch: attachments connected, dictations coupled, registry rows re-keyed with their
  by-id acks.
- **Nothing on the server side of assets, dictations or the registry changes.** They never see a
  minted-but-unpersisted id.

So the two-phase rekey becomes a one-way boolean with no router involvement. That is far simpler,
but it is not nothing: the transition for side systems remains, driven by a flag instead of by a
path change.

Rejected alternative: teach the server that "an id with no row means unbound". That spreads
existence lookups across the asset, dictation and registry handlers, and it strands unsent
recordings on abandoned ids.

---

## 4. Minting the id

`@paralleldrive/cuid2` is already in the catalog (`^3.3.0`) and already a web dependency. The STT
provider (`context/stt-context.tsx`) has the pattern for batch ids: hold the import promise, warm it
on mount, mint behind an await that re-checks. ws-server has the narrower shape in
`GrokResponsesApiLinearService`: `protected cuid2: Promise<() => string>`, since `createId` is all
that is needed.

For the client, the same narrow promise, with two adjustments a browser needs:

```ts
let cuid2: Promise<() => string> | undefined;

export function loadCuid2() {
  cuid2 ??= import("@paralleldrive/cuid2")
    .then(t => t.createId)
    .catch((err: unknown) => {
      cuid2 = undefined;
      throw err;
    });
  return cuid2;
}

// in an event handler:
const id = (await loadCuid2())();
```

- **Lazy, not eager.** A client module is also evaluated on the server during prerender, so the
  import is created on first ask and warmed from an effect (`void loadCuid2()`), not at module
  scope or in a singleton's constructor.
- **Never cache a rejection.** On the server the import cannot fail in practice. In a browser it
  can: a tab left open across a deploy asks for a chunk that is gone, or the network drops. A bare
  `??=` would store the rejected promise forever and "new chat" would be dead until a reload. The
  `.catch` clears the slot so the next call retries, and rethrows so the caller sees the real
  error. `.then().catch()` rather than the two-argument `.then`, so the slot is also cleared if the
  success step ever grows and throws.
- **Mint only in a gesture or an effect, never during render.** Render also runs on the server
  (hydration mismatch) and is double-invoked under StrictMode (two ids, one discarded).

The loader should be shared with the STT provider so the chunk loads once. That is the second user
of the import; hoisting it to a module both call is a small move in `stt-context.tsx`.

Considered and set aside: drawing 24 base36 characters straight from the browser's CSPRNG. It needs
no import and has ample entropy, and the server only validates shape. But the package is already
shipped, it is the same dialect as every other id in the system, and a hand-rolled minter is one
more thing to get subtly wrong.

---

## 5. The wire: a second request event

```ts
export type AIChatRequestNew = DX<
  Rm<AIChatRequest, "type"> & { type: "ai_chat_request_new" }
>;
```

One derived line in `contract/ai-chat-events.ts` plus its entry in the event map. The response
frames are unchanged.

**Why a separate event and not a lookup alone.** A lookup tells the server what the database holds,
not what the client believed. With one event and a client-minted id, "no such conversation" means
either a brand-new chat or a stale tab appending to a conversation deleted elsewhere. Only the
client knows which. If the frame does not say, the server guesses, and the wrong guess silently
resurrects a deleted id as a fresh conversation. With intent stated by the frame, the lookup becomes
a verification and every mismatch is an explicit error:

| frame | row absent | row present, yours | row present, not yours |
|---|---|---|---|
| `ai_chat_request_new` | create | reject: id already used | reject |
| `ai_chat_request` | reject: conversation is gone | append | reject |

**Why not a flag on the existing event.** It would work, but it is an optional field bolted onto a
hot contract, and `conversationId` would carry three meanings at once (sentinel, existing id, new
id). The event type is the better discriminant: the resolver already switches on it and TypeScript
narrows on it.

**Rollout.** `ai_chat_request` is untouched, sentinel included, so the CLI and any old client keep
working. The web moves its new-chat sends to the new frame when ready. The sentinel lane can be
retired later or never.

---

## 6. The server

### 6.1 Setting the id

`Conversation.id` is `String @id @default(cuid(2))`. The default only fills an omitted id, so
passing one is enough. No schema change, no migration.

```ts
const convo = await this.prismaClient.conversation.create({
  data: { id, userId, userKeyId: keyId, conversationSettings: { create } }
});
```

With `id` undefined Prisma treats it as omitted and mints as today, so the sentinel lane behaves
exactly as it does now.

### 6.2 Where it lands in `prisma/chat-request.ts`

`handleAiChatRequest` has 16 branches, 8 of them creates:

| block | branches | creates |
|---|---|---|
| audio gen | 4 | 2 |
| image-gen-capable provider | 8 | 4 |
| fallthrough, no asset gen | 4 | 2 |

The 8 create branches land in 6 create methods (the two "sans asset gen" methods are each reached
from two blocks), each with exactly one `conversation.create`. Nothing else in ws-server creates
conversations. So the surface is 3 predicates that test the sentinel today, 8 call sites, and 6
methods plus their props types.

It stays mechanical if the decision is made once at the top, before any branching:

```ts
const sentinel = this.isNewChat(conversationId);
const existing = sentinel
  ? null
  : await this.prismaClient.conversation.findUnique({
      where: { id: conversationId },
      select: { userId: true }
    });
if (existing && existing.userId !== userId) {
  /* reject */
}
const isCreate = sentinel || existing === null; // verified against the frame's lane, §5
const id = sentinel ? undefined : conversationId;
```

The three predicates read `isCreate`, the eight create calls pass `id`, the six methods spread it
into `data`. The eight update branches are untouched, and no request takes a different branch than
it does today. Only the source of the id changes.

`resolver/chat.ts` also derives `isNewChat` from the incoming id (`startsWith("new-chat")`) to drive
the registry rekey and its acks. Under the new frame that comes from the lane.

### 6.3 Rules

- **Validate the shape first.** The id is client input headed for a primary key. ws-server already
  depends on the package, so `isCuid` covers it. This also keeps the fixed-width assumptions in
  draft ids and the CDN url parsers true.
- **Check, then act.** Never an upsert, never a create wrapped in a catch that falls back to a
  find.
- **Two sends racing on one new id.** Both pass the lookup and the second create fails on the
  primary key. That is the right outcome: the constraint is the guard, the lookup is control flow.
  The store already blocks a second send while one is in flight.
- **No early row.** Creating the conversation at "new chat" time would litter the table with
  conversations nobody sent a message to.
- **The id existing on the client does not mean rows can reference it.** This is §3 from the
  server's side: attachments and dictations created before the first send cannot carry that id in a
  foreign-key column. They stay unbound and are connected by batch at first send.

---

## 7. Title generation moves ahead of persist

### 7.1 Today

In `resolver/chat.ts`, persist runs first. Then, when the persisted conversation has no title,
`titleGenUtil` is awaited before the provider is dispatched. The title is not written there. It
rides the stream (`title ?? "New Chat"`) and is saved at the very end inside
`handleAiChatResponse`. So the row is untitled for the whole first response, and if the stream dies
it stays untitled until the next message, when `!res.title` triggers title gen again.

`titleGenUtil` reads the persisted first message from the persist result: its text and its first
attachment (an image or a PDF, by compat or CDN url). It makes up to two sequential model calls,
with no deadline.

### 7.2 Proposed

Title gen runs only in the `ai_chat_request_new` handler, before persist, and the title goes into
`conversation.create` with the id.

- The row is never untitled.
- The title write leaves the end-of-stream transaction.
- The `!res.title` branch leaves the shared handler; the append lane has no title logic.
- The helper's signature narrows to the prompt and the first attachment. Its generic over the
  request event name, and its typing off the persist result, both go.
- No latency cost: title gen is already awaited before dispatch.

What it needs: the first attachment before any message exists. The rows are already there and are
found by batch id, which the create path looks up anyway. That lookup moves ahead of the title step.

### 7.3 Two decisions it forces

1. **A provider call now precedes the user's message being saved.** Today nothing external runs
   before persist. The title step therefore gets a wall-clock deadline and is non-fatal: on timeout
   or error, persist proceeds.
2. **What a failed title becomes.** With title gen confined to the new lane, a failure can no
   longer heal itself on the next message. Either the create writes a deterministic fallback (the
   first few words of the prompt) so the title is never null, or the append lane keeps a retry. The
   fallback is what lets the append lane stay free of title logic.

Open: `titleGenUtil` is also typed for `image_gen_request`. No resolver handler references that
event today. Confirm it cannot start a conversation before dropping the generic.

Side benefit: with the id minted by the client and the title known before persist, the server has
everything the sidebar needs before the provider has produced a token.

---

## 8. The client route

The piece to prototype first, because it decides whether sending can be navigation-free.

- **Minimum version.** The three existing navigations go to `/chat/<mintedId>` instead of
  `/chat/new-chat`. One route change, at send or first attachment, none after.
- **Further version.** "New chat" itself navigates to `/chat/<mintedId>` and the hero renders there
  for an empty conversation. Then sending navigates nowhere.

Both need a defined **not-persisted-yet** state, the same fact §3.2 depends on. `/chat/<id>` will be
visited before the row exists, so:

- the history fetch for an unknown id must yield the hero, not an error
- there must be a rule separating "new and unsent" from "deleted or not yours". The store knows it
  minted the id this session; a hard load of an id with no row and no local knowledge is the
  ambiguous case to decide.
- a refresh before the first send lands on the same empty state, which is fine. Uploads and
  recordings made before that refresh are still unbound, so they are found the way they are today.

The sidebar inserts the conversation when the title arrives, as it does today.

---

## 9. What does not change

- the server side of the asset pipeline, dictation coupling and the attachment registry, provided
  the client keeps speaking the sentinel for unbound rows (§3.2)
- the draft id format, which keeps accepting both a real id and the sentinel
- the CLI: it keeps `ai_chat_request` with the sentinel
- chunks, the final response and errors
- the 8 update branches of the persist path

---

## 10. Risks and open questions

- **Any consumer still deriving its conversation from the route param.** This is the main ripple.
  After the change the param is a real-looking id for a conversation that may not exist. Every
  reader of `pathConvId` has to be found and moved to the bound value, or it fails at the server's
  foreign key. The appendix marks which files are which.
- **A client-chosen primary key** is new input surface. Shape validation plus the ownership check
  in §6.2 are the whole defence; both are required, not optional hardening.
- **Intent mismatches become user-visible errors** (§5's table). The client needs a reasonable
  answer to "conversation is gone" on an append, which today cannot be distinguished at all.
- **Two lanes during rollout.** While the sentinel lane lives, the registry's rekey code cannot be
  deleted from the client unless the web stops using it entirely. Deletion follows the web's
  switch, not the server's.
- **Multi-tab.** Two tabs each mint their own id, so they do not clash. A tab remains blind to what
  another tab sent until it reloads; that is unrelated to this proposal and unchanged by it.
- **`image_gen_request`** (§7.3).

---

## 11. If pursued, an order that keeps every step shippable

1. Server: validate + lookup at the top of `handleAiChatRequest`, thread `id` through the 8 create
   call sites and 6 methods. The sentinel lane is unaffected; nothing sends an id yet.
2. Contract + resolver: `ai_chat_request_new`, its handler, the intent-versus-truth table.
3. Title gen ahead of persist in the new handler, with the deadline and the fallback.
4. Client: the `persisted` fact on the chat store and the bound-id value; move the asset, dictation
   and registry consumers onto it. With the sentinel route still in place this changes nothing
   observable, which is what makes it safe to land first.
5. Client: the shared cuid loader, the not-persisted-yet route state, then the three navigations.
6. Client: delete the rekey, the transition flag, the façade handler, and the bail's second half.
7. Later, or never: retire the sentinel lane once the CLI has its own answer.

---

## Appendix: where the sentinel appears today

Occurrences of `new-chat` per source file, tests and fixtures excluded (2026-10-04), marked by which
job from §3 they serve.

**apps/web**

| file | count | job |
|---|---|---|
| `state/chat/store-registry.ts` | 12 | 1 |
| `ui/chat/dynamic/index.tsx` | 9 | 1 (route param, navigation) |
| `context/stt-context.tsx` | 8 | 2 |
| `context/ai-chat-context.tsx` | 5 | 1 |
| `ui/chat/chat-input/index.tsx` | 4 | 1 (navigation) |
| `state/chat/store-types.ts` | 4 | 1 |
| `context/pathname-context.tsx` | 3 | both: derives the id every other context reads |
| `state/chat/store.ts` | 2 | 1 |
| `orm/user-message-service.ts` | 2 | both |
| `context/attachment-registry-context.tsx` | 2 | 2 |
| `context/asset-context.tsx` | 2 | 2 |
| `ui/chat/sidebar/index.tsx` | 1 | 1 |
| `state/attachments/store.ts`, `hooks/use-conversation-attachments.ts` | 1 each | 2 |
| `lib/helpers.ts` | 1 | 2 (draft id format) |
| `hooks/use-hydrate-chat-store.ts` | 1 | 1 |

**apps/ws-server**

| file | count | job |
|---|---|---|
| `prisma/attachment-hydration.ts` | 7 | 2 |
| `resolver/chat.ts` | 4 | both: create detection, then the registry rekey |
| `resolver/asset-complete.ts` | 3 | 2 |
| `resolver/asset-fetch.ts` | 2 | 2 |
| `prisma/chat-request.ts` | 2 | 1 |
| `resolver/utils.ts`, `prisma/utils.ts`, `prisma/attachment.ts` | 1 each | 2 |
| `resolver/attachment-hydration.ts` | 1 | 2 |
| `prisma/stt.ts` | 1 | 2 |
| `models/index.ts` | 1 | 2 (draft id format) |

Job 2 is the majority, and under §3.2 none of it changes. The lines that go are the job 1 ones: the
chat store's parked key, the rekey, and the route param.

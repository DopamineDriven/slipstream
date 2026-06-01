# React Sweet Summer Child: `web-next` Chat Store — Capstone Synthesis

> This document reconciles the four drafts (`claude-plan.md`, `gpt-plan.md`, `grok-plan.md`, and
> Codex's synthesis `codex-react-sweet-summer-child.md`) into one definitive architecture, grounded
> in verified code facts (file paths + line numbers checked against the tree), and locks the decisions
> made in review. `apps/web-next` only. Do not touch `apps/web`, `apps/ws-server`, or `packages/*`
> (read types for contract only).

---

## 0. The boundary (the whole thesis in five lines)

- **Store owns chat state.** One hand-written `useSyncExternalStore`, no third-party state libs, no zod.
- **Context exposes chat ergonomics.** `AIChatContext` survives as a thin store-backed façade, not the owner.
- **SWR loads cold history.** It is a loader that hydrates the store, never the live authority.
- **WebSocket commits live truth.** `ai_chat_response.convo.messages[0]` is the authoritative final message.
- **React renders selected slices.** Components subscribe to narrow selectors; chunks don't re-render the feed.

That boundary is what makes React the "sweet summer child" instead of the load-bearing transcript engine.

---

## 1. How this synthesizes the four drafts

| Source | What it got right → kept | What it got wrong / dropped |
|---|---|---|
| **`claude-plan.md`** (store-core rigor) | The performance invariant (`committedList` ref stability + `MessageBubble` memo); `byId` Map + `messageIds[]` + cached `committedList[]`; the immutable `ChatSnapshot`; registry + `new-chat` rekey relocated out of React; the draft sentinel adapter; field-wise `isEqual` selectors; **store-core-first scope**. | Scoped too narrowly on its own — needs Grok's CSR/SWR end-state attached as the documented target. |
| **`gpt-plan.md`** (façade framing) | "Context becomes a store-backed façade, not the source of truth"; command-oriented store API (`hydrate`/`applyChunk`/`applyResponse`/`applyError`); **merge final image-gen attachments from the server payload, not client recreation**; SWR as cold loader; unit-test the action layer. | Light on the exact perf mechanism and ordering math — supplied by Claude/Codex. |
| **`grok-plan.md`** (CSR end-state) | Slim the RSC route to auth+shell; the full after-state data-flow narrative; "fix SWR/API alignment first"; reuse existing helpers heavily; per-conversation vs single-active question; dev `window.__chatStore` inspection; virtualization benefit. | Treated the route conversion as an early edit — it belongs **last** (smaller failure surface), per the user's "store-core is the cornerstone" directive. |
| **`codex-react-sweet-summer-child.md`** (sequencing) | The staged 6-phase sequence; `take + 1` for `hasMore`; **store owns display ordering** (don't let SWR/route/UI each invent order); the selector discipline; explicit acceptance criteria; the boundary statement. | A couple of code specifics (the SWR ordering-bug trace, the `Date`-vs-string drift, cuid2 non-monotonicity, the closed two-consumer set) are sharpened here with verified line numbers. |

**Net recommendation (unchanged from Codex's, made precise):** Claude's store-core rigor + GPT's
store-backed façade + Grok's CSR/SWR end-state + Codex's staged sequencing — built store-core-first.

---

## 2. Locked decisions (from review)

1. **Scope = store core first.** This document describes the full end-state, but the *first* unit of work
   is the store + registry + selector hooks + WS bridge + send-path + façade rewrite + `convo` commit,
   wired into the **existing** RSC route (still seeded by `initialMessages`). The route/API/SWR work is
   sequenced after the store is proven. The store is the cornerstone everything else sits on.
2. **Keep the `streaming-<convId>` sentinel.** The live draft renders in realtime by being mapped — by one
   pure adapter — into a synthetic `MessageSingleton<true>` with `id = "streaming-"+conversationId` and
   appended to the feed list. `ChatFeed`/`MessageBubble` keep speaking the protocol they already speak.
   The store is "the layer that propagates chunks to React land in realtime," nothing more.
3. **Fully client route is the end-state.** No SSR transcript fetch. These routes are authenticated and
   non-indexed; there is no SEO/first-paint reason to server-render the transcript when the WS server feeds
   it live. The sole tradeoff (no server-rendered `<title>` on cold load) is acceptable — the title is
   already set client-side during streaming. Route conversion is the **last** phase, not the first.
4. **Nuke `ai-chat-context.tsx` down to ergonomic methods.** ~903 lines → ~120-line façade. The machinery
   (state mirrors, ref sync, WS handlers) moves into the store; the public `useAIChatContext()` contract
   is preserved so consumers barely change.

---

## 3. Current-state findings (verified)

Three competing chat state models exist today.

**(a) The route over-fetches.** `apps/web-next/src/app/(chat)/chat/[conversationId]/page.tsx` is
`export const dynamic = "force-dynamic"` and calls
`prismaConversationService.getConversationRouteProps(conversationId)` →
`getMessagesByConversationIdWithAssets` (`orm/user-message-service.ts:289`), which loads **all** messages
ascending with attachments/blocks/ttsJob/imageGenJob and passes them as `initialMessages`. This is the
400–600-message SSR cost.

**(b) The context thrashes.** `apps/web-next/src/context/ai-chat-context.tsx` (903 lines) owns ~20
`useState` + ~14 `useRef` mirrors (each with a sync `useEffect`) and ~300 lines of WS handlers
(`handleChunk`/`handleResponse`/`handleError`, lines 346–663) that **rebuild** the assistant message from
`ai_chat_chunk` and reconcile via `finalizeStreamingMessage`. `sendChat` is lines 697–842; the `metadata`
memo 668–695; dedupe guards (`recentMessagesRef` line 666, `activeUserStreamsRef`) at 710–736; the
`new-chat`→real-id transition (`firstChunkReceivedRef`/`urlUpdatedRef`/`originalConversationIdRef`,
`window.history.replaceState` at line 417, `router.replace` at 554/636) spans 388–643. Every token fires
multiple `setState`s → context value changes → all consumers re-render.

**(c) The component owns a second timeline.** `apps/web-next/src/ui/chat/dynamic/index.tsx` holds
`useState<MessageSingleton<true>[]>(initialMessages ?? [])` (lines 66–68) and mutates it through four
effects: (a) initial-prompt/new-chat send 137–240, (b) optimistic-attachment cdnUrl sync 243–288,
(c) streaming-message splice building `streaming-<id>` 291–375, (d) completion finalize/id-swap 378–453.
The same logical event is represented once in context and again here.

**(d) `ai_chat_response.convo` is ignored.** `packages/types/src/events.ts:103-113` — `AIChatResponse`
carries `convo: ConversationSingleton<true>` documented as "only contains a single message … the most
recent one (the ai model's response)". The handler at `ai-chat-context.tsx:562-643` never reads `evt.convo`.
We rebuild from chunks instead of committing the authoritative payload. **This is the tug-o'-war.**

**(e) The SWR contract is broken AND the merge is mis-ordered.** `hooks/use-conversation-messages.ts`
expects `Page = { convo, nextCursor, hasMore }`, but both routes return a bare `ConversationSingleton<true>`
(`api/users/[userId]/chat/[conversationId]/route.ts` via `getConvoInitial(id,25)`;
`.../messages/[cursorId]/route.ts` via `getMessagesByCursor(id,25,cursorId)`). Neither service method
computes `nextCursor`/`hasMore`. Worse, the hook's `conversation` memo (lines 100–109) is provably
mis-ordered (see §13). The hook exists but is **not wired** anywhere.

**(f) Verified blast-radius facts (grep-confirmed):**
- `useAIChatContext()` has **exactly two** consumers: `ui/chat/dynamic/index.tsx:61` and
  `ui/chat/sidebar/index.tsx:73`. (`pathname-context.tsx:41` only mentions it in a comment.) Closed set.
- `AIChatProvider` mounts once, in `app/(chat)/layout.tsx:28`.
- `MessageBubble` is `export function MessageBubble(` — **not** memoized (`ui/chat/message-bubble/index.tsx:62`).
- The WS client fans out via `client.addListener` (`utils/chat-ws-client.ts:442` `onmessage`→`listeners.forEach`,
  registered at `:508`) which fires for **every** parsed event before the single-handler `.on()` registry —
  the safe multi-listener seam. The client already validates events without zod (the `EVENT_TYPES`
  allowlist in `parseEvent`, `:77-109`), so no zod is needed at the store boundary either.
- `useSession()` (better-auth, `utils/auth-client.ts:26`) yields `user.id` client-side; the `(chat)` layout
  already gates auth server-side and redirects — so a client route is safe.

---

## 4. Architectural principles

- **React is not the transcript authority.** Every *final* message in the feed comes from one of two
  sources: persisted history hydrated by SWR, or `ai_chat_response.convo.messages[0]`. Chunk data is
  provisional display state only.
- **The store is a state machine, not a state bag.** Named, command-oriented transitions only
  (`hydrate`, `beginSend`, `applyChunk`, `applyResponse`, `applyError`, `rekey`, `reset`). **No public
  `setState(partial)`** — that recreates the coupling elsewhere.
- **Context remains as a façade.** `AIChatProvider`/`useAIChatContext` keep their names and shape; they
  *select* from the store and wire dependencies into actions. They do not own canonical state.
- **SWR hydrates cold data only.** Load first page on entry, older pages on demand, no focus/reconnect
  revalidation (it would fight the socket). The UI reads messages from the store, not from SWR.
- **Final response wins over reconstruction.** On `ai_chat_response`, drop the draft and commit the
  persisted server message. Retire `finalizeStreamingMessage` for final assistant messages.
- **The store owns ordering.** Don't let SWR, route props, and UI each invent order. One comparator,
  in the store.

---

## 5. Target data flow

**Existing conversation:** navigate `/chat/<id>` → client shell mounts with `conversationId` + `user` →
context resolves the store for the active id and subscribes via `useSyncExternalStore` →
`useConversationMessages` fetches page 0 → bridge calls `store.hydratePage(page)` → components render
store-selected committed messages → user sends → optimistic user message inserted + `ai_chat_request`
emitted → `ai_chat_chunk` updates only the draft slice → `ai_chat_response` commits
`evt.convo.messages[0]`, drops the draft, marks complete.

**New chat:** `/chat/new-chat` (or home) → store starts empty, `conversationId = "new-chat"` → send inserts
optimistic user message, phase `awaiting-id` → first event carrying a real `conversationId` triggers
`rekey("new-chat", realId)` → URL replaced with `/chat/<realId>` (shallow `replaceState`, **no** server
refetch mid-stream) → final response commits `evt.convo.messages[0]` → sidebar gains the conversation via a
narrow selector.

**Pagination:** feed requests older → SWR loads next page via `nextCursor` → store merges older by id,
preserving existing message object identity (so unchanged rows don't re-render).

---

## 6. Store design

New files under `apps/web-next/src/state/chat/` (application state owner; no `index.ts` barrels, explicit
`.ts` imports):

| File | Role |
|---|---|
| `state/chat/chat-store-types.ts` | `ChatSnapshot`, `ChatDraft`, `ChatStreamPhase`, command param + page types. Types + frozen `EMPTY_*` consts only. |
| `state/chat/chat-store.ts` | Plain TS class. No React. Subscriptions, snapshots, registries, reducer methods. |
| `state/chat/chat-store-registry.ts` | Module singleton keyed by conversationId (mirror `WebSocketManager` in `context/chat-ws-context.tsx:30`). WS routing + `new-chat` rekey + `bindClient`/`unbindClient` + `setRekeyHandler`. |
| `state/chat/chat-message-workup.ts` | Pure helpers: `orderBlocks`, `mergeBlock`, text/thinking extraction, `extractCommittedMessage(evt)`, `messageComparator`. |
| `hooks/use-chat-store-selector.ts` | `useSyncExternalStore` wrapper with selector memoization + `useChatMessages`/`useChatDraft`/`useChatStatus`/`useChatError`. |
| `hooks/use-send-chat.ts` | Builds optimistic user message + `AIChatRequest` from existing contexts; calls store actions + `sendEvent`. Holds dedupe guards. |
| `lib/draft-to-message.ts` | Pure adapter: draft → synthetic `streaming-<convId>` `MessageSingleton<true>` (reuses `toMessageBlocks` + `normalizeImgGenFields`). Display-only. |

### Snapshot (immutable, readonly)

```ts
export type ChatStreamPhase = "idle" | "awaiting-id" | "streaming" | "complete" | "error";

export interface ChatDraft {
  readonly conversationId: string;
  readonly text: string;
  readonly blocks: readonly ChatChunkAndResMsgBlock[];        // ordinal-ordered, dedup by ordinal
  readonly thinkingText: string;
  readonly isThinking: boolean;
  readonly thinkingDuration: number | null;
  readonly provider: Provider;
  readonly model: string;
  readonly imgGenEnabled: boolean;
  readonly imgGenFields: AIChatResponseImgGenFieldsFinal | null;
  readonly userMsgId: string | null;
  readonly aiMsgId: string | null;
  readonly imgGenAttachmentId: string | null;
}

export interface ChatSnapshot {
  readonly conversationId: string;                            // "new-chat" or real id
  readonly title: string | null;
  readonly phase: ChatStreamPhase;
  readonly isStreaming: boolean;
  readonly isComplete: boolean;
  readonly isWaitingForRealId: boolean;
  readonly isNewChat: boolean;
  readonly error: string | null;
  readonly byId: ReadonlyMap<string, MessageSingleton<true>>; // per-entry identity preserved
  readonly messageIds: readonly string[];                     // explicit order
  readonly committedList: readonly MessageSingleton<true>[];  // cached array; ref STABLE mid-stream
  readonly draft: ChatDraft | null;
  readonly currentUserMsgId: string | null;
  readonly currentAiMsgId: string | null;
  readonly currentImgGenAttachmentId: string | null;
  readonly imgGenEnabled: boolean;
  readonly imgGenFields: AIChatResponseImgGenFieldsFinal | null;
  readonly version: number;                                   // monotonic; powers selector memo
}
```

### Private registries (per store)

```ts
private byId = new Map<string, MessageSingleton<true>>();
private messageIds = Array.of<string>();
private committedList = Array.of<MessageSingleton<true>>();
private optimisticToServerId = new Map<string, string>();
```

**Representation rationale:** the Map preserves each message's reference identity across snapshots (only the
changed entry is re-`set` into a cloned Map) — this is what makes `React.memo` on `MessageBubble`
effective. `committedList` is the cached array form, rebuilt **once per commit/hydrate**, and its reference
is pinned across chunks. The critical invariant: `committedList` gets a new reference **only** on
hydrate / optimistic insert / final commit / removal / reset — never on a chunk.

### Public API (command-oriented)

```ts
subscribe(listener: () => void): () => void
getSnapshot(): ChatSnapshot
getServerSnapshot(): ChatSnapshot          // a single frozen module const
hydratePage(page: ConversationMessagesPage): void
prependHistory(params: PrependHistoryParams): void
beginSend(params: BeginSendParams): void
applyChunk(evt: EventTypeMap["ai_chat_chunk"]): void
applyResponse(evt: EventTypeMap["ai_chat_response"]): void
applyError(evt: EventTypeMap["ai_chat_error"]): void
adoptSnapshot(params: AdoptSnapshotParams): void   // used by rekey
clearError(): void
resetStreamingState(): void
```

---

## 7. Reducer semantics

**`hydratePage`** — merge persisted history by id; preserve existing object identity for equivalent/older
rows; sort display order by `createdAt` ascending with stable fallback (§13); do **not** clear an active
draft; do not re-add an optimistic user message if the page already has the real id. Idempotent.

**`beginSend`** — append the optimistic user message; clear prior stream transients; create an empty draft;
`phase = isNewChat ? "awaiting-id" : "streaming"`; `isWaitingForRealId` only for `new-chat`;
`currentUserMsgId` = optimistic id; duplicate-send guard recorded outside React state.

**`applyChunk`** — update **only** draft + status. Merge `messageBlocks` by ordinal; derive `text` from
`TEXT` blocks; derive `thinkingText` from `THINKING`/`ENCRYPTED_THINKING`; preserve legacy `chunk`-only
handling; accumulate image-gen partials without losing prior partials; update `current*MsgId`. If waiting on
`new-chat` and the chunk carries a real conversationId, request a registry rekey. **Critical: after
`applyChunk`, `snapshot.committedList` is the exact same reference as before.** (Port the block/text/thinking
logic verbatim from `ai-chat-context.tsx:346-509`.)

**`applyResponse`** — `const committed = evt.convo.messages.at(0)`; if absent, transition to a typed error
(expected protocol failure, not a throw); reconcile the optimistic user id via `evt.userMsgId`; commit the
persisted AI message by `committed.id`; drop the `streaming-<convId>` representation; clear `draft`; set
final thinking/imgGen fields for *status display only*; update title; `isStreaming = false`,
`isComplete = evt.done`, `isWaitingForRealId = false`. **Do not call `finalizeStreamingMessage`.** This is
the central correction — the final assistant message comes from the backend payload.

**`applyError`** — clear draft; `phase = "error"`; `error = evt.message`; `isStreaming = false`,
`isComplete = true`; **preserve** committed messages + the optimistic user message; follow a real
conversationId if present.

**`rekey("new-chat", realId)`** (registry) — valid only when source is `"new-chat"` and target is a real id;
transplant the source snapshot into the target store (`adoptSnapshot`); rewrite draft/optimistic
conversationId to the real id; update the registry map atomically; delete the `"new-chat"` slot (makes
`rekey` idempotent — later racing events fall through to the migrated store); `window.history.replaceState`
**once**, mid-stream, with no Next server navigation. Optional `router.replace(..., { scroll:false })` runs
only at completion via the `onRekey` seam. Preserve the existing one-active-stream-per-user guard
(`activeUserStreamsRef`) — relocated into `useSendChat`.

---

## 8. Selector strategy

```ts
function useChatStoreSelector<T>(
  store: ChatStore,
  selector: (s: ChatSnapshot) => T,
  isEqual: (a: T, b: T) => boolean = Object.is
): T;
```

Cache `{ version, value }` in a ref; recompute the selector only when `version` changed; when `isEqual`
says the selected value is unchanged, return the **previous reference** so `useSyncExternalStore`'s inner
getter is stable (else React loops). `getServerSnapshot` returns the frozen module constant.

Dedicated hooks: `useChatMessages(store)` → `committedList`; `useChatDraft(store)` → `draft`;
`useChatStatus(store)` → flags/title/current ids (field-wise `isEqual` so it re-renders only on flag flips,
**not** on draft text); `useChatError(store)`. **Do not** expose `useChatSnapshot()` — that recreates
context-style broad invalidation.

**Why this kills the storm:** during streaming, `useChatMessages` short-circuits on the version check and
returns the cached `committedList` → no re-render of the feed. Only the draft path updates per token.

---

## 9. `AIChatContext` façade

Keep `AIChatProvider` + `useAIChatContext` names. The provider owns **dependency wiring only**:
`useChatWebSocketContext()` (`client`, `sendEvent`, `isConnected`), `useModelSelection()`, `useApiKeys()`,
`useAssetUpload()`, `useCookiesCtx()`, path-derived conversationId (keep
`getConversationIdFromPath`/`pathParser`), `useRouter()` for deliberate sync only.

It selects store data and assembles the **existing** `AIChatContextValue` (every field today, mapped:
`streamedText`→`draft?.text ?? ""`, `streamingMessageBlocks`→`draft?.blocks ?? EMPTY_BLOCKS`,
`currentStreamingMessage`→adapter, flags/ids/imgGen from snapshot, `isConnected` from WS context, `sendChat`
from `useSendChat`, `clearError`/`resetStreamingState`→store methods). It **also exposes the active `store`
instance** on the value so `ChatInterface` can call `useChatMessages(store)` without re-discovering the
registry. The provider must **not**: own message arrays, subscribe `client.on("ai_chat_chunk")` and mutate
React state, mirror state into refs, synthesize final messages, or patch ids through effects. Net ~120 lines.

`sidebar/index.tsx` moves to the narrow `useChatStatus(store)` (reads only `activeConversationId` + `title`)
so the virtualized sidebar does not re-render per token — the one consumer change beyond `dynamic`.

---

## 10. WebSocket integration

`ChatWebSocketClient` stays the transport owner (do not move socket creation into the store in this pass).
`ChatStoreRegistry` exposes `bindClient(client)`/`unbindClient(client)`; the façade (or a tiny
`ChatStoreBridge`) calls `bindClient` once inside the authenticated tree. The registry uses
`client.addListener` (the multi-listener fan-out at `chat-ws-client.ts:442/508`) — **not** the single-handler
`client.on(event, handler)`, which would risk replacing other handlers — and routes only `ai_chat_chunk` /
`ai_chat_response` / `ai_chat_error` by `evt.conversationId`. A malformed event must not break the
subscription loop. (Asset/TTS/typing handlers keep using `.on()` as today — untouched.)

Optional, only if `chat-ws-client.ts` is touched for correctness: gate the `console.log`/`console.warn`
noise behind debug logging. Not part of this migration otherwise.

---

## 11. SWR + API contract

### Page type (one shared shape — put it in `types/ui.ts`, neutral home)

```ts
export interface ConversationMessagesPage {
  readonly convo: ConversationSingleton<true>;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
```

### Service + routes

Add `getConversationMessagesPage(conversationId, take?, cursorId?)` to `orm/user-message-service.ts`
(rather than overloading the route-props helpers). Query `createdAt desc` for cursor efficiency, fetch
**`take + 1`** rows: `hasMore = rows.length > take`; page rows = first `take`;
`nextCursor = oldestPageRow.id` when `hasMore` else `null`. Reuse the existing deep `include` +
`bigintToInt` coercion; return `satisfies ConversationMessagesPage`. The `take + 1` probe avoids the
terminal empty-page fetch that a bare `length === take` check causes. Point both routes
(`.../chat/[conversationId]/route.ts`, `.../messages/[cursorId]/route.ts`) at it; keep their auth +
`unauthorized()` ownership checks. After confirming callers, `getConvoInitial`/`getMessagesByCursor` are
subsumed and can be deleted; `getMessagesByConversationIdWithAssets` (the heavy full fetch) becomes unused
once the route is converted — flag for removal, don't leave half-wired.

### Hook → loader + bridge

`use-conversation-messages.ts` becomes a pure loader (expose `data`, `loadMore`, loading flags, errors).
**Delete its `conversation` memo and `appendMessage`/`removeMessage`** (single read model — the store is the
only timeline). Add a bridge `useHydrateChatStoreFromSWR({ store, userId, conversationId })`: returns no SWR
key for `"home"`/`"new-chat"`; keeps `revalidateOnFocus/Reconnect: false`; on each settled page calls
`store.hydratePage(...)`. SWR cache write-back on final commit is unnecessary (the UI reads the store; SWR
never spontaneously refetches the newest message) — skip it.

---

## 12. Route strategy (end-state: fully client)

Target `app/(chat)/chat/[conversationId]/page.tsx`: a thin shell that passes only `conversationId` into a
client chat surface — **no** `getConversationRouteProps`, no transcript fetch. Auth stays in
`(chat)/layout.tsx` (already `getSession()` + redirect). `user.id` comes from `useSession()` client-side.
The decided end-state is **fully client** (no server `<title>`); during the staged rollout an interim thin
server shell that keeps only a cheap title `generateMetadata` is acceptable, but the destination is no
server work on this route. The skeleton (`ChatAreaSkeleton`) moves inside the client surface, driven by SWR
`isLoading`. This is the **last** phase — store correctness is proven under the existing route first.

---

## 13. `ChatInterface` migration + ordering

`ui/chat/dynamic/index.tsx` stops owning canonical `messages`. Delete the local `useState` (66–68) and all
four reconciliation effects (a/b/c/d). New shape:

```ts
const { store, sendChat, isConnected, ...status } = useAIChatContext();
const messages = useChatMessages(store);
const draft = useChatDraft(store);
const feedMessages = useMemo(
  () => appendDraft(messages, draft, adapterCtx),   // draft → streaming-<id> MessageSingleton, appended
  [messages, draft, adapterCtx]
);
```

Keep UI-local state only: `queuedPrompt`, initial-prompt-consumed flag, sessionStorage restore for
home→new-chat handoff, the `processedRef` gate. `handleUserMessage` builds the optimistic message via
`useSendChat` and calls `sendChat(payload)` — never `setMessages`. The optimistic-attachment cdnUrl sync
(old effect b) relocates into the store as a write-through `reconcileAttachmentUrls(batchId, uploads)`
driven by one state-layer effect — out of the render component.

**The ordering bug (must fix in the store, not the hook).** DB pages are `createdAt desc` (page 0 = newest
25). The current `use-conversation-messages.ts` memo (100–109) iterates pages last→first and pushes each
page's messages **without reversing intra-page**, so page 1 (`[m26..m50]` desc) then page 0 (`[m1..m25]`
desc) yields `[m26..m50, m1..m25]` — intra-page descending and the two blocks mis-joined (`m50` adjacent to
`m1`). That is not an ascending timeline. The store discards positional logic entirely and sorts by a
canonical comparator:

```ts
function messageComparator(a: MessageSingleton<true>, b: MessageSingleton<true>) {
  const ta = new Date(a.createdAt).getTime();   // Date in TS, ISO string post-JSON — normalize both
  const tb = new Date(b.createdAt).getTime();
  if (ta !== tb) return ta - tb;                // primary: createdAt ascending
  const sa = a.senderType === "USER" ? 0 : 1;   // tiebreak: user before AI within a turn
  const sb = b.senderType === "USER" ? 0 : 1;
  if (sa !== sb) return sa - sb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // final deterministic tiebreak
}
```

Two verified reasons this is mandatory: `Message.id` is **cuid2** (`@default(cuid(2))`) — not
time-ordered, cannot be the sort key; and `NextResponse.json` serializes `createdAt: Date` → ISO **string**,
so the comparator must `new Date(x).getTime()` both sides. Merge precedence: existing local
(optimistic/streaming/committed) rows win over a re-fetched history row for the same id; `applyResponse`
(WS authoritative) overwrites unconditionally and drops the `streaming-` placeholder.

---

## 14. Rendering performance plan

The store alone is insufficient if the feed re-renders every row. Required invariants: chunk updates change
neither committed message identities nor the `committedList` reference; only the draft selector changes per
chunk; the final response changes the committed list once.

Component changes: **wrap `MessageBubble` in `React.memo`** (it is currently a plain function export,
`message-bubble/index.tsx:62`). Pass `live*` props as `undefined` for non-streaming messages so memo'd
committed bubbles see stable props and skip re-render while only the `streaming-<id>` bubble re-renders per
token. A stronger later step (optional) splits `CommittedMessageList` from `StreamingDraftBubble`, but the
sentinel-in-list approach the user chose + `memo` + stable identity is sufficient. Remove the noisy
imgGen-field `console.log` effects in `chat-feed/index.tsx:61-69` and `message-bubble/index.tsx:73-81` —
they spam during chunk-perf testing. `ChatFeed`'s auto-scroll keys on `messages.length`/`streamedText`/
`thinkingText`/`isAwaitingFirstChunk` (127–143) — verify `streamedText` (= `draft.text`) keeps changing per
chunk so scroll-on-stream survives; derive `isAwaitingFirstChunk = status.isStreaming && draft == null`.

---

## 15. Image generation & thinking

During chunks the draft accumulates `imgGenFields`; partial images are draft-only display state; thinking
derives from blocks (legacy thinking fields still supported). On final response, committed attachments and
final image-gen output come from `evt.convo.messages[0].attachments` — **not** from remapping partial draft
fields. `draft-to-message.ts` still converts draft imgGen fields into temporary attachments for progressive
rendering via `normalizeImgGenFields`, but that adapter is display-only. The old `finalizeStreamingMessage`
imgGen-attachment-id rewrite is obsolete (the server message carries real ids).

---

## 16. Error handling & type discipline

Represent protocol failures as typed state transitions, never thrown exceptions: missing
`evt.convo.messages[0]`, conversationId mismatch, chunk for an unknown conversation, duplicate active stream.
A bad event must not break the subscription loop. `error` surfaces through the façade as today.

Strict `CLAUDE.md`: no `any` (use `unknown` + narrow); no bare `as` (prefer `satisfies`, `as const` for
literals, `satisfies X as X` only in overload impls); **no `.filter(Boolean)`** (explicit `is` predicates);
`Array.of<T>()` for empty typed arrays; explicit `.ts` path imports, no barrels; `import type`;
`void`-prefix fire-and-forget; let TS infer; use the repo's `res.json<T>()`/`JSON.parse<T>()` augmentations.

---

## 17. Implementation sequence (store-core first)

1. **Store core, no route change.** `chat-store-types.ts`, `chat-message-workup.ts`, `chat-store.ts`,
   `chat-store-registry.ts`, `use-chat-store-selector.ts`. Implement subscribe/snapshot, `hydrateMessages`,
   `beginSend`, `applyChunk`, `applyResponse`, `applyError`, `resetStreamingState`. Bind WS events via
   `addListener`. Provable against mocked chunk/response/error events with no React.
2. **Store-backed `AIChatContext`.** Rewrite `AIChatProvider` as façade; move send assembly into
   `use-send-chat.ts`; remove WS handlers from the provider; preserve the public shape.
3. **`ChatInterface` reads from store.** Remove local `messages` + four effects; use
   `useChatMessages`/`useChatDraft`/`appendDraft`/`sendChat`; `React.memo` on `MessageBubble`; seed from the
   existing `initialMessages` temporarily. Swap `sidebar` to `useChatStatus`. **← end of the cornerstone unit.**
4. **API page-shape fix + SWR hydration.** `getConversationMessagesPage` (`take + 1`); point both routes at
   it; convert the hook to a loader + add the hydration bridge; verify pagination/ordering.
5. **Client-shell route.** Remove `getConversationRouteProps`; pass only route params + session; SWR hydrates
   after mount; simplify metadata toward the fully-client end-state.
6. **Cleanup.** Delete `createAIMessage`/`finalizeStreamingMessage` (and `createUserMessage` only if unused —
   it is reused by `useSendChat`, so it survives); remove dead `getMessagesByConversationIdWithAssets`/
   `getConversationRouteProps`/`initialMessages`; remove debug logs and stale comments.

---

## 18. File-level change list

**Create:** `state/chat/chat-store-types.ts`, `state/chat/chat-store.ts`, `state/chat/chat-store-registry.ts`,
`state/chat/chat-message-workup.ts`, `hooks/use-chat-store-selector.ts`, `hooks/use-send-chat.ts`,
`lib/draft-to-message.ts`, `hooks/use-hydrate-chat-store-from-swr.ts` (phase 4).

**Modify:** `context/ai-chat-context.tsx` (→ façade), `context/chat-ws-context.tsx` (bind timing, minor),
`hooks/use-conversation-messages.ts` (→ loader), `ui/chat/dynamic/index.tsx`, `ui/chat/message-bubble/index.tsx`
(memo + drop log), `ui/chat/chat-feed/index.tsx` (drop log; props sourcing), `ui/chat/sidebar/index.tsx`
(narrow selector), `app/(chat)/chat/[conversationId]/page.tsx` (phase 5), the two API routes (phase 4),
`orm/user-message-service.ts` (phase 4), `types/ui.ts` (Page type + slim `ChatInterfaceProps`),
`lib/ui-message-helpers.ts` (delete `createAIMessage`/`finalizeStreamingMessage`).

**Do not modify:** `apps/web`, `apps/ws-server`, `packages/*` (read types only), package manifests/deps.

---

## 19. Acceptance criteria

**Functional:** existing convo opens without server-fetching the full transcript; SWR loads page 0; cursor
pagination loads older pages in stable order; send shows optimistic user → streaming draft → final committed
AI message; `new-chat` preserves optimistic/draft through the real-id transition; `evt.convo.messages[0]` is
the only source of the final AI message; no duplicate user/AI messages; image-gen partials render live and
finals render from committed attachments; thinking renders live and final; errors stop streaming without
destroying persisted history.

**Performance:** chunk updates do not rebuild committed arrays; committed rows do not re-render per token
after `MessageBubble` memo; 400–600+ message convos stay responsive while streaming; sidebar does not
re-render per token. (Measure with React DevTools Profiler — only the draft path updates per chunk; the
final response causes exactly one committed-list update.)

**Type/quality:** no `any`, no `.filter(Boolean)`, no bare return assertions, no new deps, no exceptions for
normal control flow, no new broad context state competing with the store.

---

## 20. Verification plan

```bash
pnpm --filter=@slipstream/web-next typecheck   # tsgo — per repo convention, not npx tsc
pnpm --filter=@slipstream/web-next lint
pnpm --filter=@slipstream/web-next build
```

Manual: open a long existing convo (verify page-0 hydration + stable older-page loads); send text in an
existing convo; send from `/chat/new-chat` (verify URL/state transition); send with attachments; send with
image-gen (partials → final from committed attachments); use a reasoning model (thinking blocks); simulate
`ai_chat_error`; disconnect/reconnect the socket then send. Instrument with a dev-only
`window.__chatStoreSnapshot` and the Profiler; confirm only the draft path updates per chunk and the final
response causes one committed-list update.

---

## 21. Risks & mitigations

- **Selector returns fresh objects → update loop.** Cache selected values; return the previous reference
  when equal; keep `getServerSnapshot` a stable module constant.
- **`new-chat` rekey causes a route refresh that wipes in-flight state.** Registry rekey + shallow
  `replaceState` mid-stream; defer `router.replace` to completion. `rekey` idempotent via `"new-chat"` slot
  deletion.
- **SWR page order conflicts with store order.** Normalize order only in the store (`messageComparator`);
  the API/hook may fetch descending for efficiency.
- **Optimistic vs server user id duplication.** `optimisticToServerId` registry; replace key/position
  deliberately when the server id arrives; never render both.
- **Image-gen finalization regresses.** Keep the draft adapter for progressive display; assert final display
  comes from committed server attachments.
- **Route conversion obscures store bugs.** Land the store under the current route seed first; remove the
  route transcript fetch only after store correctness is proven. (This is the locked sequencing.)

---

## 22. Final recommendation

Build the store core first — it is the cornerstone. Keep `AIChatContext` as a store-backed façade so the two
existing consumers barely change. Make SWR a cold-history loader that hydrates the store, and the WebSocket's
`ai_chat_response.convo.messages[0]` the authoritative final message. Render selected slices so chunks never
touch the committed feed. Then, and only then, convert the route to fully client.

- **Store owns chat state.**
- **Context exposes chat ergonomics.**
- **SWR loads cold history.**
- **WebSocket commits live truth.**
- **React renders selected slices.**

That is the boundary that makes React the sweet summer child — a renderer and subscriber sitting on top of a
WS-fed external store, not the load-bearing transcript engine it is today.

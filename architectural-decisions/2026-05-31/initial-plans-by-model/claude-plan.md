# Plan: `useSyncExternalStore` Chat Store — the cornerstone (store core)

## Context

`apps/web-next` is the deliberate rebuild of the chat frontend where React stops being load-bearing
("a sweet summer child") and the WebSocket server is the source of truth. Today three things fight:

1. **`apps/web-next/src/context/ai-chat-context.tsx`** (903 lines) is the conductor: ~20 `useState` +
   ~14 `useRef` mirrors, each with a sync `useEffect`, plus ~300 lines of WS handlers that **rebuild**
   the assistant message from `ai_chat_chunk` and **reconcile** it via `finalizeStreamingMessage`
   (id-swapping `streaming-<id>` → real id). Every chunk fires multiple `setState`s → render storms.
2. **`apps/web-next/src/ui/chat/dynamic/index.tsx`** owns a *second* source of truth:
   `useState<MessageSingleton<true>[]>(initialMessages ?? [])`, mutated by four reconciliation effects
   that splice optimistic/streaming/finalized messages in. At 400–600 messages (9+ models per convo)
   this thrashes badly.
3. **`ai_chat_response.convo`** — a `ConversationSingleton<true>` containing exactly the one
   freshly-persisted AI message (real id, attachments, blocks) — **is currently ignored.** The server
   hands us the authoritative message and we throw it away to rebuild from chunks. That is the tug-o'-war.

**The fix:** one hand-written `useSyncExternalStore` that *owns* committed messages + the live draft +
flags. The committed timeline is hydrated from history and from `ai_chat_response.convo` only — never
reconstructed from chunks. The live draft is a separate slice that streams token-by-token. On
`ai_chat_response` the draft is dropped and `convo.messages[0]` is committed by id. No id-swap, no
finalize, no second source of truth. `ai-chat-context.tsx` is **nuked down to a thin ergonomic façade**
that the store feeds, so existing consumers keep `useAIChatContext()` ergonomics with near-zero churn.

No third-party state libs. No zod. Hand-written, owned directly. House rules in `CLAUDE.md` apply
(no `any`/`enum`/barrels/`.filter(Boolean)`; `satisfies`/`as const`; `Array.of<T>()`; `import type`
+ `.ts` path imports; `void`-prefixed fire-and-forget; let TS infer).

## Decisions locked (from review)

- **Draft rendering:** keep the current `streaming-<convId>` sentinel behavior. The store's draft slice
  is mapped to a synthetic `MessageSingleton<true>` by ONE pure adapter and appended to the feed list,
  so `ChatFeed`/`MessageBubble` keep speaking the protocol they already speak.
- **Route:** fully client is the eventual target (no SSR — realtime WS feed, authed/non-indexed routes).
  **But this plan does NOT convert the route.** The store wires into the existing RSC route; the page
  still passes `initialMessages`, which seeds the store via `ingestHistory`. CSR conversion is deferred.
- **Scope:** store core ONLY. This is the foundation everything else sits on, so it is built thoroughly
  and proven against the existing route before the route/data layer is touched.

## Scope of THIS plan

In: the store + registry + selector hooks + WS bridge + send-path + draft adapter + the
`ai-chat-context` façade rewrite + the `convo` commit path, wired into the existing route.

Deferred to a follow-up plan (documented at the end, NOT built here): CSR `page.tsx` → client `ChatRoute`,
the API `Page`-shape fix (`getConvoPage`), and the SWR `useChatHydration` bridge.

---

## Architecture

```
WS client (singleton, unchanged)
   │  addListener(evt)                     ← store binds ONE listener, filters 3 event types
   ▼
ChatStoreRegistry (module singleton, mirrors WebSocketManager)
   │  getOrCreate(conversationId) → ChatStore        rekey("new-chat", realId)
   ▼
ChatStore (per conversation)  — plain class, NO React
   • snapshot: ChatSnapshot (immutable; new top-level object per mutation)
   • committed timeline:  byId Map + messageIds[] + committedList[]   ← STABLE during streaming
   • draft: ChatDraft | null                                          ← changes per token
   • flags + id tracking + imgGen mirror
   • reducers: ingestHistory · beginSend · applyChunk · commitResponse · applyError · clearError · reset
   ▼
useChatSelector(store, selector, isEqual)  — wraps react's useSyncExternalStore, hand-written memo
   • useChatMessages(store)  → committedList   (re-renders ONLY on commit/hydrate, never per token)
   • useChatDraft(store)     → draft           (re-renders per token — isolated)
   • useChatStatus(store)    → flags bag       (re-renders only on flag flips)
   ▼
AIChatProvider (rewritten façade ~120 lines)  → assembles the existing AIChatContextValue from store
   ▼
useAIChatContext()  (unchanged signature)   +   useSendChat()   +   draft sentinel adapter
```

### The performance invariant (the whole point)

`applyChunk` rebuilds **only** the `draft` slice; it re-pins `byId`/`messageIds`/`committedList` to the
**previous references**. So `Object.is(prev.committedList, next.committedList) === true` across every token.
`useChatMessages` returns `committedList`; its memo short-circuits on the version check and returns the
cached array → `useSyncExternalStore`'s `Object.is` sees no change → the 600-message feed does not
re-subscribe-render. Only the draft-bubble path updates per token.

To make this land end-to-end, **`MessageBubble` is wrapped in `React.memo`** (today it is not). Combined
with the store reusing each committed message's object identity across snapshots, the 599 stable bubbles
skip re-render while the single `streaming-<id>` bubble re-renders per token. This is the direct fix for
the 400–600-message thrash. The feed list array is rebuilt per token (`appendDraft`, an O(n) spread) but
that is cheap; the expensive part — re-running 600 bubble components — is gated by `memo` + stable identity.

---

## New files (all under `apps/web-next/src/`)

| Path | Purpose |
|---|---|
| `state/chat-store-types.ts` | `ChatSnapshot`, `ChatDraft`, `ChatStreamPhase`, reducer param interfaces. Frozen `EMPTY_*` consts. |
| `state/chat-message-mapper.ts` | Pure helpers: `orderBlocks`, `mergeBlock`, `extractCommittedMessage(evt)`, block→text/thinking derivation. No React. |
| `state/chat-store.ts` | `ChatStore` class: `subscribe`/`getSnapshot`/`getServerSnapshot` + reducers. No React. |
| `state/chat-store-registry.ts` | `ChatStoreRegistry` singleton (mirror `WebSocketManager` in `context/chat-ws-context.tsx`): `getOrCreate`, `rekey`, `bindClient`/`unbindClient`, WS event routing, `setRekeyHandler`. |
| `hooks/use-chat-selector.ts` | `useChatSelector` (hand-written memo over `react` `useSyncExternalStore`) + `useChatMessages`/`useChatDraft`/`useChatStatus`. |
| `hooks/use-send-chat.ts` | Assembles `AIChatRequest` + optimistic user `MessageSingleton<true>`; calls `store.beginSend`; emits via WS; rotates asset batch. Holds the dedupe guards. |
| `lib/draft-to-message.ts` | The sentinel adapter: `draftToStreamingMessage(draft, ctx)` + `appendDraft(messages, draft, ctx)`. Reuses `toMessageBlocks` + `normalizeImgGenFields`. |

No `index.ts` barrels. The store lives in a dedicated `state/` dir (new concern → dedicated files).

## Modified files

| Path | Change |
|---|---|
| `context/ai-chat-context.tsx` | **Gut to a façade (~903 → ~120 lines).** Resolve active conversationId from path (keep `getConversationIdFromPath`/`pathParser`); `store = registry.getOrCreate(id)`; bind WS client once; own the new-chat→real-id rekey seam; assemble the existing `AIChatContextValue` from store selectors + `useSendChat`. All `useState`/`useRef`/WS-handler machinery DELETED (moved into `ChatStore`). |
| `ui/chat/dynamic/index.tsx` | Delete local `messages` `useState` + all four reconciliation effects + `handleUserMessage` body. Read committed timeline via `useChatMessages(store)`, draft via `useChatDraft(store)` (or façade), build `feed = appendDraft(messages, draft, ctx)`, pass to `ChatFeed`. Seed store once via `store.ingestHistory(initialMessages)` (existing RSC prop stays for now). Forward `ChatInput` payload to `useSendChat().send`. Keep `queuedPrompt`/prompt-click/sessionStorage-restore (feed restored attachments into `send`). |
| `ui/chat/message-bubble/index.tsx` | Wrap the export in `React.memo`. No prop/contract change. (Enables the perf invariant.) |
| `ui/chat/sidebar/index.tsx` | Swap `useAIChatContext()` → narrow `useChatStatus(store)` selector (reads only `activeConversationId` + `title`) so the virtualized sidebar does NOT re-render per token. ~2 lines. |
| `lib/ui-message-helpers.ts` | Delete `createAIMessage` + `finalizeStreamingMessage` (their only callers were the deleted effects). Keep `createUserMessage` (used by `useSendChat`) + `toMessageBlocks` (used by the adapter). |

Untouched (consume via props / read-only): `ChatFeed`, `ChatInput`, `ChatHero`, `FloatingScrollButton`,
`chat-scroll-context`, every sibling provider (`ChatWebSocketProvider`, `ModelSelectionProvider`,
`ApiKeysProvider`, `AssetProvider`, `ImageGenProvider`, `TTSProvider`, `SettingsDrawerProvider`),
`attachment-mapper.ts`, `img-gen-to-attachment.ts`, `page.tsx`, `(chat)/layout.tsx`, `types/ui.ts`.

---

## Store internals

### `ChatSnapshot` (immutable) — `state/chat-store-types.ts`

```ts
export type ChatStreamPhase = "idle" | "awaiting-id" | "streaming" | "complete" | "error";

export interface ChatDraft {
  readonly conversationId: string;
  readonly text: string;
  readonly blocks: readonly ChatChunkAndResMsgBlock[]; // ordinal-ordered, dedup by ordinal
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
  readonly byId: ReadonlyMap<string, MessageSingleton<true>>; // identity preserved per entry
  readonly messageIds: readonly string[];                     // explicit order
  readonly committedList: readonly MessageSingleton<true>[];  // cached array; ref stable mid-stream
  readonly draft: ChatDraft | null;
  readonly phase: ChatStreamPhase;
  readonly isStreaming: boolean;
  readonly isThinking: boolean;
  readonly isComplete: boolean;
  readonly isNewChat: boolean;
  readonly isWaitingForRealId: boolean;
  readonly error: string | null;
  readonly title: string | null;
  readonly currentUserMsgId: string | null;
  readonly currentAiMsgId: string | null;
  readonly currentImgGenAttachmentId: string | null;
  readonly imgGenEnabled: boolean;
  readonly imgGenFields: AIChatResponseImgGenFieldsFinal | null;
  readonly version: number;                                   // monotonic; powers selector memo
}
```

**Representation choice:** `byId` Map + `messageIds[]` + cached `committedList[]`. The Map preserves each
message's reference identity across snapshots (only the changed entry is re-`set` into a cloned Map),
which is what makes `React.memo` on `MessageBubble` effective. `committedList` is rebuilt **once per
commit/hydrate** (not per token) and its reference is pinned across chunks.

Every field consumers read today maps to a snapshot field or a derived selector
(`streamedText`→`draft?.text ?? ""`, `streamingMessageBlocks`→`draft?.blocks ?? EMPTY_BLOCKS`,
`currentStreamingMessage`→`draftToStreamingMessage(draft, ctx)`, etc.). `isConnected` is NOT in the
snapshot — it stays on `useChatWebSocketContext()` (transport state, not chat state); the façade reads it
from there and re-exposes it for API compatibility.

### `ChatStore` reducers — `state/chat-store.ts`

- `getServerSnapshot()` returns a single frozen module const (React throws on fresh identities).
- `commit(next)` bumps `version`, swaps `this.snapshot`, notifies listeners — the only mutation point.
- `ingestHistory(messages)` — dedupe by id (`if (!byId.has(id))`), build ordered list. Idempotent;
  re-ingesting the same seed is a no-op. (In the deferred CSR phase this is fed by SWR pages; for now by
  the route's `initialMessages`.)
- `beginSend({ request, optimisticUser, isNewChat })` — append optimistic user message to committed
  list; create empty draft; set `isStreaming`, `phase = isNewChat ? "awaiting-id" : "streaming"`,
  `isWaitingForRealId = isNewChat`.
- `applyChunk(evt)` — rebuild ONLY `draft` (port the block-merge/text/thinking/imgGen-accumulation logic
  verbatim from `ai-chat-context.tsx` lines 346–509); re-pin committed slices by reference. Set first-real
  flags. **This is the perf-critical reducer.**
- `commitResponse(evt)` — `extractCommittedMessage(evt)` = `evt.convo.messages.at(0)`; write through by id
  (replace if present, else append); drop the `streaming-` placeholder; `draft = null`; reconcile the
  optimistic user id → real `evt.userMsgId`; set `isComplete = evt.done`. **The authoritative finalize —
  replaces `finalizeStreamingMessage` entirely.**
- `applyError(evt)` — drop draft, `phase = "error"`, set message; preserve id tracking.
- `clearError()` — no-op if already null (don't churn the snapshot). `reset()` — clear transient slices.
- `adoptFrom(sourceSnapshot, newId)` — used by `rekey` to transplant in-flight state to the real-id store.

### WS bridge + new-chat rekey — `state/chat-store-registry.ts`

The registry binds **one** `client.addListener` (fires for every parsed event — see
`utils/chat-ws-client.ts:442`) so the data path is React-independent and survives remounts. It filters to
`ai_chat_chunk` / `ai_chat_response` / `ai_chat_error` and routes by `evt.conversationId`.

The new-chat→real-id transition (today scattered across `ai-chat-context.tsx` via `firstChunkReceivedRef`/
`urlUpdatedRef`/`originalConversationIdRef`, lines 388–643) relocates here: when a `"new-chat"` store is
`isWaitingForRealId` and an event carries a real `conversationId`, `rekey("new-chat", realId)` transplants
the store (`adoptFrom`), deletes the `"new-chat"` slot, calls `window.history.replaceState(null,"",
"/chat/"+realId)`, and fires `onRekey` so the façade re-points its active id. `rekey` is idempotent (after
the first, `stores.get("new-chat")` is null → later events fall through to the migrated store). The
optional `router.replace(..., { scroll:false })` reconciliation runs only at stream completion via the
façade's `onRekey` seam — never mid-stream (no server roundtrip during streaming).

**Preserved invariant:** one active new-chat stream per user (today `activeUserStreamsRef`). The pending
store is keyed by the literal `"new-chat"`, so concurrent new-chat sends are serialized by the existing
dedupe guard, which moves into `useSendChat`. (Concurrent multi-tab new chats remain out of scope.)

### Selector hook — `hooks/use-chat-selector.ts`

`useChatSelector(store, selector, isEqual = Object.is)` wraps `react`'s `useSyncExternalStore`. A ref caches
`{ version, value }`; the inner getter recomputes the selector only when `version` changed and returns the
cached value when `isEqual` says it's unchanged — so the inner snapshot getter returns a STABLE reference
when the selected slice is unchanged (required, else React loops). No `use-sync-external-store/with-selector`
dependency — the memo is hand-written. `useChatStatus` uses a field-wise `isEqual` so it re-renders only on
genuine flag flips, not on draft text.

### Send path — `hooks/use-send-chat.ts`

Relocation of `ai-chat-context.tsx`'s `sendChat` (lines 697–842) + `dynamic`'s `handleUserMessage`/initial-
prompt builder. Consumes (read-only, never mutates) `useModelSelection`, `useApiKeys` (with `fallbackApiKeys`),
`useAssetUpload` (`currentBatchId`/`getUploadsByBatchId`/`startNewBatch`/`getByPreviewId`), `useCookiesCtx`
(the `metadata` memo, moved verbatim), `useChatWebSocketContext` (`sendEvent`). Produces the `AIChatRequest`
(identical shape) emitted via `sendEvent("ai_chat_request", …)` and the optimistic user `MessageSingleton<true>`
via `createUserMessage` + `buildOptimisticAttachment` (handles both live `ChatInput` attachments and restored
sessionStorage previews), then calls `store.beginSend(...)` and `void startNewBatch()`. The 500ms/2s dedupe
guards move here as module/store refs (not component state, so they keep their dedupe window).

### Draft sentinel adapter — `lib/draft-to-message.ts`

Pure, no effects. `draftToStreamingMessage(draft, ctx)` builds a `MessageSingleton<true>` with
`id = "streaming-"+ctx.conversationId`, `senderType:"AI"`, `messageBlocks = toMessageBlocks(id, draft.blocks)`,
attachments via `normalizeImgGenFields` (explicit `is` predicates, `Array.of<T>()`). `appendDraft(messages,
draft, ctx)` returns `messages` unchanged when `draft == null`, else `[...messages, draftToStreamingMessage]`.
`dynamic` wraps it in `useMemo`. This is the entire relocation of the deleted streaming-splice effect — and
because the feed still sees a `streaming-<id>` message, `ChatFeed`/`MessageBubble` (and all their
`liveThinkingText`/`liveImgGenFields`/`liveImgGenAttachmentId` wiring) are untouched.

### `ai-chat-context.tsx` façade

Keeps `AIChatContext`, `AIChatProvider`, `useAIChatContext` (same names/signature). Internally: resolve
active conversationId from path → `store = registry.getOrCreate(id)`; `useEffect` binds/unbinds the WS client
to the registry; `useEffect` registers the rekey handler (`setRekeyHandler` → `setActiveId`); read store via
`useChatStatus`/`useChatDraft`; assemble the existing `AIChatContextValue` (draft→`streamedText`/thinking,
flags, ids, `imgGenFields`, `isConnected` from ws context, `sendChat` from `useSendChat`, `resetStreamingState`
→ `store.reset`, `clearError` → `store.clearError`). Expose the active `store` instance on the context value too,
so `dynamic` can call `useChatMessages(store)` + `store.ingestHistory(...)`. Net: ~120 lines, "stupid",
store-fed, realtime.

---

## What gets nuked

- `context/ai-chat-context.tsx`: all `useState`/`useRef` mirrors, the sync effects, and the ~300-line WS
  handler block (`handleChunk`/`handleResponse`/`handleError`) → moved into `ChatStore` reducers.
- `dynamic/index.tsx`: local `messages` state + four reconciliation effects + `handleUserMessage` body.
- `lib/ui-message-helpers.ts`: `createAIMessage` + `finalizeStreamingMessage` (the chunk-rebuild/id-swap path).
- The practice of ignoring `ai_chat_response.convo`: it becomes the authoritative commit.

---

## Deferred to follow-up (documented, NOT built in this plan)

1. **Fully client route.** `page.tsx` → thin server shell or `"use client"`; new `ChatRoute` client component;
   drop `getConversationRouteProps` + `initialMessages`. (User's chosen end-state: fully client. Sole tradeoff:
   no server-rendered `<title>` on cold load — acceptable for authed, non-indexed routes; title is already set
   client-side during streaming.)
2. **API `Page`-shape fix.** Add `getConvoPage(conversationId, take?, cursorId?) → { convo, nextCursor, hasMore }`
   to `orm/user-message-service.ts`; point both routes (`.../chat/[conversationId]/route.ts` and
   `.../messages/[cursorId]/route.ts`) at it. `nextCursor` = oldest id in the desc page, `hasMore` = count===take.
3. **SWR hydration bridge.** `useChatHydration(conversationId, userId)` drives `use-conversation-messages.ts` as a
   write-only loader feeding `store.ingestHistory` (store as single read model). Replace the hook's buggy
   `conversation` memo (intra-page desc never reversed) with store-side sort by `createdAt` (handle `Date` vs
   ISO string via `new Date(x).getTime()`); drop `appendMessage`/`removeMessage`. Skip fetch for `home`/`new-chat`.

These three are why the store is built to ingest history idempotently and commit `convo` authoritatively now —
so the route/data swap later is a drop-in with no store changes.

---

## Verification

The repo has no chat tests; verify by running the app and observing behavior (per `feedback_pnpm_typecheck`):

1. `pnpm typecheck` (tsgo) — zero errors across the new `state/` modules, the façade, and touched components.
   No `any`, no `as` outside `as const`/overload-impl, no `.filter(Boolean)`.
2. Run `apps/web-next` (`/run` or the project's dev command). Manual passes:
   - **Existing convo:** open a 400–600-message conversation. Send a message. Confirm tokens stream in
     realtime in the `streaming-<id>` bubble. **Profile:** committed bubbles do NOT re-render per token
     (React DevTools Profiler — only the streaming bubble + `dynamic` re-render). This is the core success metric.
   - **Commit correctness:** on completion the streaming bubble is replaced by the persisted message from
     `ai_chat_response.convo.messages[0]` (real id, attachments, blocks) — no flicker, no duplicate, no id-swap.
   - **New chat:** from `/` send a prompt → `new-chat` streams, URL flips to `/chat/<realId>` via
     `replaceState` mid-stream, optimistic user message + draft survive the rekey, completion commits cleanly,
     sidebar gains the conversation (title) without per-token re-render.
   - **Thinking + image-gen:** reasoning models render the thinking section live; img-gen shows progressive
     partial images then the final committed image (attachments from the committed message).
   - **Error path:** a provider error clears the draft, surfaces the message, stops streaming.
   - **Reconnect:** drop/restore the socket; `isConnected` (from ws context) reflects it; a subsequent send works.
3. Confirm `useAIChatContext()` consumers (`dynamic`, anything else) compile and behave unchanged — the façade
   contract is preserved; only `sidebar` moves to the narrow `useChatStatus` selector.

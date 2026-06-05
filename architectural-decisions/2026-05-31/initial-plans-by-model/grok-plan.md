# Plan: Custom useSyncExternalStore for Chat in web-next (aicoalesce/slipstream)

**Status**: Draft for user review. Only apps/web-next will be modified. No changes to apps/web, ws-server, or packages (except reading types for contract).

## Context & Goals

The current chat implementation in `apps/web-next` suffers from:
- Heavy SSR data fetching on `/chat/[conversationId]` (via `getConversationRouteProps` → full `getMessagesByConversationIdWithAssets` for potentially 400-600+ messages across 9+ provider/model turns). This is unnecessary because the WS server is the source of truth: after stream + DB persist, `ai_chat_response` always includes `convo: ConversationSingleton<true>` containing **exactly one message** (the just-persisted AI response + attachments).
- Multiple overlapping state sources and brittle sync: `ai-chat-context.tsx` (useState + refs + effects for streaming/chunks/response), local `useState<Message[]>` + 5+ useEffects inside `ChatInterface` (dynamic/index.tsx), optimistic updates, ID reconciliation, streaming placeholders (`streaming-*`), etc. This causes "tug-of-war" and side-effect thrashing at scale.
- `chat-ws-context` + `use-chat-ws` + `chat-ws-client` provide the raw pipe, but state management on top is unreliable `useState`/`useRef` patterns instead of a proper external store.
- "Dynamic" (the misnomer for `ChatInterface`) is fed server props it shouldn't need for message history.
- An SWR Infinite workup (`use-conversation-messages.ts`) exists (with `appendMessage`, `loadMore`, Page shape for pagination, revalidate:false discipline) but is **not wired**; its fetchers/APIs are also misaligned (APIs return raw `ConversationSingleton` or `Message[]`, hook expects `{convo, nextCursor, hasMore}`).

**Vision** (user's explicit direction):
- React is deliberately "sweet summer child" / not load-bearing for chat transcript state. Backend WS owns truth.
- **One** custom `useSyncExternalStore` (no Zustand/Jotai/Redux/valtio/Zod — own the impl + minimal type utils directly in web-next).
- `chat-ws-client.ts` (fed via `use-chat-ws.ts`) becomes the **sole recipient** of raw events for the authoritative chat state machine.
- SWR's role: **only** initial/paginated historical load ("previous messages have been loaded") for a conversation on entry. WS events hydrate/live-update from that point.
- Client-side first for web-next chat routes (slim the RSC fetch to auth + shell only).
- Store owns messages list + all transient streaming state (chunks, thinking, imgGen progressive, current IDs, isStreaming flags, etc.).
- Global subscriber pattern preserved (store subscribers), but backed by stable external snapshot instead of context churn.
- End result: clean, predictable, scalable to 600+ msgs without re-render storms or reconciliation bugs. Cornerstone for slipstream frontend.

Server (WS + prisma/chat.ts `handleAiChatResponse`) is **done** — `convo` contract is stable per `@packages/types`.

**Hard constraints from CLAUDE.md (project-wide, must obey)**:
- No `any`, no `@ts-ignore`, no bare `as` (use `satisfies` + `as const` patterns).
- Explicit path imports with `.ts`/`.tsx` extensions (no barrels).
- Path aliases (`@/`, `@slipstream/types`).
- Let TS infer; minimal return annotations except overloads.
- Registry/cache patterns where state lives (the store will be a purpose-specific registry + snapshot for the active convo).

## Recommended Architecture

### 1. Core New Artifact: The External Chat Store
**File to create**: `apps/web-next/src/stores/chat-store.ts` (or `src/lib/chat-external-store.ts` — "stores/" keeps it clearly separated from hooks/lib/contexts).

- Module-level singleton store (or factory returning one stable instance per user session). No React at module root.
- Internal mutable state (never exposed directly):
  - `currentConversationId: string | null`
  - `messages: Map<string, MessageSingleton<true>[]> ` or simple per-convo registry (start with single active convo focus for simplicity; messages array for the active one).
  - Transient streaming snapshot: `streamedText`, `streamingMessageBlocks: ChatChunkAndResMsgBlock[]`, `thinkingText/Duration`, `imgGen*` live progressive fields, `current*MsgId`, `isStreaming/isThinking/isComplete`, `error`, `isWaitingForRealId`, `isNewChat` etc. (direct port of what lives in AIChatContext today).
  - `title?: string`
- `subscribe(listener: () => void): () => void` — standard, uses `Set`.
- `getSnapshot(): ReadonlyChatSnapshot` — returns a frozen/readonly view (structured clone or careful readonly types). This is what `useSyncExternalStore` receives.
- `getServerSnapshot()` for SSR (return empty or minimal seed).
- Mutators (called only from event handlers or controlled entrypoints):
  - `hydrateConversation(convoId: string, messages: MessageSingleton<true>[], title?: string)` — called once by SWR loader effect when historical pages settle. Replaces/sets the base list (dedup by id).
  - `appendHistoricalMessages(older: MessageSingleton<true>[])` — for SWR "loadMore" pagination (prepend, since history loads backward).
  - `applyAIChatChunk(evt: EventTypeMap["ai_chat_chunk"])` 
  - `applyAIChatResponse(evt: EventTypeMap["ai_chat_response"])` — **key**: take `evt.convo.messages[0]` (the singleton persisted AI msg), append it (or replace any streaming placeholder by id), clear streaming transients, reconcile IDs if needed, update title if present. This is where `convo` field finally becomes the source of truth instead of ignored.
  - `applyAIChatError(...)`
  - `beginStream(convoId, optimisticUserMsg?, ...)` — for optimistic user bubble + reset transients before/ on ai_chat_request send.
  - `updateStreamingFromBlocks(...)` (shared logic from current context helpers).
  - `setActiveConversationId`, `resetForNewConvo`, `clearStreamingState` etc.
  - `seedOptimisticUserMessage(msg: MessageSingleton<true>)` — called from ChatInput handler (before WS send).
- Attach the WS client **once**:
  - `attachClient(client: ChatWebSocketClient)` — inside, `client.addListener(store.handleRawWsEvent)` (or register specific `client.on("ai_chat_chunk", ...)` for the store's private handlers).
  - Store becomes the **primary/sole** place that reacts to `ai_chat_*` events for transcript state. Other handlers (asset, tts, typing) can coexist via the client's registry.
- Selector-friendly consumption (perf for large lists):
  ```ts
  export function useChatStore<T>(selector: (snap: ChatSnapshot) => T): T {
    return useSyncExternalStore(
      subscribe,
      () => selector(getSnapshot()),
      () => selector(getServerSnapshot())
    );
  }
  ```
  Components do `const messages = useChatStore(s => s.messages)` or finer-grained for streaming pieces. This prevents whole-app re-renders.
- Export a thin `useChatMessages(convoId?)` etc. if ergonomics demand.
- Pure TS, no deps beyond `@slipstream/types` and the local `ChatWebSocketClient` type. Write tiny internal predicates (e.g. `isAIChatResponse(e): e is ...`) instead of Zod.

**Why useSyncExternalStore here**:
- Guarantees stable snapshots between React renders.
- Bypasses React's state batching pitfalls for high-frequency WS chunks.
- Explicit subscription model matches the "global subscribers are my favorite" preference.
- Easy to snapshot for debug/time-travel later if desired.
- Zero magic.

### 2. Wire the Client → Store (Sole Recipient)
- Modify `apps/web-next/src/hooks/use-chat-ws.ts` (lightly): after client creation + connect, expose or call `chatStore.attachClient(client)` (or have the store hook into the same memoized client). Keep backward compat for existing `on`/`sendEvent`.
- In `chat-ws-context.tsx` (or a new thin `ChatStoreProvider`): ensure the store is attached early in the provider tree (after WS provider). The store lives outside React but is initialized/attached inside the authenticated client boundary.
- Remove `ai_chat_*` handlers from `ai-chat-context.tsx` (or stub them to delegate to store). The context becomes a thin compatibility layer or is gradually dismantled for consumers that only need chat state.
- `client.on(...)` registrations for non-chat events (assets etc.) stay where they are.

### 3. SWR Historical Load Role (Fix + Integrate)
- **Fix alignment first** (required before store can trust it):
  - Either update the two API routes (`/api/users/[userId]/chat/[conversationId]/route.ts` and the cursor messages one) to return `Page` shape (`{convo: ConversationSingleton<true>, nextCursor, hasMore}` computed from the service methods + count check).
  - Or (preferred for minimal server change) update `pageFetcher` + `conversation` memo inside `use-conversation-messages.ts` to normalize whatever the current APIs return. The service already has `getConvoInitial` (take=25 desc? careful ordering) and `getMsgsByCursor`.
  - Note current `getConvoInitial` + `getMessagesByCursor` return shaped singletons but ordering in SWR merge is currently buggy (it reverses pages manually). Align to consistent asc createdAt for UI.
- New/updated loader component or effect inside chat area (or a `useSeedChatStoreFromSWR` hook):
  - When `conversation` from SWR is ready for the active convoId, call `chatStore.hydrateConversation(...)`.
  - On `loadMore()` success + new pages, call store's prepend method.
  - `appendMessage` on SWR can still be called from store's `applyAIChatResponse` (for cache durability across tab switches), with `{revalidate:false}`.
- SWR config stays aggressive on "do not fight WS": all revalidate* false, refresh 0, etc. It is cold history only.
- For `new-chat`: SWR key returns null (no historical). Store starts empty; first response seeds via the `convo` singleton + creates real convoId.

### 4. Slim the Server Route + Dynamic Component
- `apps/web-next/src/app/(chat)/chat/[conversationId]/page.tsx`:
  - Stop calling `getConversationRouteProps` (or introduce `getChatShellProps` that does only session/auth + user object + minimal title if cheap).
  - Return a thin server shell + `<ChatInterfaceClientShell conversationId={...} user={...} />` (Suspense still useful for the skeleton).
  - `generateMetadata` can stay (light title query is acceptable).
- `apps/web-next/src/ui/chat/dynamic/index.tsx` (the "Dynamic" component):
  - Become (or delegate to) a client component that:
    - Uses `useChatStore(...)` (or multiple fine selectors) for `messages`, all streaming fields, `activeConversationId`, `sendChat` (if moved), `isConnected` etc. **Delete the local `messages` useState + the 4-5 massive useEffects** that currently do streaming merge, attachment URL patching, completion finalization, optimistic ID fixup, etc.
    - Optimistic user messages: still build `createUserMessage(...)` locally on `handleUserMessage`, then `chatStore.seedOptimisticUserMessage(...)` + call the (possibly moved) send.
    - Pass the store-derived messages + streaming props down to `<ChatFeed messages=... streamedText=... />` (or make ChatFeed also subscribe directly for ultimate decoupling).
  - Keep local concerns: queuedPrompt/sessionStorage for initial prompts/attachments on new-chat, router, assetUpload integration for optimistic previews, path context.
- `ChatFeed`, `MessageBubble`, etc. receive stable props or can migrate to direct store subscriptions later. Virtualization (existing virtualized-chat-feed dir) will benefit enormously from not thrashing on every context update.

### 5. Refactor / Deprecate ai-chat-context.tsx (Phased)
- Phase 1 (this work): Move streaming + response logic into store. Have `useAIChatContext` (and its provider) derive its value from `useChatStore` selectors + the existing WS sendEvent. This keeps all current call sites (there are several) working with zero or minimal changes elsewhere.
- Phase 2 (future, out of scope unless asked): Delete the context entirely; consumers migrate to `useChatStore(s => s.xxx)` or dedicated hooks (`useStreamingState`, `useSendChat`).
- `ChatWebSocketProvider` / context stays as the connection + generic `on`/`sendEvent` owner. Store just becomes the best listener.

### 6. Other Supporting Changes (Minimal)
- `src/types/ui.ts`: Update `ChatInterfaceProps` — `initialMessages` becomes optional/removed or only for future RSC seeds (we won't use).
- Possibly a small `src/lib/chat-store-utils.ts` for pure helpers extracted from current context (orderMessageBlocks, textFromBlocks, etc.) + new type guards. No Zod.
- In `ChatInput` etc.: the `onUserMessage` path will call store optimistic + send (via context or direct).
- Handle convo switching: store listens to pathname (or receives explicit `switchToConversation(id)` calls) + clears transients + waits for SWR hydrate.
- Error/loading states for SWR surface via store or dedicated.
- Preserve all existing behavior for image-gen progressive, thinking blocks, TTS, reactions (reactions may use separate paths), attachments.
- Dev/debug: expose `getChatStore()` or window.__chatStore for inspection (like the existing ws manager).

### 7. Data Flow (After)
1. User lands on `/chat/abc123` → thin RSC (user + shell only) renders → client mounts.
2. SWR key activates → paginated fetches (25 msgs at a time, via fixed APIs) → on success: `chatStore.hydrate(...)` seeds the messages snapshot.
3. WS already connected (provider tree).
4. User sends → optimistic user msg seeded in store → `ai_chat_request` emitted.
5. Chunks arrive → store `applyChunk` mutates streaming partials + notifies subscribers (UI shows live AI bubble without full list re-render thanks to selectors).
6. Stream ends + server persists → `ai_chat_response` with `convo: {messages: [exactlyTheNewAIMsg]}` → store `applyResponse` appends the real persisted version (replaces streaming placeholder), clears transients, optionally tells SWR cache.
7. Pagination ("load older"): SWR loads → store prepends → UI prepends in feed.
8. Switch convo → store reset + new SWR key + re-hydrate.
9. Large list: only the subscribed slice re-renders; virtualization + React.memo on bubbles keeps it fast.

This eliminates the current "fetch on server + stream on client + ignore the convo payload" dance.

## Critical Files to Modify / Create (web-next only)

**Create**:
- `src/stores/chat-store.ts` (core — ~300-500 LOC of careful, typed state machine + useSyncExternalStore)
- Possibly `src/stores/chat-store.test.ts` (future) or manual verification script.

**Modify**:
1. `src/app/(chat)/chat/[conversationId]/page.tsx` — slim props (stop heavy message fetch).
2. `src/orm/user-message-service.ts` — add `getMinimalChatRouteProps` (or equiv) that returns only `{user, conversationId, conversationTitle?}` without calling message queries. Keep existing methods for the (fixed) SWR APIs + metadata.
3. `src/ui/chat/dynamic/index.tsx` — delete local messages state + syncing effects; consume from new store hook. Keep input/optimistic/queued prompt logic.
4. `src/hooks/use-conversation-messages.ts` — minor fixes for API shape mismatch + export a `useSeedStoreFromSWR(convoId, onReady)` helper or document the integration pattern.
5. `src/hooks/use-chat-ws.ts` — attach store to client (one line + import).
6. `src/context/chat-ws-context.tsx` — ensure attachment timing (minor).
7. `src/context/ai-chat-context.tsx` — remove/replace ai_chat_* handlers + streaming state with store selectors (large but mechanical deletion + delegation). Keep provider for compat.
8. `src/app/api/users/[userId]/chat/[conversationId]/route.ts` + cursor sibling — (small) make them return consistent Page shape (or document that fetcher normalizes).
9. `src/types/ui.ts` — loosen `ChatInterfaceProps` (remove or optionalize `initialMessages`).
10. `src/lib/ui-message-helpers.ts` (and attachment-mapper etc.) — unchanged, just called from new paths in store or dynamic.

**Read-only for contract** (do not edit):
- `packages/types/src/events.ts` (esp. `AIChatResponse`, `AIChatChunk`, `ChatChunkAndResMsgBlock`)
- `packages/types/src/types.ts` (`ConversationSingleton<true>`, `MessageSingleton<true>`)
- Existing service methods for pagination shape.

**Do not touch**:
- `apps/web/**`
- ws-server/**
- Any package/ except reading types
- Other contexts (asset, model-selection, etc.) except for the AIChat one as noted
- package.json / deps (SWR already present; no new ones)

## Existing Code to Reuse Heavily

- All helpers in `src/context/ai-chat-context.tsx`:
  - `orderMessageBlocks`, `mergeStreamingMessageBlocks`
  - `textFromMessageBlocks`, `thinkingTextFromMessageBlocks`, `thinkingDurationFromMessageBlocks`
  - `isThinkingBlock`
  - The `StreamingMessage` shape (adapt into store snapshot)
  - Dedup/recentMessages logic, activeUserStreamsRef patterns.
- `src/lib/ui-message-helpers.ts`: `createUserMessage`, `createAIMessage`, `finalizeStreamingMessage`, `toMessageBlocks`
- `src/lib/attachment-mapper.ts`: `buildOptimisticAttachment`
- `src/lib/img-gen-to-attachment.ts`: `normalizeImgGenFields`
- SWR hook skeleton + `appendMessage`/`updateCache`/`conversation` memo (the pagination + mutate discipline is already well-commented for exactly this WS + SWR co-existence).
- `ChatWebSocketClient` listener + registry APIs (the `addListener` + typed `on`).
- Current `ChatInterface` optimistic + input handling (move the creation calls, keep the UX).
- Path parsing, cookie tz, etc.

**Do not reinvent**: the block ordering/thinking extraction, message factory fns, or SWR infinite key logic.

## Verification & Testing Strategy (End-to-End)

Since no automated test suite is described for the frontend chat flow, verification is manual + compile-time:

1. **Typecheck + Lint**:
   - `cd cloneathon/t3-chat-clone && pnpm --filter web-next exec tsc --noEmit`
   - `pnpm --filter web-next lint` (or turbo)
   - Must pass with zero new `any`/assertion violations (obey CLAUDE.md strictly).

2. **Dev Server Smoke**:
   - Run the web-next dev server + ws-server (existing compose or manage.sh).
   - Log in, create new chat, send several messages (text + with attachments + one image-gen if possible).
   - Verify: no server message fetch in RSC logs for the convo (only metadata/title if any), SWR fetches appear in network for /api/users/.../chat/..., WS events arrive, UI renders history + live stream correctly, final `ai_chat_response` `convo` msg appears exactly once (no dupes), IDs reconcile.
   - Enter existing long convo (ideally >100 msgs if seed data exists): confirm SWR loads pages progressively (loadMore button or scroll trigger if implemented), store seeds, no double data, smooth.

3. **Key Scenarios**:
   - New-chat → first response creates real ID + router replace (existing behavior preserved via store flags).
   - Mid-convo send while history loaded: optimistic user + streaming AI + final persisted append via `convo` (confirm via console or React devtools that store snapshot updated, SWR optionally too).
   - Convo switch (sidebar nav): store clears transients + re-seeds from new SWR key.
   - Image gen progressive + final (the `imgGenFields` path in response).
   - Thinking blocks (the ordinal + duration aggregation).
   - Error path (`ai_chat_error`).
   - Rapid sends (dedup in store).
   - Large history: open a convo with many msgs, send one, confirm no full-list re-render storm (use React profiler or just subjective scroll/ responsiveness).

4. **Regression**:
   - All existing non-message features (sidebar convos list via its own hook, settings, auth, asset upload separate flow, TTS, reactions via `use-reaction`) continue to work.
   - The `ChatWebSocketProvider` + manager singleton behavior unchanged.
   - SessionStorage initial prompt/attachments on new-chat still works.

5. **Optional but recommended for this architectural change**:
   - Add a temporary `window.__dumpChatStore = () => chatStore.getSnapshot()` in dev for manual inspection during verification.
   - After store lands and basic flows pass, a follow-up can extract more selectors or split streaming vs. messages concerns if snapshot grows.

**Rollback safety**: The changes are localized. Old `initialMessages` prop path can be left (unused) during transition. AIChatContext can stay as compat shim.

## Open Questions / Decisions for User (if any remain after review)

- Exact module location for the store (`src/stores/` vs `src/lib/` vs colocated)?
- Should the store also own `sendChat` fully (taking the sendEvent fn at attach time), or keep a thin context method that calls store.begin + ws send?
- Do we want the store to be *per-conversation* (Map of stores) from day 1 for instant switch, or single-active is sufficient?
- Naming of the exported hook (`useChatStore`, `useConversationStore`, `useSlipstreamChat`...)?
- Any immediate consumers outside ChatInterface + context that we must support on day 1?

Once this plan is approved, implementation will proceed file-by-file with the strict type discipline, reusing the listed helpers, and verifying at each milestone before moving on.

This directly realizes the "deliberately rejecting load-bearing React + WS as sole truth + meticulous single external store" direction for the platform's frontend cornerstone.

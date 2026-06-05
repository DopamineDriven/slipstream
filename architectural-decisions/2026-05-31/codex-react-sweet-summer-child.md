# React Sweet Summer Child: `web-next` Chat Store Plan

## 0. Decision Summary

The future `apps/web-next` chat surface should make React a renderer and subscriber, not the owner of transcript truth. The authoritative live contract is the websocket event stream, and the authoritative final assistant message is already present in `ai_chat_response.convo.messages[0]` as `ConversationSingleton<true>`.

The right architecture is a first-party external chat store built on `useSyncExternalStore`, with `AIChatContext` preserved as an ergonomic facade that reads from the store and exposes stable actions. React context remains useful for dependency wiring and existing consumer ergonomics, but it must stop owning canonical chat state through `useState`, ref mirrors, and effect-driven reconciliation.

The implementation should be staged:

1. Build the store and move chat stream/message orchestration into it while the current route can still seed initial messages.
2. Convert the chat route to a client shell and make SWR the cold-history loader that hydrates the store.
3. Retire the duplicated message reconciliation paths once the store is the only read model for chat messages.

This is `apps/web-next` only. Do not touch `apps/web`.

## 1. Current-State Findings

The current `web-next` implementation has three competing chat state models.

`apps/web-next/src/app/(chat)/chat/[conversationId]/page.tsx` is a server component that calls `getConversationRouteProps(conversationId)`. For existing conversations, that calls `getMessagesByConversationIdWithAssets`, which eagerly loads the full message history and passes it into the client component as `initialMessages`. This is exactly the path that becomes expensive when a conversation has 400 to 600+ messages.

`apps/web-next/src/context/ai-chat-context.tsx` is currently the stream conductor. It owns active conversation id, streaming text, thinking text, message block state, message ids, image-gen fields, completion flags, error flags, duplicate-send guards, title updates, URL transition state, and websocket handlers. It receives chunks and responses, rebuilds provisional assistant content from chunks, and exposes that through context. This makes context updates hot during every token/chunk.

`apps/web-next/src/ui/chat/dynamic/index.tsx` owns a second canonical-looking `messages` array. It starts from `initialMessages`, adds optimistic user messages, synthesizes streaming assistant messages, patches attachment URLs, and finalizes streaming messages with `finalizeStreamingMessage`. This means the same logical event is represented once in context and again in component-local state.

The backend contract already solves the final-message problem. In `packages/types/src/events.ts`, `AIChatResponse` includes:

```ts
convo: ConversationSingleton<true>;
```

with the documented meaning that it contains exactly one message: the most recent persisted AI response. That payload should be committed directly. The frontend should not rebuild the final assistant message from chunk state after the server has already persisted and returned it.

There is also a concrete SWR mismatch:

- `apps/web-next/src/hooks/use-conversation-messages.ts` expects API pages shaped as `{ convo, nextCursor, hasMore }`.
- `apps/web-next/src/app/api/users/[userId]/chat/[conversationId]/route.ts` currently returns a raw `ConversationSingleton<true>`.
- `apps/web-next/src/app/api/users/[userId]/chat/[conversationId]/messages/[cursorId]/route.ts` also returns a raw conversation singleton from `getMessagesByCursor`.

That mismatch must be fixed before SWR can be the reliable cold-history loader.

## 2. Architectural Principles

### React is not the transcript authority

React components can request actions and render selected state. They should not assemble the canonical transcript through local `useState` effects. Every final message visible in the feed should come from one of two places:

- persisted history loaded by SWR and hydrated into the store
- final websocket response payloads committed from `ai_chat_response.convo.messages[0]`

Chunk data is only provisional display state.

### The store is a state machine, not a generic state bag

The store should have named registries and explicit transitions:

- hydrate persisted history
- begin optimistic send
- apply stream chunk
- apply final response
- apply error
- switch conversation
- rekey `new-chat` to the real conversation id
- reset transient state

No generic `setState(partial)` public API. That recreates the same accidental coupling in a different place.

### Context remains, but as a facade

`AIChatProvider` and `useAIChatContext()` should remain for compatibility and ergonomics. The provider should:

- select state from the external store
- expose stable actions such as `sendChat`, `clearError`, and `resetStreamingState`
- wire dependencies from existing contexts into action builders
- keep `isConnected` from `ChatWebSocketContext`
- avoid owning canonical chat state with `useState`

This preserves the existing global-subscriber style without making context the hot store.

### SWR hydrates cold data only

SWR is not the live source of truth. Its job is:

- load the first page of persisted messages when entering an existing conversation
- load older pages on demand
- avoid focus/reconnect revalidation that fights live websocket mutations
- call store hydration methods with fetched pages

The UI should read messages from the chat store, not directly from SWR.

### Final response wins over reconstructed data

During streaming, the frontend can synthesize a temporary assistant bubble from chunk/message-block state. On `ai_chat_response`, that temporary bubble is dropped and replaced by the persisted server message in `evt.convo.messages[0]`.

This should retire the current `finalizeStreamingMessage` path for final assistant messages.

## 3. Target Data Flow

### Existing conversation

1. User navigates to `/chat/<conversationId>`.
2. Client chat shell mounts with `conversationId` and `user`.
3. Chat context obtains the store for the active conversation and subscribes through `useSyncExternalStore`.
4. `useConversationMessages` fetches the first page from `/api/users/<userId>/chat/<conversationId>`.
5. The SWR bridge calls `store.hydratePage(page)`.
6. Components render store-selected committed messages.
7. User sends a prompt.
8. The send action inserts an optimistic user message and emits `ai_chat_request`.
9. `ai_chat_chunk` updates only the draft stream slice.
10. `ai_chat_response` commits `evt.convo.messages[0]`, clears the draft, and marks the stream complete.

### New chat

1. User navigates to `/chat/new-chat` or starts from home.
2. Store starts with no persisted history and `conversationId = "new-chat"`.
3. User sends prompt; store inserts optimistic user message and enters `awaiting-id`.
4. First chunk or response carrying a real `conversationId` triggers a rekey from `"new-chat"` to the real id.
5. URL is replaced with `/chat/<realId>` without causing a server refetch during streaming.
6. Final response commits `evt.convo.messages[0]`.
7. Sidebar receives the new conversation title/id from a narrow store selector and updates its SWR conversation list.

### Pagination

1. Feed requests older messages.
2. SWR loads the next page using `nextCursor`.
3. Store prepends or merges older messages by id.
4. Store preserves existing message object identity for unchanged messages.

## 4. Store Design

Create a small set of dedicated files under `apps/web-next/src/stores/chat/` or `apps/web-next/src/state/chat/`. I prefer `src/stores/chat/` because this is an application state owner, not just a utility.

No barrel exports. Import each file explicitly.

### Files

`apps/web-next/src/stores/chat/chat-store-types.ts`

Defines the snapshot, draft, phase, command parameter, and page hydration types. This file should import only types.

`apps/web-next/src/stores/chat/chat-store.ts`

Plain TypeScript class. No React imports. Owns subscriptions, snapshots, registries, and reducer-style methods.

`apps/web-next/src/stores/chat/chat-store-registry.ts`

Module singleton registry for stores keyed by conversation id. Owns websocket event routing and `new-chat` rekeying.

`apps/web-next/src/stores/chat/chat-message-workup.ts`

Pure helpers for block ordering, block merge, text extraction, thinking extraction, committed message extraction, and message ordering.

`apps/web-next/src/hooks/use-chat-store-selector.ts`

React hook wrapping `useSyncExternalStore` with selector memoization.

`apps/web-next/src/hooks/use-send-chat.ts`

Builds optimistic user messages and `AIChatRequest` payloads from existing context dependencies. Calls store actions and `sendEvent`.

`apps/web-next/src/lib/draft-to-message.ts`

Pure adapter that turns the current draft into the existing `streaming-<conversationId>` synthetic `MessageSingleton<true>` so `ChatFeed` and `MessageBubble` need minimal change in the first pass.

### Snapshot shape

The snapshot should be explicit and readonly:

```ts
export type ChatStreamPhase =
  | "idle"
  | "awaiting-id"
  | "streaming"
  | "complete"
  | "error";

export interface ChatDraft {
  readonly conversationId: string;
  readonly text: string;
  readonly blocks: readonly ChatChunkAndResMsgBlock[];
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
  readonly conversationId: string;
  readonly title: string | null;
  readonly phase: ChatStreamPhase;
  readonly isStreaming: boolean;
  readonly isComplete: boolean;
  readonly isWaitingForRealId: boolean;
  readonly isNewChat: boolean;
  readonly error: string | null;
  readonly byId: ReadonlyMap<string, MessageSingleton<true>>;
  readonly messageIds: readonly string[];
  readonly committedList: readonly MessageSingleton<true>[];
  readonly draft: ChatDraft | null;
  readonly currentUserMsgId: string | null;
  readonly currentAiMsgId: string | null;
  readonly currentImgGenAttachmentId: string | null;
  readonly imgGenEnabled: boolean;
  readonly imgGenFields: AIChatResponseImgGenFieldsFinal | null;
  readonly version: number;
}
```

The store can keep mutable internals privately, but every public snapshot must be treated as immutable. Each mutation publishes a new top-level snapshot. Unchanged nested references should be intentionally reused.

### Registry model

Use purpose-specific registries:

```ts
private readonly storesByConversationId = new Map<string, ChatStore>();
```

Inside each store:

```ts
private byId = new Map<string, MessageSingleton<true>>();
private messageIds = Array.of<string>();
private committedList = Array.of<MessageSingleton<true>>();
private optimisticToServerId = new Map<string, string>();
```

The important invariant: `committedList` should not get a new array reference on every chunk. It should change only when history is hydrated, an optimistic user message is inserted, a final message is committed, a message is removed, or a conversation is reset.

### Public store methods

The public API should be command-oriented:

```ts
subscribe(listener: () => void): () => void
getSnapshot(): ChatSnapshot
getServerSnapshot(): ChatSnapshot
hydratePage(page: ConversationMessagePage): void
hydrateMessages(params: HydrateMessagesParams): void
prependHistory(params: PrependHistoryParams): void
beginSend(params: BeginSendParams): void
applyChunk(evt: EventTypeMap["ai_chat_chunk"]): void
applyResponse(evt: EventTypeMap["ai_chat_response"]): void
applyError(evt: EventTypeMap["ai_chat_error"]): void
setActiveConversationId(conversationId: string): void
adoptSnapshot(params: AdoptSnapshotParams): void
clearError(): void
resetStreamingState(): void
resetConversation(params: ResetConversationParams): void
```

Avoid public generic mutation methods. The rest of the app should not know store internals.

## 5. Reducer Semantics

### `hydratePage`

Purpose: load persisted history from SWR into the committed timeline.

Rules:

- ignore pages for a different conversation id
- merge by message id
- preserve existing message object identity when the incoming message is equivalent or older
- sort final display order by `createdAt` ascending, then stable fallback by previous order
- do not clear an active draft
- do not re-add an optimistic user message if the server page already contains the real message id

This method is idempotent. Rehydrating the same page should be a no-op or should publish no meaningful changed selectors.

### `beginSend`

Purpose: create the optimistic user bubble and enter streaming state.

Inputs:

- conversation id
- prompt
- optimistic user message
- selected provider/model
- image-gen request fields
- batch id if present

Rules:

- append the optimistic user message to committed messages
- clear prior stream transients
- create an empty draft for the assistant
- set `phase = "awaiting-id"` when conversation id is `"new-chat"`, else `"streaming"`
- set `isWaitingForRealId` only for `"new-chat"`
- set `currentUserMsgId` to the optimistic id until server ids arrive
- record duplicate-send guard outside React state

### `applyChunk`

Purpose: update provisional streaming display.

Rules:

- never mutate committed message registries
- update only draft and status fields
- merge `messageBlocks` by ordinal
- derive `text` from `TEXT` blocks
- derive `thinkingText` from `THINKING` and `ENCRYPTED_THINKING` blocks
- preserve legacy `chunk` handling for providers still emitting chunk-only payloads
- accumulate image-gen partial fields without losing previous partial images
- update `currentUserMsgId`, `currentAiMsgId`, and `currentImgGenAttachmentId` when present
- if the store is waiting on `"new-chat"` and the chunk contains a real conversation id, request a registry rekey

Critical performance rule: after `applyChunk`, `snapshot.committedList` should be the exact same reference as before the chunk.

### `applyResponse`

Purpose: commit the server-persisted assistant message.

Rules:

- extract `const committed = evt.convo.messages.at(0)`
- if no committed message is present, treat that as an expected protocol failure and move to error state with a typed message
- reconcile the optimistic user id using `evt.userMsgId` when possible
- commit the persisted AI message by id
- remove any synthetic `streaming-<conversationId>` draft representation
- clear `draft`
- set final thinking/image-gen fields from the response only for status display, not for reconstructing the final message
- update title if present
- set `isStreaming = false`, `isComplete = evt.done`, `isWaitingForRealId = false`
- do not call `finalizeStreamingMessage`

This is the central architectural correction: final assistant message data comes from the backend payload.

### `applyError`

Purpose: stop the stream without destroying persisted history.

Rules:

- clear the draft
- set `phase = "error"`
- set `error = evt.message`
- set `isStreaming = false`
- set `isComplete = true`
- preserve committed messages and the optimistic user message
- update ids from the event when present
- if a real conversation id exists, make sure active id follows it

### `rekey("new-chat", realId)`

Purpose: preserve in-flight state while replacing the temporary conversation id.

Rules:

- only valid when source id is `"new-chat"` and target id is neither `"new-chat"` nor empty
- transplant the source store snapshot into the target store
- rewrite draft and optimistic messages to the real conversation id where appropriate
- update registry mapping atomically
- trigger URL replacement exactly once
- do not force a Next server navigation mid-stream

The router can be synchronized after completion if needed, but the mid-stream transition should be `window.history.replaceState` or an equivalent shallow client transition that does not re-run the server page.

## 6. Selector Strategy

Use `useSyncExternalStore`, but do not subscribe every consumer to the entire snapshot. Build selector hooks.

```ts
function useChatStoreSelector<TSelected extends unknown>(
  store: ChatStore,
  selector: (snapshot: ChatSnapshot) => TSelected,
  isEqual?: (left: TSelected, right: TSelected) => boolean
): TSelected;
```

The hook should cache the selected value. If `version` changes but `isEqual` says the selected value did not, return the previous selected reference. This prevents unrelated chunk updates from re-rendering sidebar/status/history consumers.

Dedicated hooks:

- `useChatMessages(store)` returns `committedList`
- `useChatDraft(store)` returns `draft`
- `useChatStatus(store)` returns only flags/title/current ids
- `useChatConversationId(store)` returns active id
- `useChatError(store)` returns error state

Do not expose a hook that encourages `const snapshot = useChatSnapshot()` everywhere. That recreates context-style broad invalidation.

## 7. `AIChatContext` Facade

Keep the public context and hook names:

- `AIChatProvider`
- `useAIChatContext`

But change their role.

The provider should own only dependency wiring:

- `useChatWebSocketContext()` for `client`, `sendEvent`, `isConnected`
- `useModelSelection()` for selected provider/model
- `useApiKeys()` for provider context
- `useAssetUpload()` for batch helpers and optimistic attachment lookup
- `useCookiesCtx()` for metadata
- `usePathname()` or `usePathnameContext()` for route-derived conversation id
- `useRouter()` only for deliberate route synchronization

The provider should select store data and assemble the existing context value. It can still expose familiar fields:

- `activeConversationId`
- `title`
- `streamedText`
- `isStreaming`
- `isComplete`
- `isNewChat`
- `error`
- `thinkingText`
- `isThinking`
- `thinkingDuration`
- `currentStreamingMessage`
- `streamingMessageBlocks`
- `currentUserMsgId`
- `currentAiMsgId`
- `currentImgGenAttachmentId`
- `sendChat`
- `setActiveConversationId`
- `clearError`
- `resetStreamingState`
- `isWaitingForRealId`
- `isConnected`
- `imgGenEnabled`
- `imgGenFields`
- `store`

Adding `store` to the context value is useful during migration because `ChatInterface` can call `useChatMessages(store)` directly without discovering the registry again.

What the provider should not do:

- own message arrays
- subscribe to `client.on("ai_chat_chunk")` and mutate React state
- mirror every state field into refs
- synthesize final messages
- patch message ids through component effects

## 8. Websocket Integration

Keep `ChatWebSocketClient` as the transport owner. Do not move socket creation into the chat store in the first pass.

Recommended integration:

- `ChatWebSocketProvider` continues to create and connect the client.
- `ChatStoreRegistry` exposes `bindClient(client)` and `unbindClient(client)`.
- `AIChatProvider` or a small `ChatStoreBridge` calls `registry.bindClient(client)` once inside the authenticated provider tree.
- The registry uses `client.addListener(listener)` to observe parsed events and routes only chat events:
  - `ai_chat_chunk`
  - `ai_chat_response`
  - `ai_chat_error`

Do not register store handlers through the current single-handler `client.on(event, handler)` API if that risks replacing other handlers. `addListener` is the safer fan-out mechanism because it supports multiple listeners.

Longer-term cleanup for `ChatWebSocketClient`:

- remove `console.log` calls or gate them behind structured/debug logging
- avoid global handler replacement warnings for intentional fan-out
- keep typed parsing, but replace parse-time assertions with narrow helpers if this file is touched

Do not make those websocket cleanup tasks part of the store migration unless they block correctness.

## 9. SWR and API Contract

### Page type

Use one explicit page shape:

```ts
export interface ConversationMessagesPage {
  readonly convo: ConversationSingleton<true>;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
```

The `convo.messages` array in a page should be ordered for display after normalization. The API may query descending for cursor efficiency, but the hook/store boundary should not force UI code to reason about descending pages.

### API route changes

Update:

- `apps/web-next/src/app/api/users/[userId]/chat/[conversationId]/route.ts`
- `apps/web-next/src/app/api/users/[userId]/chat/[conversationId]/messages/[cursorId]/route.ts`

to return `ConversationMessagesPage`, not raw conversations.

Implementation rule:

- fetch `take + 1` rows when possible
- `hasMore = rows.length > take`
- page rows = first `take`
- `nextCursor = oldestMessage.id` when `hasMore`, else `null`
- return `convo` with the page rows only

If the service layer continues to return `ConversationSingleton<true>`, add a new explicit method such as `getConversationMessagesPage` instead of overloading current route-props helpers.

### SWR hook role

`useConversationMessages` should not become the transcript store. It should be a loader:

- fetch pages
- expose `loadMore`, loading flags, and errors
- call store hydration through a bridge hook

Add a bridge hook:

```ts
useHydrateChatStoreFromSWR({
  store,
  userId,
  conversationId
});
```

Rules:

- return no SWR key for `"home"` and `"new-chat"`
- disable focus/reconnect revalidation
- never append final websocket messages directly into SWR as the primary path
- optional: after a final response commit, SWR cache may be updated for cache coherence, but the UI still reads from the store

## 10. Route Strategy

The target route should not server-fetch the transcript.

### Target

`apps/web-next/src/app/(chat)/chat/[conversationId]/page.tsx` should become a thin server shell:

- read route param
- render client chat surface with `conversationId`
- do not call `getConversationRouteProps`
- do not fetch full messages

Auth can stay in `apps/web-next/src/app/(chat)/layout.tsx`, which already calls `getSession()` and redirects unauthenticated users.

`generateMetadata` can be handled in one of three ways:

1. Keep a cheap title-only DB query for existing conversations.
2. Use generic metadata such as `Chat`.
3. Move title updates fully client-side.

Recommended first pass: keep metadata simple and do not let metadata concerns preserve heavy transcript fetching.

### Staging recommendation

Do not combine all risky changes blindly. Land in this order:

1. Store core under current route seed.
2. Store-backed context and `ChatInterface`.
3. API page-shape fix.
4. SWR hydration bridge.
5. Remove route transcript fetch.

This still reaches the client-shell target, but each step has a smaller failure surface.

## 11. `ChatInterface` Migration

`apps/web-next/src/ui/chat/dynamic/index.tsx` should stop owning canonical `messages`.

Keep local UI-only state:

- queued prompt
- whether initial prompt has been consumed
- sessionStorage restoration for home/new-chat handoff
- input-local flow state that is not transcript truth

Move out of local component state:

- committed message list
- streaming assistant message
- completion finalization
- id reconciliation
- image-gen final attachment reconciliation

New shape:

```ts
const { store, sendChat, isConnected, ...status } = useAIChatContext();
const messages = useChatMessages(store);
const draft = useChatDraft(store);
const feedMessages = useMemo(
  () => appendDraft(messages, draft, adapterContext),
  [messages, draft, adapterContext]
);
```

`handleUserMessage` should:

1. build the optimistic user message through a helper or `useSendChat`
2. call `sendChat(payload)`
3. not call `setMessages`

The existing optimistic attachment workup can be reused, but the final persisted attachment state should come from the committed server message.

## 12. Rendering Performance Plan

The store design alone is not enough if the feed still re-renders every expensive row.

### Required invariants

- chunk updates do not change committed message object identities
- chunk updates do not change `committedList` reference
- only the draft selector changes per chunk
- final response changes the committed list once
- old messages are not rebuilt on every render

### Component changes

Wrap `MessageBubble` in `React.memo` after ensuring props are stable enough to make memoization useful.

Current `ChatFeed` passes several live props to every `MessageBubble`, even though only the streaming message uses them. That still changes the parent render. The first acceptable step is:

- keep live props undefined for non-streaming messages
- memoize `MessageBubble`
- preserve message object identity from the store

A stronger second step is to split:

- `CommittedMessageList`
- `StreamingDraftBubble`

so committed rows are insulated from draft updates more completely.

### Console noise

`ChatFeed` and `MessageBubble` currently log image-gen fields in effects. Remove or gate those logs during implementation. They become extremely noisy when testing chunk performance.

## 13. Message Ordering and Identity

The store should normalize all message order. Avoid having SWR, route props, and UI each invent ordering rules.

Rules:

- committed display order is ascending by `createdAt`
- if `createdAt` ties, preserve prior order
- optimistic messages append at the end
- final server AI messages append at the end unless already present
- older SWR pages prepend/merge without moving newer messages incorrectly
- duplicate ids are ignored or updated in place

When replacing an optimistic user id with a server id:

- prefer server message from history if present
- otherwise replace the map key while preserving display position
- avoid rendering both temp and real user messages

When committing AI response:

- do not depend on the streaming message id
- commit by server message id from `evt.convo.messages[0].id`
- drop the draft

## 14. Image Generation and Thinking

The existing image-gen and thinking behavior should survive, but ownership changes.

During chunks:

- draft accumulates `imgGenFields`
- partial images remain draft-only display state
- thinking text and durations derive from message blocks when present
- legacy thinking fields remain supported

On final response:

- committed message attachments come from `evt.convo.messages[0].attachments`
- final image-gen output comes from that committed message, not from remapping partial draft fields
- draft image-gen fields are cleared

`draft-to-message.ts` can still convert draft image-gen fields into temporary attachments for progressive rendering, using `normalizeImgGenFields`. That adapter is display-only.

## 15. Error Handling

Expected stream failures should be state transitions, not thrown exceptions.

Represent protocol failures as typed state:

- missing `evt.convo.messages[0]`
- response conversation id mismatch
- chunk for unknown conversation id
- duplicate active stream for a user

The UI can expose `error` through `AIChatContext` as today. The store should not throw during websocket event handling unless the failure is truly programmer error. A bad event should not break the subscription loop.

## 16. Type Discipline

Follow the repository rules strictly.

No `any`. Use `unknown` and narrow.

No bare `as` assertions. Prefer `satisfies`. Use `as const` for literal discriminants. If an assertion is unavoidable, use the established `satisfies X as X` overload-resolution pattern only in the narrow overload implementation case.

No `.filter(Boolean)`. Use explicit predicates.

Use `Array.of<T>()` for typed empty arrays.

Use explicit path imports with `.ts` or `.tsx` extensions for local modules.

Use `import type` for type-only imports.

Let TypeScript infer private helper return types unless an explicit public contract is needed.

Use generic `res.json<T>()` and `JSON.parse<T>()` from the repo augmentations instead of assertions.

## 17. Implementation Sequence

### Phase 1: Store core, no route change yet

Create store files and tests or a small reducer harness.

Implement:

- snapshot constants
- subscription mechanism
- selector hook
- message block helpers
- `hydrateMessages`
- `beginSend`
- `applyChunk`
- `applyResponse`
- `applyError`
- `resetStreamingState`

Wire websocket events into the store registry through `client.addListener`.

At the end of this phase, the store should be able to process mocked chunk/response/error events without React.

### Phase 2: Store-backed `AIChatContext`

Rewrite `AIChatProvider` as a facade.

Move send payload construction into `useSendChat`.

Keep the public context shape as stable as practical.

Remove the websocket event handlers from `AIChatProvider`; they should now live in the store/registry.

### Phase 3: `ChatInterface` reads from store

Remove local canonical `messages` state from `dynamic/index.tsx`.

Use:

- `useChatMessages(store)`
- `useChatDraft(store)`
- `appendDraft`
- `sendChat`

Keep only UI-local prompt/sessionStorage state.

Seed the store from existing `initialMessages` temporarily so this phase can land before route conversion.

### Phase 4: API page-shape fix and SWR hydration

Change the message API routes to return `ConversationMessagesPage`.

Update `use-conversation-messages.ts` so its expected shape matches the API.

Add the SWR-to-store hydration bridge.

Verify pagination and ordering.

### Phase 5: Client-shell chat route

Remove heavy `getConversationRouteProps` transcript fetching from `[conversationId]/page.tsx`.

Pass only route params and user/session shell data into the client chat surface.

Let SWR hydrate history after mount.

Keep or simplify metadata without reintroducing full transcript loading.

### Phase 6: Cleanup

Delete unused helper paths:

- `createAIMessage` if only used for synthetic finalization
- `finalizeStreamingMessage`
- obsolete `currentStreamingMessage` construction if no consumer needs it

Remove debug logs and stale comments.

Narrow sidebar subscription so it does not re-render per token.

## 18. File-Level Change List

Create:

- `apps/web-next/src/stores/chat/chat-store-types.ts`
- `apps/web-next/src/stores/chat/chat-store.ts`
- `apps/web-next/src/stores/chat/chat-store-registry.ts`
- `apps/web-next/src/stores/chat/chat-message-workup.ts`
- `apps/web-next/src/hooks/use-chat-store-selector.ts`
- `apps/web-next/src/hooks/use-send-chat.ts`
- `apps/web-next/src/lib/draft-to-message.ts`

Modify:

- `apps/web-next/src/context/ai-chat-context.tsx`
- `apps/web-next/src/context/chat-ws-context.tsx`
- `apps/web-next/src/hooks/use-chat-ws.ts`
- `apps/web-next/src/hooks/use-conversation-messages.ts`
- `apps/web-next/src/ui/chat/dynamic/index.tsx`
- `apps/web-next/src/ui/chat/chat-feed/index.tsx`
- `apps/web-next/src/ui/chat/message-bubble/index.tsx`
- `apps/web-next/src/ui/chat/sidebar/index.tsx`
- `apps/web-next/src/app/(chat)/chat/[conversationId]/page.tsx`
- `apps/web-next/src/app/api/users/[userId]/chat/[conversationId]/route.ts`
- `apps/web-next/src/app/api/users/[userId]/chat/[conversationId]/messages/[cursorId]/route.ts`
- `apps/web-next/src/orm/user-message-service.ts`
- `apps/web-next/src/types/ui.ts`
- `apps/web-next/src/lib/ui-message-helpers.ts`

Do not modify:

- `apps/web`
- `apps/ws-server`
- `packages/types` unless the backend contract actually changes
- package manifests or dependencies

## 19. Acceptance Criteria

Functional:

- existing conversation opens without server-fetching the full transcript in the route
- SWR loads the first persisted page
- older messages load through cursor pagination
- sending in an existing conversation shows optimistic user message, streaming draft, then final committed AI message
- sending from `new-chat` preserves optimistic/draft state through real-id transition
- `ai_chat_response.convo.messages[0]` is the only source for the final AI message
- no duplicate user or AI messages after completion
- image-gen partials render during streaming and final images render from committed attachments
- thinking blocks render live and final
- errors stop streaming without destroying persisted history

Performance:

- chunk updates do not rebuild committed message arrays
- committed message rows do not re-render per token after `MessageBubble` memoization
- 400 to 600+ message conversations remain responsive during streaming
- sidebar does not re-render on every token

Type/code quality:

- no `any`
- no `.filter(Boolean)`
- no bare return assertions
- no new dependencies
- no route or store code that uses exceptions for normal control flow
- no new broad context state that competes with the store

## 20. Verification Plan

Run:

```bash
pnpm --filter=@slipstream/web-next typecheck
pnpm --filter=@slipstream/web-next lint
pnpm --filter=@slipstream/web-next build
```

Manual scenarios:

- Open a long existing conversation and verify first-page hydration.
- Load older pages and verify order is stable.
- Send a text prompt in an existing conversation.
- Send a prompt from `/chat/new-chat`.
- Send with uploaded attachments.
- Send with image generation enabled.
- Use a reasoning model that emits thinking blocks.
- Force or simulate `ai_chat_error`.
- Disconnect and reconnect websocket, then send again.

Instrumentation:

- Temporarily expose a dev-only `window.__chatStoreSnapshot` function if useful.
- Use React DevTools Profiler on a long conversation.
- Verify only the streaming draft path updates per chunk.
- Verify final response causes one committed-list update.

## 21. Risks and Mitigations

Risk: selector hook returns fresh objects and causes React update loops.

Mitigation: cache selected values and return previous references when equal. Keep `getServerSnapshot` a stable module constant.

Risk: `new-chat` rekey causes a route refresh that wipes in-flight state.

Mitigation: use store registry rekey plus shallow history replacement mid-stream. Defer router synchronization until completion if needed.

Risk: SWR page ordering conflicts with store ordering.

Mitigation: normalize order only in the store. API/hook can fetch efficiently, but the store owns display order.

Risk: optimistic user id and server user id duplicate.

Mitigation: keep an `optimisticToServerId` registry and replace keys/positions deliberately when server ids arrive.

Risk: image-gen finalization regresses.

Mitigation: keep draft image-gen adapter for progressive display, but assert final display comes from committed server attachments.

Risk: route conversion obscures store bugs.

Mitigation: land store under current route seed first, then remove route transcript fetch after store correctness is proven.

## 22. Final Recommendation

Use Claude's store-core rigor, keep the earlier GPT recommendation that `AIChatContext` remains as a store-backed facade, and include Grok's CSR/SWR target as the end-state rather than as an unstructured first edit.

The most important boundary is this:

- Store owns chat state.
- Context exposes chat ergonomics.
- SWR loads cold history.
- Websocket commits live truth.
- React renders selected slices.

That boundary is what makes React the "sweet summer child" instead of the load-bearing transcript engine.

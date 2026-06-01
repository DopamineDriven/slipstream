# React Sweet Summer Child v2: `web-next` Chat Store Architecture

## 0. Thesis

`apps/web-next` should make React a renderer and subscriber, not the load-bearing transcript engine.

The final chat transcript should be owned by one first-party external store using `useSyncExternalStore`. `AIChatContext` should remain, but only as a store-backed facade for ergonomics and dependency wiring. SWR should load cold persisted history into the store. The websocket stream should update provisional draft state during chunks and commit final truth from `ai_chat_response.convo.messages[0]`.

This plan is `apps/web-next` only. Do not touch `apps/web`, `apps/ws-server`, or `packages/*` except to read shared type contracts.

## 1. Boundary

- Store owns chat state.
- Context exposes chat ergonomics.
- SWR loads cold history.
- WebSocket commits live truth.
- React renders selected slices.

That boundary is the important decision. Everything else is implementation detail in service of it.

## 2. Current Facts

The current implementation has three competing owners of chat state.

`apps/web-next/src/app/(chat)/chat/[conversationId]/page.tsx` server-fetches route props through `getConversationRouteProps(conversationId)`. For existing conversations, that reaches `getMessagesByConversationIdWithAssets`, which eagerly loads the full transcript and passes it to the client as `initialMessages`. This is the wrong cost profile for 400 to 600+ message conversations.

`apps/web-next/src/context/ai-chat-context.tsx` is the current stream conductor. It owns active conversation id, title, streamed text, thinking state, message blocks, message ids, image-gen fields, completion flags, error state, duplicate-send guards, URL transition state, and websocket handlers. Every hot chunk path changes React context state.

`apps/web-next/src/ui/chat/dynamic/index.tsx` owns a second timeline with local `messages` state. It starts from `initialMessages`, inserts optimistic user messages, synthesizes streaming assistant messages, patches attachment URLs, and finalizes assistant messages with `finalizeStreamingMessage`.

The backend already returns the final assistant message. `packages/types/src/events.ts` defines `AIChatResponse` with:

```ts
convo: ConversationSingleton<true>;
```

and that `convo` contains exactly the latest persisted AI message. The frontend should commit that message directly instead of reconstructing the final assistant message from chunk state.

There is also a SWR/API mismatch. `apps/web-next/src/hooks/use-conversation-messages.ts` expects `{ convo, nextCursor, hasMore }`, but the two chat message API routes currently return raw conversation singletons. The hook is currently a good workup, not a correct integration.

Additional verified constraints:

- `useAIChatContext()` currently has exactly two consumers: `ui/chat/dynamic/index.tsx` and `ui/chat/sidebar/index.tsx`.
- `AIChatProvider` mounts once under `app/(chat)/layout.tsx`.
- `ChatWebSocketClient.addListener` is the safe multi-listener seam for the store; `client.on(event, handler)` is a single-handler registry and should not be used for store fan-out.
- `Message.id` uses `cuid(2)`, so message ids are not a chronological ordering source.
- JSON responses serialize `Date` values to strings, so store ordering must normalize `createdAt` with `new Date(value).getTime()`.

## 3. Locked Decisions

1. Build the store core first while the existing route can still seed `initialMessages`.
2. Keep `AIChatContext`, but rewrite it as a thin store-backed facade.
3. Keep the `streaming-<conversationId>` sentinel during migration so `ChatFeed` and `MessageBubble` can continue speaking the current display protocol.
4. Treat `ai_chat_chunk` as provisional draft display only.
5. Treat `ai_chat_response.convo.messages[0]` as the authoritative final assistant message.
6. Make the fully client route the target end-state, but do it after the store is proven.
7. Do not add state libraries, zod, or dependencies.

## 4. Target Data Flow

### Existing Conversation

1. User navigates to `/chat/<conversationId>`.
2. Client chat surface resolves the active chat store.
3. SWR fetches page 0 of persisted history.
4. The SWR bridge calls `store.hydratePage(page)`.
5. UI reads committed messages from `useChatMessages(store)`.
6. User sends a prompt.
7. Store inserts optimistic user message and emits `ai_chat_request` through the existing websocket context.
8. `ai_chat_chunk` updates only draft stream state.
9. `ai_chat_response` commits `evt.convo.messages[0]`, clears draft state, and completes the stream.

### New Chat

1. Store starts under the literal conversation id `"new-chat"`.
2. First send inserts an optimistic user message and sets phase to `"awaiting-id"`.
3. First chunk or response with a real `conversationId` triggers registry rekey from `"new-chat"` to the real id.
4. URL is replaced shallowly with `/chat/<realId>` without triggering a server refetch mid-stream.
5. Final response commits `evt.convo.messages[0]`.

### Pagination

1. User requests older messages.
2. SWR loads the next cursor page.
3. Store merges the page by id.
4. Store owns display ordering and preserves unchanged message object identity.

## 5. New State Layer

Use `apps/web-next/src/state/chat/` for the chat state machine. This makes the role clearer than a generic `stores` folder and keeps it separate from UI hooks and transport utilities.

No barrel exports. Import explicit files with `.ts` extensions.

Create:

- `apps/web-next/src/state/chat/chat-store-types.ts`
- `apps/web-next/src/state/chat/chat-message-workup.ts`
- `apps/web-next/src/state/chat/chat-store.ts`
- `apps/web-next/src/state/chat/chat-store-registry.ts`
- `apps/web-next/src/hooks/use-chat-store-selector.ts`
- `apps/web-next/src/hooks/use-send-chat.ts`
- `apps/web-next/src/hooks/use-hydrate-chat-store-from-swr.ts`
- `apps/web-next/src/lib/draft-to-message.ts`

## 6. Snapshot Contract

`chat-store-types.ts` should define the immutable public state:

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

Implementation details:

- expose readonly snapshots
- publish a new top-level snapshot for every real transition
- keep a single frozen `EMPTY_SNAPSHOT` for `getServerSnapshot`
- preserve unchanged nested references intentionally
- never rebuild `committedList` during `ai_chat_chunk`

## 7. Store Internals

Each `ChatStore` should be a plain TypeScript class with no React imports.

Private registries:

```ts
private byId = new Map<string, MessageSingleton<true>>();
private messageIds = Array.of<string>();
private committedList = Array.of<MessageSingleton<true>>();
private optimisticToServerId = new Map<string, string>();
```

Public API:

```ts
subscribe(listener: () => void): () => void
getSnapshot(): ChatSnapshot
getServerSnapshot(): ChatSnapshot
hydratePage(page: ConversationMessagesPage): void
hydrateMessages(params: HydrateMessagesParams): void
prependHistory(params: PrependHistoryParams): void
beginSend(params: BeginSendParams): void
applyChunk(evt: EventTypeMap["ai_chat_chunk"]): void
applyResponse(evt: EventTypeMap["ai_chat_response"]): void
applyError(evt: EventTypeMap["ai_chat_error"]): void
adoptSnapshot(params: AdoptSnapshotParams): void
clearError(): void
resetStreamingState(): void
```

Do not expose generic public mutation such as `setState(partial)`.

## 8. Reducer Semantics

### `hydratePage`

Purpose: merge persisted history into the committed timeline.

Rules:

- ignore pages for a different conversation id
- merge by message id
- preserve existing object identity for unchanged messages
- do not clear an active draft
- do not duplicate optimistic user messages
- sort committed display order through the store comparator
- publish only if selected state actually changes

### `beginSend`

Purpose: insert optimistic user message and enter streaming state.

Rules:

- append optimistic user message to committed messages
- clear previous transient stream state
- create empty draft
- set `phase = "awaiting-id"` for `"new-chat"`, otherwise `"streaming"`
- set `isWaitingForRealId` only for `"new-chat"`
- set `currentUserMsgId` to the optimistic id
- keep duplicate-send guards outside React state

### `applyChunk`

Purpose: update provisional assistant draft.

Rules:

- never mutate committed message registries
- update only draft and status fields
- merge `messageBlocks` by ordinal
- derive text from `TEXT` blocks
- derive thinking from `THINKING` and `ENCRYPTED_THINKING` blocks
- preserve legacy `chunk`-only handling
- accumulate image-gen partial fields without dropping prior partials
- update current ids when event ids are present
- request `new-chat` rekey when a real conversation id first appears
- keep `snapshot.committedList` referentially identical before and after the chunk

### `applyResponse`

Purpose: commit the server-persisted assistant message.

Rules:

- read `const committed = evt.convo.messages.at(0)`
- if missing, transition to typed protocol error state
- reconcile optimistic user id with `evt.userMsgId`
- commit persisted AI message by `committed.id`
- clear the draft and synthetic streaming representation
- update title if present
- set `isStreaming = false`
- set `isComplete = evt.done`
- set `isWaitingForRealId = false`
- never call `finalizeStreamingMessage`
- do not reconstruct final attachments from draft image-gen fields

The final assistant message comes from the backend payload.

### `applyError`

Purpose: stop the stream without destroying committed history.

Rules:

- clear draft
- set `phase = "error"`
- set `error = evt.message`
- set `isStreaming = false`
- set `isComplete = true`
- preserve committed messages and the optimistic user message
- update ids from the event when present
- follow a real conversation id if the event provides one

## 9. Registry and Rekeying

`chat-store-registry.ts` owns stores keyed by conversation id:

```ts
private readonly storesByConversationId = new Map<string, ChatStore>();
```

Responsibilities:

- `getOrCreate(conversationId)`
- `bindClient(client)`
- `unbindClient(client)`
- route `ai_chat_chunk`, `ai_chat_response`, and `ai_chat_error`
- rekey `"new-chat"` to a real id
- expose a rekey callback for the facade/router bridge

Use `client.addListener(listener)`, not `client.on("ai_chat_chunk", handler)`, because the latter is a single-handler registry and risks replacing unrelated handlers.

`rekey("new-chat", realId)` rules:

- valid only from `"new-chat"` to a real id
- transplant source snapshot into the real-id store
- rewrite draft and optimistic message conversation ids where needed
- update registry atomically
- delete the `"new-chat"` slot so repeated rekey attempts are harmless
- call `window.history.replaceState(null, "", "/chat/" + realId)` once
- do not force Next server navigation mid-stream

## 10. Selector Hooks

Use `useSyncExternalStore`, but never encourage broad snapshot subscriptions.

```ts
function useChatStoreSelector<TSelected extends unknown>(
  store: ChatStore,
  selector: (snapshot: ChatSnapshot) => TSelected,
  isEqual?: (left: TSelected, right: TSelected) => boolean
): TSelected;
```

The hook must cache selected values. If the snapshot version changes but `isEqual` says the selected value is unchanged, return the previous selected reference.

Dedicated hooks:

- `useChatMessages(store)` returns `committedList`
- `useChatDraft(store)` returns `draft`
- `useChatStatus(store)` returns flags, title, current ids
- `useChatError(store)` returns error state

Do not add a general `useChatSnapshot()` export in the first implementation. It invites broad invalidation.

## 11. `AIChatContext` Facade

Keep:

- `AIChatProvider`
- `useAIChatContext`

Change their role.

The provider should wire dependencies:

- `useChatWebSocketContext()` for `client`, `sendEvent`, `isConnected`
- `useModelSelection()` for selected model/provider
- `useApiKeys()` for provider key context
- `useAssetUpload()` for batch and optimistic attachment helpers
- `useCookiesCtx()` for request metadata
- path-derived conversation id
- router only for deliberate post-rekey synchronization

The facade should expose the existing practical context shape:

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

The facade should not:

- own committed messages
- own draft stream state
- register chat websocket handlers that mutate React state
- mirror state into refs
- synthesize final assistant messages
- patch ids through effects

`store` should be exposed on the context value during migration so `ChatInterface` can subscribe directly with focused hooks.

## 12. Send Path

Move send assembly into `apps/web-next/src/hooks/use-send-chat.ts`.

Responsibilities:

- read selected model/provider
- read provider key context
- read cookies and build `AIChatRequest.metadata`
- choose attachment batch id
- build optimistic user message with existing helper patterns
- call `store.beginSend(...)`
- emit `sendEvent("ai_chat_request", payload)`
- rotate asset batch for the next send
- keep the 500ms duplicate-message guard
- keep the one-active-stream-per-user guard

This hook can consume existing contexts, but it should not own canonical chat state.

## 13. Draft Adapter

`apps/web-next/src/lib/draft-to-message.ts` maps draft state into the current display protocol.

It should provide:

```ts
draftToStreamingMessage(draft, ctx)
appendDraft(messages, draft, ctx)
```

Rules:

- synthetic id is `streaming-<conversationId>`
- sender type is AI
- message blocks come from `toMessageBlocks`
- progressive image-gen attachments come from `normalizeImgGenFields`
- adapter is display-only
- final persisted message still comes from `evt.convo.messages[0]`

This lets the first migration preserve `ChatFeed` and `MessageBubble` behavior with minimal UI churn.

## 14. SWR and API Contract

Define one shared page type in `apps/web-next/src/types/ui.ts` or a chat-specific type file:

```ts
export interface ConversationMessagesPage {
  readonly convo: ConversationSingleton<true>;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
```

Add a service method such as:

```ts
getConversationMessagesPage(conversationId, take, cursorId?)
```

Rules:

- query messages by `createdAt desc` for cursor efficiency
- fetch `take + 1` rows
- `hasMore = rows.length > take`
- page rows are the first `take`
- `nextCursor` is the oldest returned page row id when `hasMore`, otherwise `null`
- include the existing message relations needed by the UI
- reuse existing bigint conversion workup
- return `satisfies ConversationMessagesPage`

Update both API routes:

- `apps/web-next/src/app/api/users/[userId]/chat/[conversationId]/route.ts`
- `apps/web-next/src/app/api/users/[userId]/chat/[conversationId]/messages/[cursorId]/route.ts`

`use-conversation-messages.ts` should become a loader:

- fetch pages
- expose `loadMore`, loading flags, and errors
- skip `"home"` and `"new-chat"`
- keep focus/reconnect revalidation disabled
- delete direct transcript mutation helpers such as `appendMessage` and `removeMessage`
- delete the current `conversation` memo once the store is the read model

Add `useHydrateChatStoreFromSWR({ store, userId, conversationId })` to feed settled pages into `store.hydratePage`.

Do not make SWR the live transcript authority.

## 15. Ordering

The store owns display order. Do not let route props, SWR page order, and UI mapping each define their own order.

DB pages can be fetched descending. The store should normalize with a comparator:

```ts
function messageComparator(
  left: MessageSingleton<true>,
  right: MessageSingleton<true>
) {
  const leftTime = new Date(left.createdAt).getTime();
  const rightTime = new Date(right.createdAt).getTime();
  if (leftTime !== rightTime) return leftTime - rightTime;

  const leftSender = left.senderType === "USER" ? 0 : 1;
  const rightSender = right.senderType === "USER" ? 0 : 1;
  if (leftSender !== rightSender) return leftSender - rightSender;

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
```

Why:

- `createdAt` is the chronological source.
- `createdAt` may be a `Date` in TypeScript or an ISO string after JSON.
- `cuid(2)` ids are not chronological.
- user-before-AI is a sensible tie-break within a turn.

Merge precedence:

- existing local optimistic/committed rows win over older history rows for the same id
- websocket `applyResponse` overwrites by id because it is the authoritative final payload
- optimistic temp id is replaced deliberately when server user id arrives

## 16. Route Strategy

End-state: `apps/web-next/src/app/(chat)/chat/[conversationId]/page.tsx` should not fetch the transcript.

Target behavior:

- read route param
- render client chat surface
- no `getConversationRouteProps`
- no full transcript fetch
- auth remains in `(chat)/layout.tsx`
- skeleton/loading state moves into the client surface and follows SWR status

Metadata options:

- keep a cheap title-only query temporarily
- use generic metadata
- move title fully client-side

Do not let metadata preserve the heavy transcript fetch.

The route conversion is intentionally late in the sequence. First prove the store under the current seed path, then remove the server transcript fetch.

## 17. `ChatInterface` Migration

`apps/web-next/src/ui/chat/dynamic/index.tsx` should stop owning canonical `messages`.

Keep UI-local concerns:

- queued prompt
- initial prompt consumed flag
- sessionStorage handoff from home/new-chat
- local input flow details

Remove from component state:

- committed timeline
- streaming assistant timeline entry
- finalization effect
- id reconciliation effect
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

`handleUserMessage` should call the send hook/action, not `setMessages`.

During the store-core phase, `ChatInterface` may seed the store from existing `initialMessages`. That compatibility path should be removed after the route becomes client-hydrated through SWR.

## 18. Rendering Performance

Store invariants:

- chunk updates do not change committed message object identities
- chunk updates do not change `committedList`
- only draft selectors change per chunk
- final response causes one committed-list update

Component changes:

- wrap `MessageBubble` in `React.memo`
- pass live props as `undefined` for non-streaming messages
- preserve message object identity from the store
- remove or gate image-gen debug `console.log` effects in `ChatFeed` and `MessageBubble`
- verify `ChatFeed` auto-scroll still keys from draft text/thinking changes

Optional later refinement:

- split `CommittedMessageList` and `StreamingDraftBubble`

Do not make that split mandatory in the first pass if the sentinel adapter plus memoization achieves the performance invariant.

## 19. Image Generation and Thinking

During chunks:

- draft accumulates `imgGenFields`
- draft owns partial image display
- text and thinking derive from message blocks when present
- legacy chunk/thinking fields remain supported

On final response:

- committed message attachments come from `evt.convo.messages[0].attachments`
- final image output comes from committed attachments
- draft image-gen fields are cleared
- no final attachment ids are rewritten from draft state

## 20. Error Handling

Expected stream/protocol failures should become typed state transitions:

- missing `evt.convo.messages[0]`
- chunk for unknown conversation
- response conversation mismatch
- duplicate active stream

A bad websocket event should not break the subscription loop. Surface error state through `AIChatContext` as today.

## 21. Type Discipline

Follow repo rules:

- no `any`
- no `@ts-ignore`
- no `@ts-expect-error`
- no bare `as` assertions
- use `satisfies`
- use `as const` for literal discriminants
- no `.filter(Boolean)`
- use explicit type predicates
- use `Array.of<T>()` for typed empty arrays
- use explicit `.ts` or `.tsx` local imports
- use `import type`
- let TypeScript infer private helper returns
- use generic `res.json<T>()` and `JSON.parse<T>()`

## 22. Implementation Sequence

### Phase 1: Store Core

Create the state files, selector hook, and registry.

Implement:

- frozen empty snapshot
- subscription mechanism
- `hydrateMessages`
- `hydratePage`
- `beginSend`
- `applyChunk`
- `applyResponse`
- `applyError`
- `resetStreamingState`
- message block helpers
- message comparator

Bind websocket chat events through `client.addListener`.

At the end of this phase, mocked events should prove the store works without React.

### Phase 2: Store-Backed Context

Rewrite `AIChatProvider` as a facade.

Move send assembly into `use-send-chat.ts`.

Remove chat websocket handlers from context.

Preserve the public context shape for existing consumers.

### Phase 3: Chat UI Reads From Store

Remove local canonical `messages` state from `dynamic/index.tsx`.

Use:

- `useChatMessages(store)`
- `useChatDraft(store)`
- `appendDraft`
- `sendChat`

Seed from current `initialMessages` temporarily.

Memoize `MessageBubble`.

Move sidebar to a narrow selector.

This completes the cornerstone unit.

### Phase 4: API Page Shape and SWR Hydration

Add `getConversationMessagesPage`.

Update both message API routes.

Convert `use-conversation-messages.ts` into a loader.

Add `use-hydrate-chat-store-from-swr.ts`.

Verify cursor pagination and ordering.

### Phase 5: Client-Shell Route

Remove `getConversationRouteProps` from the chat page.

Remove full transcript server fetch.

Let SWR hydrate history after mount.

Simplify metadata without reintroducing transcript loading.

### Phase 6: Cleanup

Delete obsolete finalization code:

- `finalizeStreamingMessage`
- `createAIMessage` if it has no remaining caller
- old `initialMessages` compatibility path after SWR route hydration is live
- unused full-transcript route service methods
- debug logs and stale comments

Keep `createUserMessage` if `useSendChat` still uses it.

## 23. File-Level Change List

Create:

- `apps/web-next/src/state/chat/chat-store-types.ts`
- `apps/web-next/src/state/chat/chat-message-workup.ts`
- `apps/web-next/src/state/chat/chat-store.ts`
- `apps/web-next/src/state/chat/chat-store-registry.ts`
- `apps/web-next/src/hooks/use-chat-store-selector.ts`
- `apps/web-next/src/hooks/use-send-chat.ts`
- `apps/web-next/src/hooks/use-hydrate-chat-store-from-swr.ts`
- `apps/web-next/src/lib/draft-to-message.ts`

Modify:

- `apps/web-next/src/context/ai-chat-context.tsx`
- `apps/web-next/src/context/chat-ws-context.tsx`
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
- `packages/*`
- package manifests
- dependencies

## 24. Acceptance Criteria

Functional:

- existing conversations hydrate from SWR pages
- route no longer server-fetches the full transcript in the final phase
- older messages load through cursor pagination
- existing conversation send path shows optimistic user, streaming draft, final committed AI message
- `new-chat` transitions to real id without losing optimistic/draft state
- `ai_chat_response.convo.messages[0]` is the only final AI message source
- no duplicate user or AI messages after completion
- image-gen partials render live and final images render from committed attachments
- thinking blocks render live and final
- error events stop streaming without deleting committed history

Performance:

- chunks do not rebuild committed arrays
- committed message rows do not re-render per token
- sidebar does not re-render per token
- 400 to 600+ message conversations remain responsive while streaming

Quality:

- no new dependencies
- no broad context state competing with the store
- no exceptions for expected control flow
- no type-rule violations

## 25. Verification

Run from the repository root:

```bash
pnpm --filter=@slipstream/web-next typecheck
pnpm --filter=@slipstream/web-next lint
pnpm build:web-next
```

The first command uses the package `typecheck` script, which runs `tsgo --noEmit`. The build command should go through the root Turbo script, not a scoped package build.

Manual checks:

- open a long existing conversation
- verify first-page hydration
- load older pages and verify order
- send in an existing conversation
- send from `/chat/new-chat`
- send with attachments
- send with image generation enabled
- use a reasoning model with thinking blocks
- simulate `ai_chat_error`
- disconnect/reconnect websocket and send again

Instrumentation:

- optionally expose a dev-only `window.__chatStoreSnapshot`
- profile a long conversation with React DevTools
- verify only draft path updates per chunk
- verify final response causes one committed-list update

## 26. Risks and Mitigations

Risk: selector returns fresh objects and causes update loops.

Mitigation: cache selected values and return previous references when equal. Keep `getServerSnapshot` stable.

Risk: `new-chat` rekey causes route refresh and wipes in-flight state.

Mitigation: registry rekey plus shallow `replaceState`; defer router synchronization until completion if needed.

Risk: SWR page ordering conflicts with UI order.

Mitigation: store owns ordering with one comparator.

Risk: optimistic and server user ids duplicate.

Mitigation: use `optimisticToServerId` and replace keys/positions deliberately.

Risk: image-gen finalization regresses.

Mitigation: keep draft adapter for progressive display; final display comes from committed server attachments.

Risk: route conversion hides store bugs.

Mitigation: land store under current route seed first, then remove server transcript fetch.

## 27. Final Recommendation

Build the store core first. Demote `AIChatContext` to a store-backed facade. Let SWR hydrate cold pages into the store. Let websocket responses commit final persisted messages. Render selected slices only.

The route can become fully client after the store is proven. The cornerstone is the state boundary, not the route edit.

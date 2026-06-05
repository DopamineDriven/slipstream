# React Sweet Summer Child v3: `web-next` Chat Store Architecture

## 0. Executive Boundary

`apps/web-next` chat should use one first-party external chat store as the transcript state machine. React should render selected slices. `AIChatContext` should remain as a thin ergonomic facade, not as the owner of canonical chat state.

The boundary is unchanged:

- Store owns chat state.
- Context exposes chat ergonomics.
- SWR loads cold history.
- WebSocket commits live truth.
- React renders selected slices.

The v3 changes are not a re-architecture. They are hardening corrections from the latest verification pass and the router note:

- preserve the new-chat router deception protocol exactly
- use React's official selector shim instead of a hand-rolled selector cache
- prevent SSR cross-request store leakage
- bind the registry to the current websocket client lifecycle
- handle disconnect/orphaned stream behavior
- ship scroll anchoring with upward pagination
- reconcile optimistic user messages, especially attachments
- keep reactions consistent after store row replacement

This plan targets `apps/web-next`. Shared package edits are avoided unless explicitly called out as a separate contract decision.

## 1. Current-State Facts

`apps/web-next/src/app/(chat)/chat/[conversationId]/page.tsx` currently server-fetches route props through `getConversationRouteProps(conversationId)`. Existing conversations go through `getMessagesByConversationIdWithAssets`, which loads the full transcript and passes it to the client as `initialMessages`.

`apps/web-next/src/context/ai-chat-context.tsx` currently owns stream state, message ids, thinking state, image-gen fields, duplicate-send guards, router transition flags, and websocket chat handlers.

`apps/web-next/src/ui/chat/dynamic/index.tsx` currently owns a second local `messages` timeline. It inserts optimistic user messages, builds a synthetic streaming assistant message, patches attachment URLs, and finalizes with `finalizeStreamingMessage`.

`packages/types/src/events.ts` already defines `AIChatResponse` with:

```ts
convo: ConversationSingleton<true>;
```

That `convo` contains the latest persisted AI message. The final AI message should come from `evt.convo.messages[0]`, not from client-side reconstruction.

`useAIChatContext()` currently has exactly two consumers:

- `apps/web-next/src/ui/chat/dynamic/index.tsx`
- `apps/web-next/src/ui/chat/sidebar/index.tsx`

This makes the facade migration tractable.

## 2. Non-Negotiable Router Deception Protocol

The new-chat to real-id transition must preserve the existing router deception behavior. This is not optional.

The problem: if Next detects a route change mid-stream, it can re-render and, on a force-dynamic route, refetch. That wipes or flickers streaming UI. The URL should change for the user before the stream finishes, but the Next router must not be notified until completion.

The protocol has three required steps.

### Step 1: Passive Pathname Read Bails During Transition

The facade should have a passive path sync effect, but it must bail when either condition is true:

```ts
isStreaming || urlTransitionInFlight
```

During this period, active conversation id comes from the store/registry rekey callback, not from `usePathname()`.

### Step 2: Shallow `replaceState` on First Real Id

When the first chunk or response carries a real conversation id for a `"new-chat"` stream:

```ts
window.history.replaceState(null, "", `/chat/${realId}`);
```

This happens in the registry rekey path. It updates the browser URL but does not notify Next's router.

The registry sets a transition flag and rekeys the store from `"new-chat"` to `realId`.

### Step 3: Mandatory Router Reconciliation on Completion

When the stream completes, the facade must call:

```ts
router.replace(`/chat/${realId}`, { scroll: false });
```

Then clear the transition flag. This is mandatory, not "if needed." It reconciles Next's internal pathname with the URL after streaming is safe.

## 3. Locked Architecture Decisions

1. Build the store core first while the current route can still seed `initialMessages`.
2. Rewrite `AIChatContext` as a store-backed facade.
3. Keep the `streaming-<conversationId>` sentinel during migration.
4. Treat `ai_chat_chunk` as provisional draft display only.
5. Treat `ai_chat_response.convo.messages[0]` as the authoritative final AI message.
6. Make the fully client chat route the end-state, after store correctness is proven.
7. Consolidate new-chat rekey logic into the store registry.
8. Use `client.addListener`, not `client.on`, for store fan-out.
9. Use React's official selector shim, not a hand-rolled render-time ref cache.

## 4. Selector Decision

Use:

```ts
useSyncExternalStoreWithSelector
```

from:

```ts
use-sync-external-store/shim/with-selector
```

Reasoning:

- it is authored by the React team
- it is already present transitively through SWR in the lockfile
- `web-next` has `reactStrictMode: true`
- `web-next` has `reactCompiler: true`
- hand-rolled render-phase ref mutation is risky under Strict Mode, concurrent rendering, and React Compiler purity assumptions

Recommended implementation decision:

- Add `use-sync-external-store` as an explicit `@slipstream/web-next` dependency, catalog-pinned to the installed `1.6.0`.
- Because this is a package-manifest dependency change, treat it as an explicit approval item during implementation.
- If approval is not granted immediately, do not hand-roll the selector. Either defer selector wiring or accept the transitive import as a temporary implementation detail with a TODO-free tracked follow-up.

The store core remains React-free. Only `apps/web-next/src/hooks/use-chat-store-selector.ts` imports the selector hook.

## 5. Store Location and Files

Use `apps/web-next/src/state/chat/` for the plain state machine.

Create:

- `apps/web-next/src/state/chat/chat-store-types.ts`
- `apps/web-next/src/state/chat/chat-message-workup.ts`
- `apps/web-next/src/state/chat/chat-store.ts`
- `apps/web-next/src/state/chat/chat-store-registry.ts`
- `apps/web-next/src/hooks/use-chat-store-selector.ts`
- `apps/web-next/src/hooks/use-send-chat.ts`
- `apps/web-next/src/hooks/use-hydrate-chat-store-from-swr.ts`
- `apps/web-next/src/lib/draft-to-message.ts`

No barrel exports. Use explicit `.ts` imports.

## 6. Store Snapshot

`chat-store-types.ts` should define readonly public state:

```ts
export type ChatStreamPhase =
  | "idle"
  | "awaiting-id"
  | "streaming"
  | "interrupted"
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
  readonly urlTransitionInFlight: boolean;
  readonly error: string | null;
  readonly byId: ReadonlyMap<string, MessageSingleton<true>>;
  readonly messageIds: readonly string[];
  readonly committedList: readonly MessageSingleton<true>[];
  readonly feedList: readonly MessageSingleton<true>[];
  readonly draft: ChatDraft | null;
  readonly currentUserMsgId: string | null;
  readonly currentAiMsgId: string | null;
  readonly currentImgGenAttachmentId: string | null;
  readonly imgGenEnabled: boolean;
  readonly imgGenFields: AIChatResponseImgGenFieldsFinal | null;
  readonly prependVersion: number;
  readonly version: number;
}
```

Important change from v2: `feedList` may be composed on store mutation, not inside `getSnapshot` or selector calls. This prevents fresh array identities from causing `getSnapshot` instability. `committedList` remains stable across chunks. `feedList` changes when draft display changes.

`getServerSnapshot()` returns one frozen module-level empty snapshot. It must not touch the registry.

## 7. SSR and Registry Safety

The registry must be client-only.

Problem: server components render client component trees during SSR. If the facade calls a module singleton registry during render, a process-global `Map<string, ChatStore>` can leak across users and requests.

Rules:

- Never call `registry.getOrCreate` during server render.
- `getServerSnapshot` returns `EMPTY_SNAPSHOT`.
- Create or resolve stores only on the client, either inside an effect or a client-only lazy path guarded by `typeof window !== "undefined"`.
- The facade can render an empty snapshot on the server and subscribe after hydration.
- Until the route is fully client, SSR fidelity should come from existing route seed or SWR fallback, not from a server-populated external store.

This is a correctness and privacy requirement, not just a memory optimization.

## 8. Registry Responsibilities

`chat-store-registry.ts` owns:

- stores keyed by conversation id
- `getOrCreate(conversationId)` on the client
- `bindClient(client)`
- `unbindClient(client)`
- one stable listener function for `client.addListener`
- routing of `ai_chat_chunk`, `ai_chat_response`, and `ai_chat_error`
- rekey from `"new-chat"` to real id
- a rekey/completion callback for the facade
- bounded eviction
- connectivity interruption notifications

Use:

```ts
client.addListener(listener)
client.removeListener(listener)
```

Do not use `client.on("ai_chat_chunk", handler)` for the store. That registry is single-handler and collides with other subscribers.

## 9. WebSocket Lifecycle Safety

The websocket client identity can change when the user id changes. `client.close()` also clears listeners. Therefore the store registry must bind from an effect keyed on the current client identity:

```ts
useEffect(() => {
  return chatStoreRegistry.bindClient(client);
}, [client]);
```

Requirements:

- listener function identity is stable
- bind is idempotent
- unbind removes only the registry listener for that client
- Strict Mode mount, unmount, remount does not duplicate listeners
- reconnect after provider remount does not leave the store deaf

Do not bind once globally and assume the client never changes.

## 10. Store Internals

Each `ChatStore` should be a plain TypeScript class with no React imports.

Private registries:

```ts
private byId = new Map<string, MessageSingleton<true>>();
private messageIds = Array.of<string>();
private committedList = Array.of<MessageSingleton<true>>();
private feedList = Array.of<MessageSingleton<true>>();
private optimisticToServerId = new Map<string, string>();
private optimisticAttachmentDrafts = new Map<string, string>();
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
markInterrupted(params: MarkInterruptedParams): void
retryInterrupted(params: RetryInterruptedParams): void
reconcileUserId(params: ReconcileUserIdParams): void
patchAttachmentUrls(params: PatchAttachmentUrlsParams): void
patchMessageReaction(params: PatchMessageReactionParams): void
adoptSnapshot(params: AdoptSnapshotParams): void
clearError(): void
resetStreamingState(): void
```

No generic `setState(partial)`.

## 11. Reducer Semantics

### `hydratePage`

- ignore pages for the wrong conversation
- merge by message id
- preserve object identity for unchanged messages
- do not clear an active draft
- do not duplicate optimistic user messages
- sort through the store comparator
- update `committedList` and `feedList` only when necessary

### `beginSend`

- append optimistic user message
- record whether it had attachments
- clear previous transient stream state
- create empty draft
- set `phase = "awaiting-id"` for `"new-chat"`, otherwise `"streaming"`
- set `isWaitingForRealId` only for `"new-chat"`
- set `currentUserMsgId` to optimistic id
- use per-conversation stream guard, not per-user stream guard
- keep duplicate click guard scoped by conversation id and prompt

### `applyChunk`

- update only draft and status
- merge message blocks by ordinal
- derive text from `TEXT` blocks
- derive thinking from `THINKING` and `ENCRYPTED_THINKING`
- preserve legacy chunk-only handling
- accumulate image-gen partials
- preserve `imgGenFields`, `imgGenEnabled`, and `imgGenAttachmentId`
- update current ids when present
- trigger registry rekey when a real id appears for `"new-chat"`
- keep `committedList` referentially stable
- update memoized `feedList` if draft display changes

### `applyResponse`

- read `evt.convo.messages.at(0)`
- if missing, transition to protocol error state
- keep rekey/title source behavior simple:
  - rekey from `evt.conversationId`
  - title from top-level `evt.title`
  - read `evt.convo.conversationSettings` only if a consumer needs it before cold reload
- reconcile optimistic user id from `evt.userMsgId`
- commit persisted AI message by id
- clear draft when safe
- set `isStreaming = false`
- set `isComplete = evt.done`
- set `isWaitingForRealId = false`
- if this was a new-chat transition and `evt.done`, signal facade to run mandatory `router.replace`
- never call `finalizeStreamingMessage`
- do not reconstruct final attachments from draft image-gen fields

### `applyError`

- clear draft
- set `phase = "error"`
- set `error = evt.message`
- set `isStreaming = false`
- set `isComplete = true`
- preserve committed messages and optimistic user message
- follow real conversation id if provided
- clear per-conversation stream guard

### `markInterrupted`

- transition active streaming drafts to `"interrupted"` on disconnect or unrecoverable socket close
- keep draft content visible
- unlock the send guard for that conversation only if the UI is presenting Retry
- do not spin forever

## 12. Store Eviction

The registry needs an eviction policy.

Rules:

- bounded LRU is acceptable
- default cap should be small, such as 12 stores
- update `lastAccess` on `getOrCreate`
- never evict a store with live subscribers
- never evict a store with a non-null draft
- never evict a store in `"streaming"`, `"awaiting-id"`, or `"interrupted"`

Without eviction, navigating many conversations retains all hydrated messages for the tab lifetime.

## 13. Disconnect and Resume

The ws-server already has Redis-backed stream state and sends a catch-up `ai_chat_chunk` after resume is triggered by re-sending `ai_chat_request` for the same conversation.

Web-next minimum behavior:

- detect disconnect or client close while a store is streaming
- mark affected stores as `"interrupted"`
- show a Retry path or auto-resume path based on the product decision
- on retry/auto-resume, re-send the original `ai_chat_request` for that conversation
- accept the catch-up `ai_chat_chunk` as authoritative draft replacement or merge

`stream:resumed` is currently not part of `@slipstream/types` `EventTypeMap`. A web-next-only implementation can ignore that event and rely on the following catch-up `ai_chat_chunk`. If the UI needs a first-class resumed signal, that becomes a shared contract change:

- add `stream:resumed` to `packages/types`
- update client event allowlists and handler maps
- handle it in the store

Because this plan is scoped to `apps/web-next`, the default recommendation is: implement interrupted state plus explicit Retry first, and rely on catch-up chunks.

## 14. Ordering

The store owns message ordering.

Comparator:

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

Reasoning:

- `createdAt` is chronological
- JSON turns dates into strings
- `cuid(2)` ids are not chronological
- user-before-AI is the best deterministic tie-break for a turn

## 15. SWR and API Contract

Define:

```ts
export interface ConversationMessagesPage {
  readonly convo: ConversationSingleton<true>;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
```

Add a service method:

```ts
getConversationMessagesPage(conversationId, take, cursorId?)
```

Rules:

- query descending for cursor efficiency
- fetch `take + 1`
- `hasMore = rows.length > take`
- page rows are first `take`
- `nextCursor` is the oldest page row id when `hasMore`, otherwise `null`
- include message blocks, attachments, TTS job, image-gen job, and attachment metadata needed by the UI
- reuse bigint conversion
- return `satisfies ConversationMessagesPage`

Convert `use-conversation-messages.ts` into a loader:

- fetch pages
- expose `loadMore`, loading flags, and errors
- skip `"home"` and `"new-chat"`
- no focus/reconnect revalidation
- no direct transcript mutation helpers
- no local `conversation` memo as the canonical read model

`use-hydrate-chat-store-from-swr.ts` feeds settled pages into `store.hydratePage`.

## 16. Scroll Anchoring for Upward Pagination

Upward pagination is new. It must ship with `prependHistory`.

Requirements:

- before prepend, capture `scrollHeight`
- after prepend, in layout effect or RAF, set `scrollTop += newScrollHeight - oldScrollHeight`
- suppress bottom auto-scroll during prepend
- drive this from a discriminated store signal such as `prependVersion`
- set `overflow-anchor: none` on the chat scroll container

Do not key this behavior off `messages.length` alone. That conflicts with the existing bottom-scroll behavior.

## 17. Optimistic User Message Fidelity

`ai_chat_response.convo.messages[0]` contains the AI message, not the user message. The optimistic user row must still converge.

Store responsibilities:

- own the optimistic user row
- map optimistic user id to `evt.userMsgId`
- replace the key and preserve display position
- patch attachment URLs as uploads complete
- for attachment-bearing sends, reconcile server-normalized user attachments after completion

Recommended first implementation:

- text-only sends: id reconciliation is enough
- attachment sends: after `applyResponse(done)`, trigger page-0 SWR refetch or mutate to reconcile the user message and attachments

More robust future contract:

- backend includes the persisted user message in the response, either as a dedicated field or by returning the last two messages

Do not let attachment-bearing optimistic user messages remain permanently stuck with draft ids or uploading status.

## 18. Completion Flash and Markdown

The current timers hide a real rendering transition: streaming markdown is synchronous, completed markdown processing is async.

When replacing `streaming-<conversationId>` with the final server AI message:

- avoid a raw-text flash
- keep the committed bubble keyed identically to the draft when possible, preferably by using the known real `aiMsgId`
- pre-warm or preserve markdown cache when swapping draft to committed
- if a remount is unavoidable, keep a short defer before dropping the draft

Do not set completion synchronously and immediately remove the streaming bubble unless the completed-render path is ready.

## 19. Reactions

`useReaction(message)` currently seeds hook-local state from `message.liked` and `message.disliked`. Store row replacement plus `React.memo` can make stale reaction state more visible.

Fix one of these during the store UI phase:

- make `useReaction` re-derive when `message.id`, `message.liked`, or `message.disliked` changes
- or add `store.patchMessageReaction(conversationId, messageId, { liked, disliked })` and call it from the reaction action result

Preferred direction: committed store row is the source of truth, and reaction actions patch the store row.

Do not add websocket reaction reducers unless the server actually emits reaction events.

## 20. Image Generation and Thinking

Do not add `image_gen_*` handlers for this migration. Chat image generation flows through:

- `ai_chat_chunk.imgGenFields`
- `ai_chat_chunk.imgGenEnabled`
- `ai_chat_chunk.imgGenAttachmentId`
- final committed AI message attachments

The draft adapter must preserve those fields for progressive display.

On final response:

- final image output comes from committed server attachments
- draft image-gen fields are cleared
- no final attachment ids are rewritten from draft state

Thinking text should derive from message blocks when present, with legacy chunk fields still supported.

## 21. `AIChatContext` Facade

Keep:

- `AIChatProvider`
- `useAIChatContext`

Facade responsibilities:

- bind/unbind registry to the current websocket client in an effect keyed on `client`
- provide store-selected state
- provide `sendChat`
- provide router deception coordination
- expose `isConnected` from websocket context
- expose `store` during migration

Facade must not:

- own committed messages
- own draft stream state
- register chat websocket handlers through `client.on`
- mirror every store field into refs
- finalize assistant messages

The passive path sync effect lives here and must bail on `isStreaming || urlTransitionInFlight`.

## 22. `ChatInterface` Migration

`dynamic/index.tsx` should keep UI-local state only:

- queued prompt
- initial prompt consumed flag
- sessionStorage handoff
- input-local flow details

Remove local ownership of:

- committed timeline
- streaming assistant row
- finalization effect
- id reconciliation effect
- image-gen final attachment reconciliation

New shape:

```ts
const { store, sendChat, isConnected, ...status } = useAIChatContext();
const messages = useChatMessages(store);
const draft = useChatDraft(store);
const feedMessages = useChatFeed(store);
```

`useChatFeed(store)` can select the store-composed `feedList`.

`handleUserMessage` calls the send action and does not call `setMessages`.

During the store-core phase, `ChatInterface` may seed the store from existing `initialMessages`. Remove that compatibility path after SWR hydration owns cold history.

## 23. Rendering Performance

Store invariants:

- chunks do not rebuild committed arrays
- chunks do not change committed message object identity
- draft updates change `feedList`, not `committedList`
- final response causes one committed-list update

Component changes:

- wrap `MessageBubble` in `React.memo`
- pass live props only to the streaming message
- remove or gate image-gen debug logs in `ChatFeed` and `MessageBubble`
- verify auto-scroll still follows draft text and thinking updates

Optional later improvement:

- split committed list and streaming draft bubble

The first pass can keep the sentinel-in-list approach if memoization and stable identities deliver the target profile.

## 24. Route Strategy

End-state:

- no transcript fetch in `app/(chat)/chat/[conversationId]/page.tsx`
- auth remains in `(chat)/layout.tsx`
- client chat surface receives route params
- SWR hydrates history after mount
- metadata must not preserve full transcript fetch

The route conversion happens after the store is proven under the current route seed.

## 25. Package and Script Changes

The original "no package changes" boundary needs two explicit exceptions if implementation follows v3:

1. Add `use-sync-external-store` as an explicit `@slipstream/web-next` dependency, pending user approval for the manifest change.
2. Add a `test` script to `apps/web-next/package.json` using the existing repo pattern:

```json
"test": "node --test --import tsx --test-reporter spec"
```

This does not install a new test framework. It uses Node's built-in test runner and existing `tsx`, matching `apps/ws-server` and `packages/img-gen`.

## 26. Tests

Add store-core tests with `node:test` and `node:assert/strict`.

Test cases:

- hydrate page merges by id
- repeated hydrate is idempotent
- chunk updates draft and preserves `committedList` reference
- message blocks merge by ordinal
- response commits `evt.convo.messages[0]`
- optimistic user id reconciles to server id
- attachment send triggers user reconciliation path
- new-chat rekey preserves draft and optimistic user message
- interrupted stream transitions to Retry state
- error clears draft but preserves committed messages
- LRU eviction skips subscribed, streaming, and draft stores
- selector subscribers do not re-render for unrelated slices

The reducer layer must be React-free so these tests can run before UI wiring.

## 27. Implementation Sequence

### Phase 1: React-Free Store Core

Create store types, message workup, store class, registry, comparator, and tests.

Implement:

- `EMPTY_SNAPSHOT`
- subscriptions
- `hydratePage`
- `beginSend`
- `applyChunk`
- `applyResponse`
- `applyError`
- `markInterrupted`
- `reconcileUserId`
- `patchAttachmentUrls`
- `patchMessageReaction`
- LRU eviction
- registry rekey

Consolidate duplicate rekey logic here.

### Phase 2: Selector Hook and Facade

Use `useSyncExternalStoreWithSelector`.

Rewrite `AIChatProvider` as a facade.

Bind registry in `useEffect([client])`.

Implement the router deception protocol:

- passive path sync bails during stream or URL transition
- registry shallow `replaceState` on first real id
- mandatory facade `router.replace(..., { scroll: false })` on completion

### Phase 3: UI Reads Store

Move `dynamic/index.tsx` to store selectors.

Memoize `MessageBubble`.

Remove local message reconciliation effects.

Move sidebar to narrow store status selector.

Fix reaction state source.

Handle completion flash.

### Phase 4: SWR/API and Pagination

Add `ConversationMessagesPage`.

Add `getConversationMessagesPage`.

Update both message API routes.

Convert `use-conversation-messages.ts` into a loader.

Add SWR hydration bridge.

Ship scroll anchoring with `prependHistory`.

Add attachment-bearing user-message reconciliation after completion.

### Phase 5: Disconnect Recovery

Add interrupted state UX.

Implement explicit Retry or approved auto-resume.

Web-next-only default: rely on catch-up `ai_chat_chunk` after re-sending request.

If first-class resumed event UI is required, split out a shared contract change for `stream:resumed`.

### Phase 6: Client Route

Remove `getConversationRouteProps` from the chat page.

Remove full transcript server fetch.

Let SWR hydrate after mount.

Simplify metadata without transcript loading.

### Phase 7: Cleanup

Delete obsolete code:

- `finalizeStreamingMessage`
- `createAIMessage` if unused
- old `initialMessages` compatibility path
- unused full-transcript route service methods
- duplicate `conversation-id-context` rekey machinery or reduce it to a store consumer
- debug logs

Keep `createUserMessage` if `useSendChat` uses it.

## 28. File-Level Change List

Create:

- `apps/web-next/src/state/chat/chat-store-types.ts`
- `apps/web-next/src/state/chat/chat-message-workup.ts`
- `apps/web-next/src/state/chat/chat-store.ts`
- `apps/web-next/src/state/chat/chat-store-registry.ts`
- `apps/web-next/src/hooks/use-chat-store-selector.ts`
- `apps/web-next/src/hooks/use-send-chat.ts`
- `apps/web-next/src/hooks/use-hydrate-chat-store-from-swr.ts`
- `apps/web-next/src/lib/draft-to-message.ts`
- `apps/web-next/src/state/chat/chat-store.test.ts`

Modify:

- `apps/web-next/package.json`
- `apps/web-next/src/context/ai-chat-context.tsx`
- `apps/web-next/src/context/chat-ws-context.tsx`
- `apps/web-next/src/context/conversation-id-context.tsx`
- `apps/web-next/src/hooks/use-conversation-messages.ts`
- `apps/web-next/src/hooks/use-reaction.ts`
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

Avoid modifying:

- `apps/web`
- `apps/ws-server`
- `packages/*`

Exception: if auto-resume requires first-class `stream:resumed` handling, that is a separate shared contract change and should be explicitly approved.

## 29. Verification

Run from repository root:

```bash
pnpm --filter=@slipstream/web-next test
pnpm --filter=@slipstream/web-next typecheck
pnpm --filter=@slipstream/web-next lint
pnpm build:web-next
```

The build must use the root Turbo script:

```bash
pnpm build:web-next
```

Manual checks:

- open a long existing conversation
- verify first-page hydration
- load older pages and verify scroll anchoring
- send in an existing conversation
- send from `/chat/new-chat`
- confirm shallow URL change during stream
- confirm mandatory router reconciliation after completion
- send with attachments and confirm user attachment reconciliation
- send with image generation enabled
- use a reasoning model with thinking blocks
- simulate `ai_chat_error`
- disconnect during a stream and verify interrupted/Retry behavior
- reconnect and resume/retry
- verify reactions remain consistent after row replacement

Profiler checks:

- committed rows do not re-render per token
- sidebar does not re-render per token
- final response causes one committed-list update
- draft updates do not mutate `committedList`

## 30. Acceptance Criteria

Functional:

- final AI messages are committed only from `evt.convo.messages[0]`
- optimistic user messages reconcile ids
- attachment-bearing user messages converge to server-normalized state
- new-chat transition preserves the router deception protocol
- disconnect does not leave infinite spinners or permanent send locks
- upward pagination preserves viewport position
- reactions remain consistent after store row updates
- route eventually stops server-fetching full transcript

Performance:

- chunks preserve `committedList` reference
- committed message rows skip token-by-token re-render
- sidebar skips token-by-token re-render
- 400 to 600+ message conversations remain responsive during streaming

Quality:

- store core is React-free
- reducer tests exist
- no `any`
- no `.filter(Boolean)`
- no bare assertions
- no zod
- no third-party state manager
- no expected-control-flow exceptions

## 31. Final Recommendation

Build the React-free store core first and test it with `node:test`. Use React's official selector shim for UI subscriptions. Keep `AIChatContext` as a facade. Consolidate rekeying into the registry and preserve the router deception protocol exactly. Make SWR a cold-history loader, not the read model. Commit final AI messages from `ai_chat_response.convo.messages[0]`.

The store boundary is correct. V3's added work is about making that boundary survive this codebase's real lifecycle, routing, pagination, and recovery edge cases.

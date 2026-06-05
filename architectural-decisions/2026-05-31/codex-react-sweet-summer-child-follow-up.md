# Codex Follow-up: Upward Pagination and Scroll Anchoring

Date: 2026-06-05

Scope: `apps/web-next` only. `apps/web` appears to share parts of this surface, but it is production-connected and should stay untouched for this phase.

## Problem Statement

Long conversations currently hydrate only the first history page. In the reported case, a conversation with 285 messages renders only the newest 25 messages, roughly ordinals 260 through 284, and scrolling upward cannot fetch ordinals 0 through 259.

This is not a backend pagination failure. The SWR loader and API route are already shaped to page older history. The missing piece is UI wiring: `loadMore` exists, but nothing calls it when the feed scrolls near the top.

## Current Runtime Path

1. `apps/web-next/src/app/(chat)/chat/[conversationId]/page.tsx`

   The route is client-side and passes `conversationId` into `ChatInterface`.

2. `apps/web-next/src/ui/chat/dynamic/index.tsx`

   `ChatInterface` computes `historyConversationId`, skipping `"home"` and `"new-chat"`, then calls:

   ```ts
   useHydrateChatStore(store, {
     userId: user.id,
     conversationId: historyConversationId
   });
   ```

   Current issue: it destructures only `error`:

   ```ts
   const { error: historyError } = useHydrateChatStore(...);
   ```

   `loadMore`, `hasMore`, `isLoading`, and `isValidating` are returned by the bridge but are dropped here.

3. `apps/web-next/src/hooks/use-hydrate-chat-store.ts`

   This bridge calls `useConversationMessages`, hydrates the store when a merged `conversation` exists, and returns `loadMore` / `hasMore`.

   ```ts
   const { conversation, isLoading, isValidating, loadMore, error } =
     useConversationMessages(args);
   ```

   Current issue: the returned pagination controls have no consumer.

4. `apps/web-next/src/hooks/use-conversation-messages.ts`

   `useSWRInfinite` is already set up for two key types:

   - page 0: `/api/users/:userId/chat/:conversationId`
   - older pages: `/api/users/:userId/chat/:conversationId/messages/:cursorOrdinal`

   `loadMore` calls `setSize(s => s + 1)` and already guards against reentry when `hasMore` is false or a load is in flight.

5. `apps/web-next/src/orm/user-message-service.ts`

   `getConversationMessagesPage` is ordinal-cursored:

   - `orderBy: { ordinal: "desc" }`
   - `take = 25`
   - older cursor uses `ordinal < cursorOrdinal`
   - `oldestOrdinal = msgs.at(-1)?.ordinal ?? 0`
   - `hasMore = oldestOrdinal > 0`
   - `nextCursor = hasMore ? oldestOrdinal : null`

   This is consistent with the post-migration ordinal contract.

6. `apps/web-next/src/state/chat/store.ts`

   `hydratePage` delegates to `ingestConversation`, which upserts by id and rebuilds `committed` sorted by server `ordinal`.

   This is compatible with older-page hydration. The store does not need a separate prepend method for correctness, because `ordinal` owns display order.

7. `apps/web-next/src/ui/chat/chat-feed/index.tsx`

   The feed owns the relevant `scrollRef` and uses `useScrollObserver`, but the observer only computes bottom-related state:

   - `isNearBottom`
   - `showScrollButton`

   Current issue: there is no top threshold, no sentinel, and no prop surface for `loadMore`.

## Root Cause

The app has a working cold-history loader and a compatible store ingestion path, but the feed has no upward pagination trigger.

The result is exactly one page of messages: the newest 25 rows returned by the initial API route.

## Findings

### 1. `loadMore` is dropped at the `ChatInterface` boundary

`useHydrateChatStore` already returns pagination state, but `ChatInterface` currently keeps only `historyError`.

This is the direct reason the feed cannot request page 1.

### 2. `ChatFeed` has no top-scroll signal

`useScrollObserver` is bottom-only. It is useful for "scroll to bottom" behavior, but it cannot trigger upward pagination.

The fix can either:

- add a small top-scroll handler inside `ChatFeed`
- extend `useScrollObserver` with top state
- add an `IntersectionObserver` sentinel at the top of the feed

For this codebase, the simplest first implementation is a local top-threshold handler in `ChatFeed`, because it keeps the fix close to the single scroll container that already owns `scrollRef`.

### 3. Scroll anchoring must ship with the trigger

When older messages hydrate, they enter the beginning of the sorted timeline. Without anchoring, the viewport will jump because `scrollHeight` increases above the user's current scroll position.

The feed should capture scroll metrics before `loadMore`, then restore position after the older page is committed:

```ts
previousScrollHeight = container.scrollHeight;
previousScrollTop = container.scrollTop;

await loadMore();

nextScrollTop = previousScrollTop + (container.scrollHeight - previousScrollHeight);
container.scrollTop = nextScrollTop;
```

Implementation detail: restoration should happen in a layout effect or the next animation frame after the message list changes, not immediately after `loadMore` resolves, because SWR resolution, bridge hydration, store notification, and React commit are separate steps.

### 4. Bottom auto-scroll should be suppressed while restoring a prepend anchor

`ChatFeed` currently auto-scrolls to bottom when `messages.length`, streaming text, thinking text, or first-chunk state changes and `isNearBottom` is true.

For older-page loads, it should explicitly skip bottom auto-scroll while a prepend anchor is pending. In most real long-conversation cases `isNearBottom` will be false while the user is at the top, but relying on that alone is brittle for short containers and edge cases.

### 5. Initial force-to-bottom is not the blocker

The initial scroll-to-bottom effect is keyed on `activeConversationId`, `scrollRef`, and `isNewChat`. It should run when opening an existing conversation and is not expected to rerun on each older page.

It should still be guarded during any active prepend restoration if the implementation introduces state that could re-trigger it.

### 6. The actual scroll container matters

There are nested overflow containers:

- `ChatLayoutShell`: route content wrapper with `flex-1 overflow-y-auto`
- `ChatInterface`: non-home wrapper adds `overflow-y-auto`
- `ChatFeed`: owns `scrollRef` and adds `overflow-y-auto`

The existing bottom-scroll behavior uses `ChatFeed`'s `scrollRef`, so upward pagination should be wired to that same element. Do not attach the trigger to the outer route wrapper unless the layout is deliberately simplified first.

### 7. Stale type/doc surfaces exist

`apps/web-next/src/state/chat/store-types.ts` defines:

```ts
readonly nextCursor: string | null;
```

The current hook and API use `number | null` for ordinal cursors.

This mismatch does not appear to cause the 25-message ceiling because the store does not consume `ConversationMessagesPage`, but it should be corrected to avoid future confusion.

Several older planning docs still describe `createdAt desc`, `take + 1`, and id/string cursors. The current source code has moved to ordinal cursors and should be treated as the source of truth.

## Recommended Repair Shape

## Prototype Cross-check

Reference prototype:

```txt
/home/dopaminedriven/personal/infinite-scroll-chat
```

Relevant files:

- `hooks/use-conversation-messages.ts`
- `components/chat-container.tsx`
- `lib/mock-messages.ts`

The prototype validates the overall direction:

- one unified page shape: `{ convo, nextCursor, hasMore }`
- SWR Infinite owns cold-history pages
- `loadMore` increments SWR size
- `hasMore` comes from the last loaded page
- `isLoadingMore` is exposed directly
- a top sentinel triggers older-page fetches
- scroll anchoring captures previous `scrollHeight` before `loadMore`
- after older rows render, `scrollTop` is adjusted by the new `scrollHeight` delta

### What Transfers Directly

The `ChatContainer` anchoring model is the useful part:

```ts
prevScrollHeightRef.current = root.scrollHeight;
isPrependingRef.current = true;
void loadMore();
```

Then after the older messages render:

```ts
const delta = el.scrollHeight - prevScrollHeightRef.current;
if (delta > 0) {
  el.scrollTop += delta;
}
isPrependingRef.current = false;
```

The top-sentinel approach is also valid. The prototype uses:

```ts
rootMargin: "600px 0px 0px 0px"
```

That starts fetching before the user reaches the true top, which is a better experience than waiting until `scrollTop === 0`.

### What Should Not Be Copied Blindly

The prototype renders directly from SWR:

```ts
const messages = conversation?.messages ?? [];
```

`web-next` does not. In `web-next`, SWR is a write-only loader into the external `ChatStore`; `ChatFeed` renders from:

```ts
const committed = useChatCommitted(store);
```

That changes the anchoring timing. In the prototype, `isLoadingMore` flips false in the same render where `messages` already contains the prepended rows. In `web-next`, SWR data can arrive first, then `useHydrateChatStore` hydrates the store in an effect, then the store notifies `useChatCommitted`, then `ChatFeed` receives the larger message list.

So this prototype effect is too eager for `web-next` if copied exactly:

```ts
if (!isPrependingRef.current) return;
if (isLoadingMore) return;
const delta = el.scrollHeight - prevScrollHeightRef.current;
el.scrollTop += delta;
isPrependingRef.current = false;
```

In `web-next`, that can run after SWR finishes but before the store-backed `messages` list has grown, producing `delta = 0` and clearing the pending anchor too early.

The `web-next` version should restore only after the feed's actual rendered message list grows beyond the count captured before `loadMore`:

```ts
const anchor = prependAnchorRef.current;
if (!anchor || !scrollRef.current) return;
if (messages.length <= anchor.messageCount) return;

requestAnimationFrame(() => {
  const container = scrollRef.current;
  if (!container) return;
  container.scrollTop =
    anchor.scrollTop + (container.scrollHeight - anchor.scrollHeight);
  prependAnchorRef.current = null;
});
```

This is the main adaptation required by the external-store architecture.

### Ordering Difference

The prototype mock API returns each page's `convo.messages` in ascending display order. Its merge walks pages from oldest loaded page to newest loaded page:

```ts
for (let i = data.length - 1; i >= 0; i--) {
  messages.push(...data[i].convo.messages);
}
```

`web-next` currently returns each page from Prisma in `ordinal desc` order. The existing `web-next` hook flattens loaded pages and reverses the whole result:

```ts
const messages = (data ?? [])
  .flatMap(page => page.convo.messages)
  .reverse();
```

Given the current API shape, that is correct. Do not copy the prototype page merge unless the API is changed to reverse each page before returning it.

The store also sorts by `ordinal` during ingestion, so display order is protected even if SWR's merged conversation order is not perfect. Still, keeping the loader's merge behavior consistent with the route contract reduces debugging noise.

### Hook Shape to Borrow

`web-next` should borrow the prototype's explicit return of `isLoadingMore` and `hasMore`.

Current `web-next` already computes `isLoadingMore` inside `use-conversation-messages.ts`, but it does not return it. That should change.

Recommended bridge shape:

```ts
const {
  conversation,
  isLoading,
  isLoadingMore,
  isValidating,
  hasMore,
  loadMore,
  error
} = useConversationMessages(args);
```

Then forward these through `useHydrateChatStore`. The feed should receive UI-oriented names:

```tsx
<ChatFeed
  hasOlderMessages={hasMore}
  isLoadingOlderMessages={isLoadingMore}
  loadOlderMessages={loadMore}
/>
```

### Sentinel vs Scroll-threshold

After seeing the prototype, a top sentinel is probably the better first implementation than a manual `scrollTop <= threshold` check.

Reasons:

- the prototype already validates the behavior
- prefetch via `rootMargin` is smoother
- it avoids another debounced scroll-state path
- it can live entirely inside `ChatFeed`, attached to the same `scrollRef`

The sentinel must still use the `messageCount` anchor guard described above because of the SWR-to-store bridge.

### Step 1: Expose pagination state from the bridge

Have `useConversationMessages` return `hasMore` and `isLoadingMore` directly. Then have `useHydrateChatStore` forward them.

Suggested returned shape:

```ts
return {
  isLoading,
  isValidating,
  isLoadingMore,
  loadMore,
  hasMore,
  error
} as const;
```

`useHydrateChatStore` can keep deriving `hasMore` from the merged conversation, but forwarding the loader's `hasMore` is cleaner because the loader owns pagination.

### Step 2: Pass pagination props into `ChatFeed`

`ChatInterface` should retain and pass:

```ts
loadOlderMessages={loadMore}
hasOlderMessages={hasMore}
isLoadingOlderMessages={isLoadingMore}
```

Naming should stay UI-oriented at the feed boundary. `loadMore` is an SWR term; `loadOlderMessages` is what the feed is actually doing.

### Step 3: Add a top threshold in `ChatFeed`

Recommended first pass:

- threshold around 120 to 200 px from top
- no trigger while `isHome`
- no trigger while `isLoadingOlderMessages`
- no trigger while `hasOlderMessages` is false
- no trigger while a local anchor ref is pending

Pseudo-flow:

```ts
if (container.scrollTop > TOP_THRESHOLD_PX) return;
if (!hasOlderMessages || isLoadingOlderMessages) return;
if (prependAnchorRef.current) return;

prependAnchorRef.current = {
  scrollHeight: container.scrollHeight,
  scrollTop: container.scrollTop,
  messageCount: messages.length
};

void loadOlderMessages();
```

This can be implemented as a scroll listener on the `scrollRef.current` element or inside an enhanced scroll observer. A top sentinel is also valid, but it is more moving parts for the first repair.

### Step 4: Restore anchor after commit

Use `useLayoutEffect` or `requestAnimationFrame` keyed to `messages.length` and the pending anchor.

Pseudo-flow:

```ts
const anchor = prependAnchorRef.current;
if (!anchor || !scrollRef.current) return;
if (messages.length <= anchor.messageCount) return;

requestAnimationFrame(() => {
  const container = scrollRef.current;
  if (!container) return;
  container.scrollTop =
    anchor.scrollTop + (container.scrollHeight - anchor.scrollHeight);
  prependAnchorRef.current = null;
});
```

The `messageCount` guard prevents anchor restoration from running before the older page has actually changed the DOM.

### Step 5: Disable browser overflow anchoring on the feed

Set `overflow-anchor: none` on the feed scroll container so the browser does not fight the manual anchor restoration.

Tailwind arbitrary style should work:

```tsx
className={cn(
  "flex-1 space-y-6 overflow-y-auto px-4 py-6 [overflow-anchor:none]",
  className
)}
```

### Step 6: Keep bottom-scroll behavior intact

The existing bottom auto-scroll should keep working for normal streaming, but it should bail during prepend restoration:

```ts
if (prependAnchorRef.current) return;
```

This avoids a race where older history commits and the bottom-scroll effect sees `messages.length` change.

## Non-goals for This Fix

- Do not touch `apps/web`.
- Do not change backend pagination.
- Do not change message ordering. `ordinal` is already the canonical sort key.
- Do not add a third-party virtualizer yet.
- Do not clean dead route-service methods as part of this fix.
- Do not broaden the store API unless a concrete UI need appears.

## Acceptance Checks

1. Open an existing conversation with more than 25 messages.
2. Confirm the first render shows the newest page and lands at the bottom.
3. Scroll near the top.
4. Confirm one older page loads.
5. Confirm the viewport stays visually anchored instead of jumping.
6. Repeat until ordinal 0 is loaded.
7. Confirm loading stops once `hasMore` is false.
8. Confirm no duplicate message ids appear.
9. While at bottom, send a new message and confirm streaming still auto-scrolls.
10. While not near bottom, receive or render new content and confirm the viewport is not forced to bottom.
11. Confirm `"home"` and `"new-chat"` do not attempt SWR history pagination.

## Verification Commands

Use repo convention:

```bash
pnpm --filter=@slipstream/web-next typecheck
pnpm --filter=@slipstream/web-next lint
```

If a build check is needed, run it from the root:

```bash
pnpm build:web-next
```

## Incidental Findings

`ChatInput` contains `console.log` / `console.error` calls from existing code. That violates the repo's `AGENTS.md` logger rule, but it is separate from the 25-message pagination issue and should not be mixed into this repair unless cleanup is explicitly scoped.

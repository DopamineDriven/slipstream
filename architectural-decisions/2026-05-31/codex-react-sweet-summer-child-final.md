# Codex Final Notes: React Sweet Summer Child

## Summary

Claude's v3 is strong and I agree with its core direction: React-free store core first, context as facade, SWR as cold history, websocket response as final truth, and strict preservation of the new-chat router deception protocol.

Your six-phase breakdown is the right level of operational granularity. I would keep those six phases, with one caveat: converting the page to a client route and rewiring `AIChatContext` are tightly coupled. They can be separate phases on paper, but they should land close together or behind a compatibility bridge so the UI never loses its data source.

## Final Architecture Boundary

- Store owns chat state.
- Context exposes chat ergonomics.
- SWR loads cold history.
- WebSocket commits live truth.
- React renders selected slices.

The most important implementation rule remains: final AI messages come from `ai_chat_response.convo.messages[0]`, not from `finalizeStreamingMessage`.

## Key Updates From Claude v3

I agree with these additions:

- Use narrow split snapshot surfaces as the primary subscription model, with React core `useSyncExternalStore`.
- Keep the installed `use-sync-external-store` selector shim available as an escape hatch, not the foundation.
- Keep the store core React-free.
- Use `private`, not `#`, for store internals.
- Use `window.__chatStoreSnapshot?: <T = unknown>(conversationId?: string) => T` only as a dev/debug boundary.
- Treat the router deception protocol as mandatory:
  - passive path sync bails during stream/transition
  - registry does shallow `window.history.replaceState`
  - facade runs mandatory `router.replace(..., { scroll: false })` on completion
- Delete `conversation-id-context.tsx` if it is truly dead and unmounted.
- Add store-core `node:test` coverage before UI rewiring.
- Ship scroll anchoring with upward pagination, not later.
- Own optimistic user-row reconciliation in the store, especially attachment-bearing sends.

## Important Adjustment To The Six Phases

Your outline:

1. Store itself
2. SWR/API pagination wiring
3. Convert page from server to client
4. Rewire `ai-chat-context.tsx`
5. Local manual testing with ws-server and web-next
6. Playwright e2e

I would keep this, but I would treat Phase 3 and Phase 4 as a near-atomic pair. If the page stops server-fetching before the context/UI can read from the store/SWR bridge, `ChatInterface` loses `initialMessages` without a replacement. So either:

- Phase 3 only creates a client-shell compatibility route while still allowing the old seed path temporarily, then Phase 4 removes that compatibility; or
- Phase 3 and Phase 4 land in one branch/PR.

Do not leave the app between those states for long.

## Recommended Six-Phase Execution

### Phase 1: Store Itself

Build the React-free store and registry.

Deliverables:

- `state/chat/chat-store-types.ts`
- `state/chat/chat-message-workup.ts`
- `state/chat/chat-store.ts`
- `state/chat/chat-store-registry.ts`
- `state/chat/chat-store.test.ts`
- split snapshot surfaces
- registry rekey logic
- LRU eviction
- interrupted stream state
- optimistic user id and attachment patch actions
- reaction patch action

Tests should cover reducer behavior before any React wiring.

### Phase 2: SWR And API Pagination

Fix the API contract before using SWR as a real loader.

The page response should preserve the client-expected `ConversationSingleton<true>` shape:

```ts
export interface ConversationMessagesPage {
  readonly convo: ConversationSingleton<true>;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
```

This keeps the `convo` shape aligned with `ai_chat_response.convo` and avoids a wide UI rewrite.

Deliverables:

- `getConversationMessagesPage(conversationId, take, cursorId?)`
- `take + 1` pagination
- both API routes return `ConversationMessagesPage`
- `use-conversation-messages.ts` becomes a loader
- `use-hydrate-chat-store-from-swr.ts`
- scroll anchoring signal for upward pagination

### Phase 3: Client Route Conversion

Convert `apps/web-next/src/app/(chat)/chat/[conversationId]/page.tsx` away from full transcript server fetching.

Target:

- no `getConversationRouteProps`
- no full message fetch in the route
- auth remains in `(chat)/layout.tsx`
- client surface receives the route conversation id
- SWR hydrates history after mount

If needed, keep a temporary compatibility seed only until Phase 4 is complete.

### Phase 4: Rewire `AIChatContext` And Chat UI

Rewrite `AIChatProvider` as a facade.

Deliverables:

- bind registry with `useEffect([client])`
- facade exposes context fields from store surfaces
- preserve router deception protocol exactly
- `dynamic/index.tsx` reads store feed/draft/status, not local canonical `messages`
- `MessageBubble` memoized
- sidebar uses narrow conversation metadata/status surface
- `finalizeStreamingMessage` path removed
- reaction state follows committed store row
- attachment-bearing user messages reconcile after completion

This is where the visible UI becomes store-driven.

### Phase 5: Local System Testing

Run from root:

```bash
pnpm --filter=@slipstream/web-next test
pnpm --filter=@slipstream/web-next typecheck
pnpm --filter=@slipstream/web-next lint
pnpm build:web-next
```

Then run ws-server and web-next locally and manually verify:

- existing long conversation hydration
- load older messages with scroll anchoring
- send in existing conversation
- send from `/chat/new-chat`
- shallow URL update mid-stream
- mandatory router reconciliation on completion
- text, attachment, image-gen, and thinking flows
- disconnect and retry/resume behavior
- reactions after row replacement

### Phase 6: Playwright E2E

Add Playwright coverage after the architecture is stable.

Suggested scenarios:

- existing conversation loads from SWR
- new-chat stream promotes to real id without reload
- completed AI message appears once
- attachment send converges from optimistic to server-normalized state
- upward pagination preserves scroll position
- interrupted stream exposes retry/recovery state

Playwright should not be the first proof of correctness. Store unit tests and local system testing should catch most logic failures earlier.

## Final Concerns To Keep Visible

### Store Surface Design

Claude's split-snapshot plan is better than a single broad snapshot plus selector. It avoids render-phase selector memoization and makes re-render behavior obvious:

- committed list changes on hydrate/commit/reconcile/prepend
- feed changes on draft or committed changes
- draft changes per chunk
- status changes on flags/title/id changes
- sidebar reads only conversation metadata

This is the cleanest way to make React a subscriber without depending on selector cleverness.

### Route Conversion Timing

The route should become client-driven, but not before the store/SWR bridge can replace `initialMessages`. A temporary compatibility seed is acceptable during migration. The final state should remove it.

### Shared Contract Boundaries

Keep this implementation in `apps/web-next` unless you explicitly choose a shared contract change.

The likely shared-contract candidate is first-class `stream:resumed`. Default web-next behavior can rely on the catch-up `ai_chat_chunk` after retry, so a package change is not required for v1.

### Debug Hook

The global hook should stay dev-only and read-only:

```ts
__chatStoreSnapshot?: <T = unknown>(conversationId?: string) => T;
```

Use normal typed imports for app logic. Use the window hook only for DevTools.

## Final Recommendation

Use your six phases. Keep Claude's v3 hardening requirements. Treat Phase 3 and Phase 4 as tightly coupled. Preserve the `ConversationSingleton<true>` shape for SWR pages so the API, SWR hydration, and websocket final-response payload all speak the same object language.

The build should proceed once Phase 1 has reducer tests. That gives the rest of the migration a stable floor instead of trying to debug route, context, SWR, and websocket behavior all at once.

# React Sweet Summer Child — FINAL build playbook (`web-next`)

> The architecture is settled (see `claude-react-sweet-summer-child-v3.md` for full rationale on every
> hardening item). This is the operational plan: your six commit-checkpointed phases, with all v3 hardening
> folded in, the `ConversationSingleton<true>` object language as the unifying contract, and one ordering
> refinement (explained in §3). `apps/web-next` only. Commit **locally** after each phase (we're committing, not
> pushing). `web-next` is a deliberate **sandbox clone** of the production `apps/web` (which alone is wired to
> CI/CD: push → preview → prod) — so there are **no prod footguns**, the phase commits are convenience revert
> points, and an intermediate checkpoint does **not** have to be perfectly working. Optimize for clean,
> manageable scope; never touch `apps/web`.

---

## 1. Boundary (unchanged)

Store owns chat state · Context exposes ergonomics · SWR loads cold history · WebSocket commits live truth ·
React renders selected slices. **The one rule above all:** final AI messages come from
`ai_chat_response.convo.messages[0]`, never from `finalizeStreamingMessage`.

## 2. The unifying contract — the `@slipstream/types` singletons ARE the store's data model

Your key insight, made the governing principle: **do not hand-write message/conversation/attachment shapes —
reuse the existing singletons** (`ConversationSingleton<true>`, `MessageSingleton<true>`,
`AttachmentSingleton<true>`, `MessageBlockSingleton<true>`, …) from `packages/types/src/types.ts`, the same
contract `apps/ws-server` and the API already speak. The store's persisted data model is those singletons,
end to end.

- The SWR page is `{ convo: ConversationSingleton<true>; nextCursor: string | null; hasMore: boolean }` —
  `convo` is **the same `ConversationSingleton<true>`** `ai_chat_response.convo` returns.
- One ingestion primitive, **`ingestConversation(convo: ConversationSingleton<true>)`**, splits the envelope
  from the messages and is fed by both paths: `hydratePage(page)` → `page.convo`; `applyResponse(evt)` →
  `evt.convo`. It writes `convo.messages` into the normalized message store (`byId` + comparator) and stores
  the **envelope** (`Omit<ConversationSingleton<true>, "messages">` — `id`, `title`, `conversationSettings`,
  `branchId`, …) as conversation-level state. Same code path for cold history and live commit; no translation
  layer, no wide UI rewrite.
- **`T` is always `true` in the Next.js realm**, so the store types instantiate the singletons at `<true>` and
  carry **no `<T>` generic**. The invariant that guarantees this: the API layer (`bigintToInt` /
  `bigIntToIntMsg`) **and** the ws-server both serialize every `bigint` → `number` before data reaches the
  client, so the store never sees a `<false>` (bigint) shape. (This boundary guarantee is worth a one-line
  assertion/comment at each ingestion point.)
- **The store's reducer INPUTS are the real event types** from `packages/types/src/events.ts` — the *contract
  of contracts* for the WS protocol. Reducers take them verbatim (`applyChunk(evt: AIChatChunk)`,
  `applyResponse(evt: AIChatResponse)`, `applyError(evt: AIChatError)` via `EventTypeMap`) — never re-typed,
  never duplicated.
- **The only hand-written types** are the ones with no DB/singleton/event analog, and even they compose existing
  `@slipstream/types` exports: `ChatDraft` (the in-flight chunk **accumulation** — genuinely pre-message; built
  from `ChatChunkAndResMsgBlock`, `AIChatResponseImgGenFieldsFinal`, `Provider`; the `draft-to-message` adapter
  converts it into a real `MessageSingleton<true>` for rendering, so the live bubble is singleton-typed
  downstream) and the derived public **`ChatStatus`** flags.
- **`ChatStreamPhase` is PRIVATE — it never leaves the store.** It is a derived internal lifecycle
  (`"idle" | "awaiting-id" | "streaming" | "interrupted" | "complete" | "error"`), not a wire type, used only
  for the store's own control flow. `"awaiting-id"` is the transient internal window between `ai_chat_request`
  and the first `ai_chat_chunk`; because **the first chunk always carries the real `conversationId` + `title`**
  (the DB persists the inbound request immediately and returns the id; title is generated in parallel — see
  memory `project_first_chunk_carries_id_title`), the rekey fires deterministically on that first chunk with no
  fallback. The public `ChatStatus` surface exposes only the **derived semantic flags** consumers actually need
  — `isStreaming`, `isInterrupted`, `error`, `urlTransitionInFlight` — **not** `phase`, and **not**
  `awaiting-id`/`isWaitingForRealId` (those stay internal to the store/registry rekey logic).

This is why Phase 2 (fixing the API to return `convo` as `ConversationSingleton<true>`) precedes the UI rewire —
it makes the singleton contract real before the UI depends on it.

## 3. Non-negotiables & locked decisions (quick reference)

- **Router deception protocol (mandatory):** passive pathname effect bails on `isStreaming ||
  urlTransitionInFlight`; registry does shallow `window.history.replaceState` on first real id; façade runs
  mandatory `router.replace(..., { scroll:false })` on completion. Active id during transition comes from the
  registry callback, not `usePathname()`. (Full detail: v3 §2; memory `project_newchat_router_deception`.)
- **Store core is React-free.** `useSyncExternalStore` binding lives only in `hooks/use-chat-store-selector.ts`.
- **Split-snapshot surfaces** consumed by React-core `useSyncExternalStore` — no render-phase memo. Surfaces:
  `committed` (`MessageSingleton<true>[]`), `feed` (committed + draft synthetic, `MessageSingleton<true>[]`),
  `draft` (`ChatDraft | null`), `status` (`ChatStatus` — derived flags `isStreaming`/`isInterrupted`/`error`/
  `urlTransitionInFlight`; **never** the private `ChatStreamPhase`), `conversation` (the envelope
  `Omit<ConversationSingleton<true>, "messages"> | null` — sidebar reads its `title`; replaces the old ad-hoc
  `conversationMeta`), `error`. The installed `use-sync-external-store` shim is an escape hatch, never the
  critical path.
- **`private`, not `#`.** **`window.__chatStoreSnapshot?: <T = unknown>(conversationId?) => T`** (already in
  `index.d.ts:8`) is dev/client-only, read-only, via `registry.debugSnapshot`; typed app code uses an imported
  helper.
- **Delete `conversation-id-context.tsx`** (grep-verified dead: zero consumers, not mounted).
- **No** `image_gen_*` / `inline_data` / reaction / TTS / asset store reducers — confirmed unnecessary (v3 §18).
  Image gen rides `ai_chat_*` via `imgGenFields`/`imgGenEnabled`/`imgGenAttachmentId` — **preserve those**.
- **Per-conversation** stream guard (not per-user). **`take+1`** pagination. `messageComparator` sorts by
  `createdAt` (`new Date(x).getTime()`; `cuid(2)` ids are not chronological), user-before-AI tie-break.

### The one ordering refinement (Phases 3 & 4 stay split — and why)

Keeping the façade rewire and the route conversion as **two** phases is primarily about scope: two smaller,
independently committable units are more manageable — and give finer-grained local revert points — than one
big merged change. That only works if each phase is self-contained, which is why the internal order is
**façade/UI store-rewire first, route conversion second** (your outline listed the route first):

- **Phase 3 = make the UI store-driven** while the existing **server** route still seeds `initialMessages` →
  store. Self-contained, fully working checkpoint: UI reads entirely from store surfaces; route unchanged.
- **Phase 4 = convert the route to client**, swapping the seed source `initialMessages → SWR bridge` (a
  localized change, because the UI is already store-driven). Self-contained, fully working checkpoint: no
  server transcript fetch.

This also addresses the coupling codex flagged (the route-first order drops `initialMessages` before the UI can
read the store → a dataless intermediate). But note the stakes are low: `web-next` is a sandbox clone with no
CI/CD, so a temporarily-broken intermediate is not a disaster — façade-first is the **cleaner-scope** choice,
not a safety mandate. The two phases stay cleanly **split** (no need to merge them); each ends at a local commit
you can revert on its own.

---

## Phase 1 — The Store itself (React-free + tested)

**Goal:** a complete, unit-tested chat state machine with zero React imports. Nothing wired to the UI yet; the
app is unchanged.

**Create:**
- `state/chat/chat-store-types.ts` — **import the singletons** (`ConversationSingleton<true>`,
  `MessageSingleton<true>`, `AttachmentSingleton<true>`, `MessageBlockSingleton<true>`) and event types
  (`ChatChunkAndResMsgBlock`, `AIChatResponseImgGenFieldsFinal`, `Provider`, `EventTypeMap`) from
  `@slipstream/types` — do **not** redefine them, and the reducers consume the event types verbatim. Hand-write
  only: `ChatStreamPhase` (**internal/private — not exported, not on any surface**), the derived public
  `ChatStatus` (`isStreaming`/`isInterrupted`/`error`/`urlTransitionInFlight`), `ChatDraft` (chunk accumulation,
  composed from the event exports), the per-surface snapshot aliases (`committed`/`feed` =
  `readonly MessageSingleton<true>[]`; `conversation` = `Omit<ConversationSingleton<true>, "messages"> | null`),
  command-param types, and frozen `EMPTY_*`. No `<T>` generic — instantiate at `<true>` (§2 boundary invariant).
- `state/chat/chat-message-workup.ts` — `orderBlocks`, `mergeBlock`, text/thinking extraction,
  `extractCommittedMessage`, `messageComparator`, and `splitConversation(convo) → { envelope, messages }`. Pure.
- `state/chat/chat-store.ts` — `ChatStore` class. `private` fields (`byId`, `messageIds`, `committedList`,
  `feedList`, `conversationEnvelope`, `optimisticToServerId`, `optimisticAttachmentDrafts`). Split-snapshot
  surfaces (`committed`/`feed`/`draft`/`status`/`conversation`/`error`, each with its own listener `Set` +
  cached snapshot + frozen server snapshot). Reducers: **`ingestConversation(convo: ConversationSingleton<true>)`**
  (the shared primitive — splits envelope + messages; used by both `hydratePage` and `applyResponse`),
  `hydratePage`, `prependHistory`, `beginSend`, `applyChunk`, `applyResponse`, `applyError`, `markInterrupted`,
  `retryInterrupted`, `reconcileUserId`, `patchAttachmentUrls`, `patchMessageReaction`, `adoptSnapshot`,
  `clearError`, `resetStreamingState`. No generic `setState`. (Reducer semantics: v3 §9.)
- `state/chat/chat-store-registry.ts` — singleton; **client-only** `getOrCreate`; `bindClient`/`unbindClient`
  with one stable listener; route `ai_chat_chunk`/`ai_chat_response`/`ai_chat_error` by `conversationId`;
  `rekey("new-chat", realId)` (the §3 protocol seam, `onRekey` callback); bounded LRU (cap ~12; never evict a
  store with subscribers, a non-null draft, or phase `streaming`/`awaiting-id`/`interrupted`);
  `debugSnapshot(conversationId)`.
- `state/chat/chat-store.test.ts` — `node:test` + `node:assert/strict`.

**Invariants to honor here:** `applyChunk` rebuilds only `draft`/`feed`, keeping `committed` referentially
identical; commits are id-keyed idempotent; `feed` is memoized on mutation (never rebuilt inside a getSnapshot
call); `getServerSnapshot` per surface returns frozen empties and touches no registry.

**Also add (Phase-1 scaffolding):** the `test` script in `package.json`
(`"test": "node --test --import tsx --test-reporter spec"`); wire `window.__chatStoreSnapshot` in a dev-only
helper that the registry exposes (assignment happens in Phase 3 when the façade mounts).

**Tests (must pass before commit):** hydrate merges by id; repeated hydrate idempotent; chunk preserves the
`committed` reference; blocks merge by ordinal; `applyResponse` commits `evt.convo.messages[0]`; optimistic id
reconciles; attachment send flags the reconcile path; new-chat rekey preserves draft + optimistic user;
`markInterrupted` transitions cleanly; error preserves committed; LRU skips subscribed/streaming/draft stores; a
surface subscriber doesn't fire on unrelated-surface mutations.

**✅ Commit gate:** `pnpm --filter=@slipstream/web-next test` green; `typecheck` green; app still builds and runs
(store unused). Commit.

---

## Phase 2 — SWR + API pagination (the `convo` contract)

**Goal:** the two message APIs and the SWR hook speak `ConversationMessagesPage` with `convo:
ConversationSingleton<true>`, and a bridge feeds settled pages into the store. The live UI is still the old path.

**Do:**
- `types/ui.ts`: add `ConversationMessagesPage` (§2). Slim `ChatInterfaceProps` later (Phase 4).
- `orm/user-message-service.ts`: add `getConversationMessagesPage(conversationId, take, cursorId?)` — query
  `createdAt desc`, fetch **`take + 1`**, `hasMore = rows.length > take`, page = first `take`, `nextCursor =
  oldest page-row id when hasMore else null`, keep deep includes (blocks, attachments+metadata, ttsJob,
  imageGenJob) + `bigintToInt`, `return … satisfies ConversationMessagesPage`. (Subsumes `getConvoInitial`/
  `getMessagesByCursor` — verify callers, then retire in Phase 4 cleanup.)
- Both routes (`.../chat/[conversationId]/route.ts`, `.../messages/[cursorId]/route.ts`) return the page; keep
  auth + `unauthorized()` ownership checks.
- `hooks/use-conversation-messages.ts` → **loader**: fetch pages; expose `loadMore`, loading flags, errors;
  skip `"home"`/`"new-chat"`; no focus/reconnect revalidation; delete `appendMessage`/`removeMessage` and the
  (mis-ordered) `conversation` memo as a read model.
- `hooks/use-hydrate-chat-store-from-swr.ts`: on each settled page, `store.hydratePage(page)` (ordering owned by
  the store comparator — discard positional reversing).
- Lay the **scroll-anchoring signal** groundwork (`prependVersion` already on `status`); the anchoring effect
  ships in Phase 4 with `prependHistory`/`loadMore`.

**✅ Commit gate:** hit both API routes (curl/devtools) and confirm the `{ convo, nextCursor, hasMore }` shape;
`typecheck`/`lint` green; the bridge hook compiles and (optionally, behind a dev flag) populates a store you can
inspect via `window.__chatStoreSnapshot`. App still uses the old route/UI. Commit.

---

## Phase 3 — Façade + UI become store-driven (route still seeds)

**Goal:** the visible UI reads entirely from the store, **under the existing server route** (which still passes
`initialMessages`, now used only to seed the store). This is the cornerstone landing.

**Do:**
- `hooks/use-chat-store-selector.ts`: per-surface hooks (`useChatFeed`, `useChatCommitted`, `useChatDraft`,
  `useChatStatus`, `useChatConversation`, `useChatError`) — React-core `useSyncExternalStore`, no memo.
- `hooks/use-send-chat.ts`: assemble `AIChatRequest` + optimistic user message (`createUserMessage` +
  `buildOptimisticAttachment`); **per-conversation** stream guard + `${conversationId}-${prompt}` dup-click
  guard; call `store.beginSend` + `sendEvent`; rotate asset batch.
- `lib/draft-to-message.ts`: `draftToStreamingMessage`/`appendDraft` (synthetic `streaming-<convId>`,
  display-only; preserves `imgGenFields`/`imgGenEnabled`/`imgGenAttachmentId` via `normalizeImgGenFields` +
  `toMessageBlocks`). Used to compose the `feed` surface.
- `context/ai-chat-context.tsx` → **façade** (~120 lines): bind registry via `useEffect([client])`; client-only
  `getOrCreate`; assemble the existing `AIChatContextValue` from surfaces + `sendChat` (from `use-send-chat`) +
  `isConnected` (WS context) + the active `store`; **the router deception protocol** (passive path effect bails
  on `isStreaming || urlTransitionInFlight`; mandatory completion `router.replace` via `onRekey`); assign the
  dev-only `window.__chatStoreSnapshot`. Seed the store from `initialMessages` **once** (temporary — removed in
  Phase 4). It must NOT own messages/draft, use `client.on`, mirror refs, or finalize messages.
- `ui/chat/dynamic/index.tsx`: delete local `messages` state + the four reconciliation effects + the
  `handleUserMessage` body; read `useChatFeed`/`useChatDraft`/`useChatStatus`; `handleUserMessage` → `sendChat`.
  Keep UI-local: queued prompt, prompt-consumed flag, sessionStorage handoff.
- `ui/chat/message-bubble/index.tsx`: wrap in `React.memo`; pass `live*` props only to the streaming message;
  **completion-flash fix** (key the committed bubble identically to the draft / pre-warm markdown cache — v3
  §16); remove the imgGen debug `console.log` effect.
- `ui/chat/chat-feed/index.tsx`: remove the imgGen debug `console.log`; source live props from `status`/`draft`.
- `ui/chat/sidebar/index.tsx`: `useAIChatContext()` → `useChatConversation(store)` (reads the envelope's
  `title`/`id`; no per-token re-render).
- `hooks/use-reaction.ts`: source from the committed store row — call
  `store.patchMessageReaction(conversationId, message.id, { liked, disliked })` from the `rxnAction` result; key
  the hook off `message.id` so it re-derives on row replacement (v3 §17).
- **Delete:** `context/conversation-id-context.tsx` (dead); `createAIMessage` + `finalizeStreamingMessage` in
  `lib/ui-message-helpers.ts` (keep `createUserMessage`, `toMessageBlocks`).

**✅ Commit gate:** with `ws-server` + `web-next` running, the **existing server route** drives a fully
store-backed UI: streaming, new-chat→real-id (shallow URL + mandatory completion reconcile), thinking, image
gen, reactions all work; React Profiler shows committed rows + sidebar do **not** re-render per token. `test`/
`typecheck`/`lint` green. Commit. (This is the highest-value checkpoint — the cornerstone is proven.)

---

## Phase 4 — Convert the route server → client (swap the seed)

**Goal:** the route stops server-fetching the transcript; SWR hydrates the store on mount; the temporary
`initialMessages` seed is removed. Because the UI is already store-driven (Phase 3), this is a localized swap.

**Do:**
- `app/(chat)/chat/[conversationId]/page.tsx`: remove `getConversationRouteProps` and the heavy fetch; render
  the client surface with the route `conversationId`; auth stays in `(chat)/layout.tsx`; metadata stays cheap
  (title-only or generic — never reintroduce the transcript fetch). Skeleton moves into the client surface,
  driven by SWR `isLoading`.
- Wire `use-hydrate-chat-store-from-swr` at the client surface; **remove** the Phase-3 `initialMessages` seed.
- **Ship scroll anchoring** with `loadMore`/`prependHistory`: capture `scrollHeight` before prepend; restore
  `scrollTop += delta` in `useLayoutEffect`/RAF; drive off `prependVersion` (not `messages.length`); suppress
  bottom/conversation-change auto-scroll during prepend; `overflow-anchor: none` on the container (v3 §14).
- **Optimistic user attachment reconciliation:** after `applyResponse(done)` for an attachment-bearing send,
  trigger an SWR page-0 `mutate`/refetch and reconcile the user row into the store (gate on "had attachments";
  text-only converges via `reconcileUserId`) (v3 §15).
- **Disconnect recovery wiring:** the registry watches `client.isConnected`/`onclose`; on disconnect while
  streaming → `markInterrupted` (Retry UX); on retry, re-send the original `ai_chat_request` and accept the
  server's catch-up `ai_chat_chunk` as authoritative draft replacement (the ws-server already replays from
  Redis). `stream:resumed` as a first-class signal is a **shared-contract** change — out of scope; default to
  Retry + catch-up chunk (v3 §11).
- **Cleanup:** remove dead `getConversationRouteProps`/`getMessagesByConversationIdWithAssets`/`getConvoInitial`/
  `getMessagesByCursor` once confirmed unused; slim `ChatInterfaceProps`; remove stale comments.

**✅ Commit gate:** existing conversations hydrate from SWR (no server transcript fetch — verify in network/RSC
logs); load-older preserves scroll position; new-chat, attachment, image-gen, thinking, disconnect/Retry all
work; `test`/`typecheck`/`lint`/`pnpm build:web-next` green. Commit.

---

## Phase 5 — Local system testing (ws-server + web-next)

**Goal:** end-to-end manual validation against the real backend.

```bash
pnpm --filter=@slipstream/web-next test
pnpm --filter=@slipstream/web-next typecheck
pnpm --filter=@slipstream/web-next lint
pnpm build:web-next        # root Turbo script
```

Run `ws-server` + `web-next` locally and walk the matrix: long existing conversation hydration; load older with
scroll anchoring; send in existing convo; send from `/chat/new-chat` (shallow URL mid-stream + mandatory router
reconcile on completion, no reload/wipe); text + attachment (optimistic → server-normalized) + image-gen
(partials → committed final) + thinking flows; `ai_chat_error`; disconnect mid-stream → interrupted/Retry →
reconnect resumes; reactions consistent after row replacement. Profiler: committed rows + sidebar skip per-token
re-render; final response = one committed update; chunks don't mutate `committed`.

**✅ Commit gate:** the full matrix passes by observation. Commit (and/or tag the milestone).

---

## Phase 6 — Playwright E2E

**Goal:** durable regression coverage (`@playwright/test` is already a devDep). Playwright is the *last* proof,
not the first — store unit tests (P1) and local system testing (P5) catch logic failures earlier.

Add Playwright config + specs for: existing conversation loads from SWR; new-chat stream promotes to real id
**without reload**; the completed AI message appears exactly once; attachment send converges optimistic →
server-normalized; upward pagination preserves scroll position; interrupted stream exposes retry/recovery.

**✅ Commit gate:** Playwright suite green locally. Commit.

---

## Cross-cutting invariant checklist (verify continuously)

- Final AI message only from `evt.convo.messages[0]`; `finalizeStreamingMessage` deleted.
- `committed` reference stable across chunks; only `draft`/`feed` change per token; `MessageBubble` memoized.
- Router deception: passive bail · shallow `replaceState` · mandatory completion `router.replace`.
- SSR-safe: no `getOrCreate` during server render; frozen empty server snapshots.
- Registry rebinds on `client` identity change; idempotent under Strict Mode; never deaf after `close()`.
- Per-conversation guards; eviction never drops a live/streaming/interrupted store.
- Store ingests `ConversationSingleton<true>` from both SWR pages and WS responses — one comparator, one merge.
- House rules: no `any`, no `.filter(Boolean)`, no bare assertions, no zod, no third-party state manager,
  `private` not `#`, `import type` + `.ts` paths, `Array.of<T>()`, `void`-prefixed fire-and-forget.

## Rollback posture

Make a **local commit** at the end of each phase (committing, not pushing) as a revert point. Because `web-next`
is a sandbox clone with no CI/CD, a checkpoint doesn't have to be perfectly working — but landing each phase at a
green, runnable state is still the convenient default. Phases 1–2 are additive (no UI behavior change), so
they're trivially revertible. Phase 3 is the behavior switch (UI → store) under the unchanged route — the safest
place to prove correctness. Phase 4 flips the data source (route → SWR); if anything regresses, revert the
Phase-4 commit alone and the Phase-3 store-driven UI still works on the server route. The façade-first ordering
(§3) keeps that revert clean — but if it's ever convenient to break the intermediate, that's fine here.

## Shared-contract note

Stay in `apps/web-next`. The only likely shared-package candidate is a first-class `stream:resumed` event; the
default (Retry + catch-up `ai_chat_chunk`) needs no `packages/types` change. Raise it explicitly if first-class
resume UI becomes a requirement.

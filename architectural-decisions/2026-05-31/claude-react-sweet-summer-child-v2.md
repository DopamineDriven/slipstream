# React Sweet Summer Child v2: Verification Pass — Landmines, Reversals & Non-Negotiables

> The architecture has CONVERGED across all four drafts (`claude-react-sweet-summer-child.md`,
> `codex-react-sweet-summer-child-v2.md`, et al.): a hand-built `useSyncExternalStore` chat store
> per conversation, registry-routed by `conversationId`, `AIChatContext` gutted to a store-backed
> façade, `ai_chat_response.convo.messages[0]` as the authoritative final message, SWR as cold loader,
> route eventually fully client. **This document does NOT re-derive that.** It is the verification pass:
> a fan-out of six agents read the *actual* `web-next` + `ws-server` code to confirm-or-refute the angles
> both converged plans glossed. What follows is only what changed under verification — the **reversals**,
> the **confirmed landmines**, and the **non-negotiables** — each with `file:line` evidence. `apps/web-next` only.

---

## 0. What this pass changes (TL;DR)

- **2 reversals** of micro-decisions in BOTH plans: (a) do NOT hand-roll the selector — use React's own
  `useSyncExternalStoreWithSelector` (it's first-party and already installed); (b) the new-chat rekey is
  *duplicated across two contexts today and they collide on the single-handler registry* — the `addListener`
  fan-out fixes it, but the rekey logic must be consolidated, not just relocated.
- **1 hard correction** from the user: the new-chat→real-id "router deception" is a **MUST**, with an exact
  protocol that emerged from real debugging pain (§1).
- **9 confirmed landmines** neither plan addressed: SSR registry leak, client-replacement deafness,
  `close()` wipes listeners, store eviction, orphaned-draft on disconnect (with an *existing server resume*
  to leverage), completion-flash, scroll-anchoring, optimistic-user-message fidelity, `useReaction` seed-once.
- **What's confirmed SAFE** (so we don't over-build): `image_gen_*`, `ai_chat_inline_data`, and
  reactions/TTS/assets-as-store-reducers are all refuted as concerns.

---

## 1. NON-NEGOTIABLE: the new-chat → real-id Router Deception Protocol

This is load-bearing and hard-won. Next re-renders (and, on a `force-dynamic` route, **refetches**) the
moment it detects a route change; mid-stream that wipes streaming state. The URL must change WITHOUT
notifying the Next router until it is safe. The exact 3-step sequence (today in `ai-chat-context.tsx`) must be
**preserved**, relocated as follows — the completion-time `router.replace` is a **MUST, not "if needed."**

| Step | Today | New home |
|---|---|---|
| 1. **Passive pathname read that bails mid-flight** — `if (isStreaming \|\| urlUpdatedRef.current) return` before adopting a path id (`ai-chat-context.tsx` pathname effect) | context effect | **façade** effect — bail on `isStreaming \|\| urlTransitionInFlight` |
| 2. **Shallow `replaceState` on first real id** — `window.history.replaceState(null,"","/chat/"+realId)`, set flag, `setIsNewChat(true)` (`ai-chat-context.tsx:404-422`) | `handleChunk` | **registry `rekey("new-chat", realId)`** — once, mid-stream, never notifies Next |
| 3. **`router.replace("/chat/"+realId,{scroll:false})` at completion** — MANDATORY, new-chat only, then clear flag (`ai-chat-context.tsx` handleResponse on `done`) | `handleResponse` | **façade** via the `onRekey` seam, fired on `applyResponse(done)` |

**The crux:** after step 2, `window.location.pathname` is `/chat/realId` but Next's `usePathname()` still
reports `/chat/new-chat` (raw `replaceState` doesn't sync Next's router — that's the deception). So **during
the transition the active conversationId comes from the registry rekey callback (local state), never from
`usePathname()`**, and the passive effect MUST stay inert or it sees the stale `new-chat` path, mismatches the
real active id, and resets/wipes — the exact bug. Step 3 reconciles Next's pathname so the passive effect is
safe to resume; clear the flag only *after* it.

**Resilience bonus the store buys here:** because streaming state now lives in the *external store* (not React
`useState`/refs), a stray re-render no longer *wipes* it — re-subscribing returns the same snapshot. The store
neutralizes the "state got wiped" half of the original pain. The protocol still earns its keep for the *other*
half: preventing the `force-dynamic` **refetch** + flicker/scroll-reset a router-detected navigation triggers.

> ⚠️ **Verified duplication + collision (reversal, §2.2):** the rekey promotion exists TODAY in **two** places —
> `ai-chat-context.tsx:404-424` AND `conversation-id-context.tsx:40-49` — and both call `client.on("ai_chat_chunk")`,
> which is a **single-handler registry** (`chat-ws-client.ts:60-69` replaces + warns "already registered"). They
> collide; last mount wins. Consolidate the rekey into the registry (`addListener` fan-out) — do not port the
> duplication forward.

---

## 2. Reversals (both converged plans had these wrong)

### 2.1 Do NOT hand-roll the selector — use React's first-party `useSyncExternalStoreWithSelector`

Both plans say "hand-write the memo to avoid a third-party dependency." **That premise is factually false**, and
the hand-roll is actively dangerous in *this* app's config:

- `use-sync-external-store@1.6.0` is **authored by the React core team** (facebook/react), not a third-party state
  manager, and is **already installed** — pulled in transitively by `swr@2.4.1` (a direct web-next dep,
  `apps/web-next/package.json:74`). `use-sync-external-store/shim/with-selector` resolves from web-next today
  (`.npmrc` `node-linker=hoisted`).
- The app is **React 19.2.6** (`pnpm-workspace.yaml:152`) with **`reactStrictMode: true` AND `reactCompiler: true`**
  (`next.config.ts`; `babel-plugin-react-compiler ^1.0.0`, stable). All three failure modes of a hand-rolled
  render-phase `useRef` snapshot cache are live: (a) **concurrent tearing** under React 19; (b) **Strict Mode
  double-invoke** poisoning the ref cache — the *first, discarded* render writes it, the second reads it stale
  (this is the exact ref-pain the current `ai-chat-context.tsx:221-271` already drowns in); (c) the **React
  Compiler's render-purity** rules — mutating a ref during render is precisely what it assumes you don't do;
  `useSyncExternalStoreWithSelector` is on its known-hooks allowlist, the hand-roll is not.

**Decision:** use `useSyncExternalStoreWithSelector` from `use-sync-external-store/shim/with-selector`. Add
`use-sync-external-store` as an **explicit** web-next dependency (catalog-pinned to the installed `1.6.0`) to kill
the only legitimate objection — a phantom transitive that a future `swr` bump or linker change could break. The
code is already on disk; making it explicit is not "bloat." Delete the `{version,value}` ref cache from the plan.

**Corollary (getSnapshot stability):** the `draft-to-message` synthetic `streaming-<convId>` message must be
composed into a **memoized** feed array on store *mutation* (write-through), NOT rebuilt inside `getSnapshot`/the
selector per call — else `getSnapshot` returns a fresh array every render and loops ("getSnapshot should be
cached") under Strict Mode / tears under concurrent rendering.

### 2.2 The rekey is duplicated + the WS registry collides today

See the callout in §1. Verified: `ai-chat-context.tsx` and `conversation-id-context.tsx` both subscribe the
chat events via the single-handler `client.on(...)` registry and **collide**. The converged plan's `addListener`
Set fan-out (`chat-ws-client.ts:442-448`, the path `use-chat-ws.ts:52` already uses) is the correct collision-free
channel — and the rekey logic must be **consolidated into the registry**, retiring `conversation-id-context.tsx`'s
duplicate (or reducing it to a store consumer). This is a real bug the migration should *fix*, not preserve.

### 2.3 Don't "mine `convo.id`/`convo.title`" — they're redundant; only `conversationSettings` is new

My v1 suggested reading `convo.id`/`convo.title`/`settings` as more authoritative. Verified: **redundant.** The
rekey already fires on the **first chunk** via `evt.conversationId` (`ai-chat-context.tsx:404-422`), long before
`convo` arrives; `convo.id === evt.conversationId` by construction (`resolver/chat.ts:132`). `convo.title`
(`chat.ts:1097`) is the same generated title already delivered top-level as `evt.title` (consumed at
`ai-chat-context.tsx:427`), and arrives *later*. **Keep rekey on `evt.conversationId` and title on `evt.title`.**
The only genuinely new datum in `convo` is `conversationSettings` — read it into the store on `applyResponse`
*only if* a consumer needs settings before the next cold load (otherwise skip). `messages[0]` remains the sole
must-extract field.

---

## 3. Confirmed landmines (neither plan addressed; all verified in code)

### 3.1 SSR cross-request registry leak — the most serious

The chat route is an `async` server component (`page.tsx:24`, `dynamic="force-dynamic"` `:12`) rendering the
`"use client"` `<ChatInterface>` (`dynamic/index.tsx`) **directly** — NOT via `next/dynamic ssr:false`. The
façade replaces `AIChatProvider`, which sits in the **server-rendered** provider tree (`(chat)/layout.tsx:28`).
So the façade body **executes on the Node server** for initial HTML. A module-singleton `Map<string, ChatStore>`
whose façade calls `registry.getOrCreate(id)` *during render* mutates a **process-global, cross-request,
cross-user, never-evicted** Map server-side. (`WebSocketManager`, `chat-ws-context.tsx:30-40`, dodges this only
because its Map is mutated *solely inside a `useEffect`*, `:81` — client-only.)

**Impact:** unbounded server-side memory growth; two users hitting the same `conversationId` share a server store
(User B's `getServerSnapshot` could observe User A's state in initial HTML); hydration-mismatch risk. This is a
correctness/security defect, not just perf.

**Fix:** (1) `getServerSnapshot` returns a single frozen module-level `EMPTY_SNAPSHOT` **without** touching the
registry; (2) gate `getOrCreate` client-only (`typeof window !== "undefined"` / lazily inside the subscribe
callback or an effect); (3) keep SWR as the SSR content source via RSC `fallbackData` (it already does
`revalidateOnMount: !fallback`), so SSR fidelity never depends on a server-populated store. (Until the route goes
fully client, this guard is mandatory; after, it's still correct.)

### 3.2 Client replacement on user-switch → store goes deaf

The WS client is **not a stable singleton**: `client = useMemo(() => new ChatWebSocketClient(wsUrl), [wsUrl])`
and `wsUrl` depends on the user id (`use-chat-ws.ts:15-20`). Logout/login → new `?id=` → **new client identity**.
If the registry binds `addListener` once to the first client, events from the new client never reach the store —
**silent total failure** of the feed after a user switch.

**Fix:** bind from an effect keyed on client identity: `useEffect(() => registry.bindClient(client), [client])`
(returns the unbind). The single dispatcher routing by `evt.conversationId` lives in the registry, but its
`addListener` subscription is (re)established per client instance — mirroring the existing
`ai-chat-context.tsx:646-663` effect.

### 3.3 `close()` wipes listeners + registry; reconnect doesn't restore them

`chat-ws-client.ts:516-534` `close()` calls `this.registry.clear()` (`:529`) AND `this.listeners.clear()`
(`:530`) — wiping both `.on()` handlers and `addListener` listeners. `close()` fires on every effect cleanup /
disconnect / provider unmount / `WebSocketManager.setClient` replace (`use-chat-ws.ts:67/91`,
`chat-ws-context.tsx:49/57/99-102`). The auto-reconnect path (`:459-477`) re-opens the socket but **never
re-adds listeners**. So a bare socket drop+reconnect keeps listeners, but any `close()` leaves the store deaf.

**Fix:** same effect as §3.2 — the store's subscription lifetime is owned by `useEffect(..., [client])` (re-runs
on mount / StrictMode remount / identity change), NOT by the socket. Keep binding out of `connect()`.

### 3.4 React Strict Mode double-invoke (`reactStrictMode: true`)

Dev double-invokes mount: mount→unmount→mount. Absorbable **iff** (a) the listener function identity is **stable**
(define the dispatcher once in the registry; `addListener` uses a `Set`, `chat-ws-client.ts:404` — same ref ⇒
no-op) and (b) **all store mutations are id-keyed idempotent** (commit by `message.id` into the `byId` Map =
overwrite not push; draft = last-write-wins per conversation). Verify in dev: no duplicate committed `messageId`s.

### 3.5 Unbounded store retention → mobile OOM

The registry never evicts; navigating N conversations retains N fully-populated stores (each a `byId` Map +
`committedList[]` + subscriber Set) for the tab lifetime. This codebase explicitly targets mobile (viewport
cookie memories). **Fix:** an eviction policy is mandatory — bounded LRU (cap ~8–16) or refcount via
subscribe/unsubscribe; track `lastAccess` on `getOrCreate`; **never evict a store with live subscribers or a
non-null draft (active stream)**. The exact cap is a human decision; *some* policy is not optional.

### 3.6 Orphaned draft on mid-stream disconnect — and the server ALREADY supports resume

Today an interrupted stream leaves `isStreaming=true` forever (no disconnect handler for `ai_chat_*`;
`connection_established` carries only `providerContext`). On **ECS Fargate (120s stopTimeout)**, server restarts
**will** drop in-flight streams on every deploy. The per-conversation singleton store makes this *worse* (the
orphan persists across route churn), and the userId-keyed send guard (§3.9) may stay locked.

**Huge find:** the **server already implements Redis-backed resume** — `resolver/chat.ts:139-224` reads
`getStreamState(conversationId)`; if `existingState && !completed` it publishes `stream:resumed` + a catch-up
`ai_chat_chunk` replaying accumulated chunks; state is saved every ~10 chunks (`openai/responses-chat.ts:408`,
`anthropic/index.ts:811`) to `stream:state:<convId>` with a 1h TTL (`enhanced-client.ts:173-191`). **Two catches:**
it only fires when the client **re-sends `ai_chat_request`** for that conversation, and `stream:resumed` **isn't
in the client `EVENT_TYPES` allowlist** (`chat-ws-client.ts:17-58`) so it'd be dropped as "invalid structure."

**Fix (two parts):** (1) **Liveness** — the registry watches connectivity (bind `onopen`/`onclose` or poll
`client.isConnected`); on disconnect, transition any conversation whose draft is `isStreaming=true` to an
`interrupted`/needs-retry state (surface Retry, not an infinite spinner). (2) **Real resume (preferred)** — on
reconnect, re-send `ai_chat_request` for interrupted conversations to trigger the server replay; add
`stream:resumed` to `EVENT_TYPES` + `HandlerMap` and treat its chunks as authoritative draft replacement
(de-dupe against already-rendered text). **Decide with the human:** auto-resume vs explicit Retry. Don't silently
drop the orphan.

### 3.7 Completion flash — the `200ms/202ms` timers mask a real async-markdown swap

`ai-chat-context.tsx:593-595` defers `setIsComplete` by 200ms; `dynamic/index.tsx:438-440` defers
`resetStreamingState` by 202ms — while `setIsStreaming(false)` fires *synchronously*. The flash source:
`MessageBubble` renders via **synchronous** `processStreamingMarkdown` while streaming (`:149-150,505,525`) but
switches to an **async** `import('@/lib/processor') + processMarkdownToReact` on completion (`:343-366`), and
until that promise resolves the block **falls back to raw text** (`:506-507,526-527`). The timers give the async
markdown a beat before identity changes. **Dropping the delay while setting `isComplete` synchronously WILL
flicker** — worse here because the plan swaps the synthetic `streaming-<convId>` draft for `evt.convo.messages[0]`
(different object identity / React key ⇒ full remount, not in-place update).

**Fix:** keep the committed bubble **keyed identically to the draft** (map both to the real `aiMsgId`, or keep the
streaming key until markdown is ready) so `MessageBubble` updates in place and its markdown cache
(`${message.id}-${message.content.length}`, `:330`) pre-warms. If a remount is unavoidable, retain an equivalent
RAF/short defer before dropping the draft. **Do not** set `isComplete` synchronously *and* drop the timer without
first making the completed-render path synchronous or cache-pre-warmed.

### 3.8 Scroll anchoring on upward pagination (`prependHistory` is a brand-new path)

There is **no upward pagination wired today** — `loadMore`/`prependHistory`/`hydratePage` are unused;
`dynamic/index.tsx` only ever **appends**. `ChatFeed`'s auto-scroll (`chat-feed/index.tsx:127-143`) keys on
`messages.length` with **zero** `scrollHeight`-delta compensation; `useScrollObserver` only reports
`isNearBottom`. So `store.prependHistory` (adding older messages to the front) will push the viewport **down** by
the prepended block's height every "load older," and if near-bottom the length-keyed effect additionally yanks to
bottom — the page teleports.

**Fix (must ship WITH `hydratePage`/`prependHistory`, not as later polish):** capture `scrollHeight` before
prepend; in `useLayoutEffect`/RAF set `scrollTop += (newScrollHeight - oldScrollHeight)`; drive it off a
**discriminated prepend signal** from the store (a prepend counter / flag), NOT `messages.length`, so the bottom
auto-scroll and the conversation-change force-to-bottom (`:108-124`) are suppressed during upward loads; set CSS
`overflow-anchor: none` on the scroll container.

### 3.9 Optimistic USER message fidelity + send-guard scope

**(a) The user message is never server-reconciled.** `ai_chat_response.convo` is built with
`include.messages = { orderBy:{createdAt:'desc'}, take:1 }` (`prisma/chat.ts:1052-1056`) — it contains **only the
AI message**; the user message was persisted in an earlier transaction and is **not** returned (only `userMsgId`,
`resolver/chat.ts:131`). The optimistic user message is built client-side (`createUserMessage` +
`buildOptimisticAttachment`) and completion only **swaps its id** (`dynamic/index.tsx:386-405`) — content,
timestamps, and **attachments are never replaced**. `buildOptimisticAttachment` (`attachment-mapper.ts:112-227`)
hard-codes `id='draft-…'`, `status:'UPLOADING'`, `compatStatus:'PENDING'`, null `s3ObjectId/versionId/etag` — all
divergent from server-normalized attachments and never reconciled. Text-only messages converge via id-swap;
**attachment-bearing user messages stay visibly wrong** (forever "UPLOADING", fake `draft-` id breaking React
keys/lightbox) until a cold reload.

> **Fix:** on `applyResponse(done)`, when the just-sent message had attachments, trigger an SWR `mutate`/refetch of
> page 0 and reconcile the optimistic user message + attachments into the store (cheap, no protocol change). The
> robust alternative is a server change (include the user message via `take:2` or a dedicated `userMsg` field) —
> flag for the human; gate the refetch on "had attachments" to avoid a round-trip on every text send.
>
> This also means **the store must own the USER row**, not just commit the AI message — with explicit
> `reconcileUserId(tempId, realId)` and `patchAttachmentUrls(messageId, byDraftId)` actions (the latter replacing
> the async cdnUrl/publicUrl effect at `dynamic/index.tsx:243-288`). Otherwise: duplicate user bubbles or
> stale-blank attachment thumbnails.

**(b) Send guard is wrongly global.** `activeUserStreamsRef` is keyed by **userId** (`ai-chat-context.tsx:265,711,764`)
— it blocks ANY second stream while the user has one active, regardless of conversation. The **server has no
per-user lock** — stream state is per-conversation (`stream:state:${conversationId}`, `enhanced-client.ts:191`).
Single-active-stream-per-user is a **client artifact, not a product rule**. Under per-conversation stores it would
wrongly block starting a stream in conversation B while A streams. **Fix:** scope the guard to the conversation
(a `store.isStreaming` flag per `ChatStore`); keep the `${userId}-${prompt}` 500ms dup-click guard (it can become
`${conversationId}-${prompt}`).

### 3.10 `useReaction` seed-once divergence — amplified by `React.memo`

`useReaction(message)` holds its **own** `useState` seeded once from `message.liked/disliked`
(`use-reaction.ts:8-13`); `MessageIcons` renders the hook-local state, not `message.liked`
(`message-icons.tsx:100-107`); persistence is a **server action** (`message-actions.ts:47-71`, Prisma update +
`refresh()`), not WS. (The `user_rxn_update*` WS types exist but are **dead** — zero emitters/consumers.) Because
the seed is computed once at mount, when the store **re-commits/replaces a row** (e.g. `applyResponse`, or a
future re-`hydratePage`) the new `message.liked` will **not** propagate into the already-mounted hook — and
`React.memo` + stable store identity make this seed-once divergence **more** visible. **Fix:** make the committed
row the single source of truth — key `useReaction` off `message.id` (re-derive on identity change) or expose a
`patchMessageReaction(conversationId, messageId, {liked, disliked})` store action called from the `rxnAction`
result, so the store row and the rendered state stay consistent.

---

## 4. Confirmed SAFE — do NOT over-build (refuted concerns)

- **`image_gen_*` event family:** dead/unwired for chat. The resolver dispatch has **no case** for
  `image_gen_request` (`resolver/dispatch.ts:53-92` → falls to a redis 'never' sentinel); no web-next context
  subscribes. Chat image generation rides entirely on `ai_chat_chunk`/`ai_chat_response` via **`imgGenFields` /
  `imgGenEnabled` / `imgGenAttachmentId`** (`gemini/chat.ts:828-962`, consumed `dynamic/index.tsx:558-560` →
  `chat-feed`). **Do NOT add `image_gen_*` handlers.** **DO** ensure `applyChunk`/`applyResponse` and the
  `draft-to-message` adapter **preserve those three fields** — they are the load-bearing image channel.
- **`ai_chat_inline_data`:** emitted (Gemini-only, `gemini/chat.ts:541-558`) but its `data` payload is a useless
  diagnostic *byte-count* string (`.data?.length`, not bytes); subscribed by nothing; the real image arrives via
  `imgGenFields`. **Ignore it** (registry skips non-`ai_chat_chunk/response/error`).
- **Reactions / TTS / assets as store reducers:** none mutate a committed message via a live event. Reactions =
  server action + hook-local state; TTS = `Map<messageId>` cache in `tts-context` seeded *from* `message.ttsJob`
  (store→context, never the reverse); asset events are keyed by `draftId`/`batchId` on the pre-send pipeline and
  are baked into the message *before* commit. **No `applyReaction`/`applyTts`/`applyAsset`.** (The two real
  message-row mutations are §3.10 reactions-source-of-truth and §3.9a optimistic-user reconciliation.)

---

## 5. Architectural constraints these findings impose

1. **React-free store core.** Keep the `ChatStore` reducers + registry + comparator in plain `.ts` modules with
   **no React imports**. Put the `useSyncExternalStore(WithSelector)` binding in a *separate* hook file. This is
   required three times over: (a) so the store is unit-testable without React (§6), (b) so the React Compiler
   (`reactCompiler:true`) never sees render-phase store mutation, (c) so SSR can import types without dragging the
   hook. The official selector hook (§2.1) lives only in that hook file.
2. **Idempotent, id-keyed, write-through mutations** (§3.4): commit by `message.id`; memoize the composed feed
   array on mutation (§2.1 corollary); stable listener identity.
3. **Client-only registry** with `getServerSnapshot → EMPTY_SNAPSHOT` and bind-from-effect (`§3.1–3.3`).

---

## 6. Testability is REAL and unblocked (no new dependency)

`gpt`'s "unit-test the store action layer / provable without React" is **not** blocked. There is no vitest/jest
anywhere (catalog `test` group = `@playwright/test` only), **but** the monorepo already has a zero-dependency unit
convention: `node --test --import tsx --test-reporter spec` is used in **both** `apps/ws-server` and
`packages/img-gen` (real suite at `packages/img-gen/src/test/methods.test.ts` using `node:test` +
`node:assert/strict`); `tsx` is catalog-pinned (`^4.22.3`). **Add a `test` script to `apps/web-next/package.json`
using the same pattern** — no approval, no forbidden install. Tests construct a store, feed mocked
`ai_chat_chunk`/`ai_chat_response`/`ai_chat_error` events, and assert `byId`/`messageIds`/`committedList`/`draft`
transitions — *provided* the reducer layer is React-free (§5.1). Verify web-next's tsconfig path aliases resolve
under `tsx` (ws-server already does this; a `--tsconfig` flag may be needed).

This makes **Phase 1 ("prove the store with mocked events") genuinely verifiable** before any UI wiring — the
strongest possible foundation for the cornerstone.

---

## 7. Open decisions for the human

1. **Store eviction cap** (§3.5): LRU size (~8–16) vs refcount-on-unsubscribe. (Some policy is mandatory.)
2. **Disconnect recovery** (§3.6): auto-resume (re-send `ai_chat_request` on reconnect, leverage the existing
   server replay) vs explicit user Retry. Either way, add `stream:resumed` to `EVENT_TYPES`.
3. **Optimistic user reconciliation** (§3.9a): client refetch-page-0-on-done (gated to attachment messages) vs a
   server change to include the user message in `convo`.
4. **Explicit `use-sync-external-store` dep** (§2.1): add it to web-next `package.json` (catalog-pinned `1.6.0`)
   to remove the phantom-transitive reliance — recommended yes.

---

## 8. Net amendments to the converged sequence

The phase structure from `claude-react-sweet-summer-child.md` / `codex-react-sweet-summer-child-v2.md` stands.
Fold these in:

- **Phase 1 (store core):** React-free reducer module (§5.1); `node:test` suite (§6); id-keyed idempotent
  mutations (§3.4); memoized composed-feed array (§2.1 corollary); consolidate the rekey here, retiring the
  `conversation-id-context` duplicate (§2.2); per-conversation send guard (§3.9b).
- **Phase 2 (façade):** bind/unbind from `useEffect([client])` (§3.2–3.3); the Router Deception Protocol seam
  (§1) — passive effect bails on `isStreaming || urlTransitionInFlight`, `onRekey` fires mandatory completion
  `router.replace`; `getServerSnapshot → EMPTY_SNAPSHOT`, client-only `getOrCreate` (§3.1); selector via React's
  official `useSyncExternalStoreWithSelector` (§2.1).
- **Phase 3 (UI reads store):** keep committed bubble keyed identically to the draft to kill the completion flash
  (§3.7); `reconcileUserId`/`patchAttachmentUrls` store actions own the optimistic user row (§3.9a); `useReaction`
  re-derives from the committed row (§3.10); preserve `imgGenFields/imgGenEnabled/imgGenAttachmentId` through the
  adapter (§4).
- **Phase 4 (SWR/API):** scroll-anchoring ships WITH `hydratePage`/`prependHistory` (§3.8); refetch-page-0-on-done
  for attachment messages (§3.9a); add `stream:resumed` to `EVENT_TYPES` + the resume handler (§3.6).
- **Phase 5 (client route):** the §3.1 client-only-registry guard becomes moot once the route is fully client, but
  remains correct; add store eviction (§3.5).
- **Cross-cutting:** registry watches connectivity for orphaned-draft recovery (§3.6).

---

## 9. Final word

The boundary is unchanged — store owns chat state, context exposes ergonomics, SWR loads cold history, WebSocket
commits live truth, React renders selected slices. What this verification pass adds is the set of *real* edges
that decide whether that boundary survives contact with this codebase: the router deception (don't break it), the
SSR/lifecycle hazards (don't leak across requests or go deaf on reconnect), the existing server resume (don't
reinvent it), the optimistic-user fidelity gap (don't ship stale attachments), and the selector (don't hand-roll
what React already ships). Build the store core React-free and test it with `node:test` first — then everything
above is a checklist, not a surprise.

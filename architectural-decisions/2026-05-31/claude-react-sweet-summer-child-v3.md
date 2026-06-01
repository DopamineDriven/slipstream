# React Sweet Summer Child v3: `web-next` Chat Store — Build-Ready Plan

> Final pre-implementation plan. It carries the converged architecture (v1), folds in every verified
> finding from the v2 code-grounded verification pass, locks the router-deception protocol, and bakes in
> the decisions from the latest review exchange (the installed selector package, `private` over `#`, the
> `window.__chatStoreSnapshot` debug hook, and the split-snapshot selector strategy). Where this differs
> from earlier drafts, it says so. `apps/web-next` only. Shared-package edits are called out explicitly.

---

## 0. Boundary (unchanged) + what v3 finalizes

**Store owns chat state · Context exposes ergonomics · SWR loads cold history · WebSocket commits live
truth · React renders selected slices.**

v3 is not a re-architecture — it is the hardening pass that makes that boundary survive *this* codebase:

- Preserve the new-chat **router deception** protocol exactly (§2 — non-negotiable).
- Selector strategy: **narrow split-snapshot surfaces** consumed by React-core `useSyncExternalStore` (no
  render-phase memo), with the now-installed official shim reserved as an escape hatch (§3).
- Prevent **SSR cross-request store leakage**; bind the registry to the **current** WS client lifecycle (§6–7).
- Handle **disconnect / orphaned-stream** recovery (§11), **scroll anchoring** with upward pagination (§14),
  **optimistic user-message** reconciliation incl. attachments (§15), **completion flash** (§16), and
  **reaction** consistency after row replacement (§17).
- `private` over `#`; `window.__chatStoreSnapshot` debug hook; React-free store core unit-tested via
  `node:test` (§4, §23, §25).
- **Correction:** `conversation-id-context.tsx` is **dead code** (zero consumers, not mounted) — delete it.

---

## 1. Locked decisions

1. Build the **React-free store core first**, while the current route still seeds `initialMessages`.
2. Rewrite `AIChatContext` as a thin **store-backed façade** (keep `AIChatProvider`/`useAIChatContext`).
3. Keep the `streaming-<conversationId>` sentinel during migration (draft → synthetic message via one adapter).
4. `ai_chat_chunk` = provisional draft display only.
5. `ai_chat_response.convo.messages[0]` = the authoritative final AI message. Delete `finalizeStreamingMessage`.
6. Fully client chat route is the end-state, **after** the store is proven under the current route seed.
7. **Consolidate** new-chat rekey into the store registry; **delete** the dead `conversation-id-context.tsx`.
8. Bind store fan-out via `client.addListener`, never the single-handler `client.on`.
9. **Selector:** primary = split-snapshot surfaces (React-core); the installed
   `use-sync-external-store` shim is a sanctioned escape hatch, not foundational (§3).
10. Class internals use `private` (not `#`); a dev-only `window.__chatStoreSnapshot` reads via
    `registry.debugSnapshot` (§4, §23).
11. Per-conversation stream guard (not per-user); concurrent multi-conversation streaming is allowed
    (server has no per-user lock).

---

## 2. NON-NEGOTIABLE: new-chat → real-id Router Deception Protocol

Hard-won; emerged from real debugging pain. Next re-renders (and, on a `force-dynamic` route, **refetches**)
the instant it detects a route change — mid-stream that wipes/flickers streaming UI. The URL must change for
the user *before* the stream finishes, but Next's router must not be notified until completion.

| Step | Behavior | New home |
|---|---|---|
| **1. Passive pathname read bails mid-flight** | a path-sync effect that returns early while `isStreaming \|\| urlTransitionInFlight`; during this window the active conversationId comes from the registry rekey callback, **not** `usePathname()` | **façade** effect |
| **2. Shallow `replaceState` on first real id** | `window.history.replaceState(null,"","/chat/"+realId)` — updates the URL **without** notifying Next; set the transition flag; rekey the store `"new-chat" → realId` | **registry `rekey()`** |
| **3. Mandatory `router.replace` on completion** | on `applyResponse(done)` for a new-chat transition: `router.replace("/chat/"+realId,{scroll:false})`, then clear the flag. **MUST, not "if needed."** | **façade** via `onRekey` seam |

**Why step 1 must bail:** after step 2, `window.location.pathname` is `/chat/realId` but Next's
`usePathname()` still reports `/chat/new-chat` (raw `replaceState` doesn't sync Next's router — that's the
deception). If the passive effect ran, it would see the stale `new-chat`, mismatch the real active id, and
reset/wipe. Step 3 reconciles Next's pathname so the passive effect is safe to resume; clear the flag only
after. **Resilience bonus:** because streaming state now lives in the external store (not React `useState`),
a stray re-render no longer *wipes* it — the protocol's remaining job is preventing the `force-dynamic`
refetch + flicker.

> The two existing implementations of this (`ai-chat-context.tsx` + the now-dead `conversation-id-context.tsx`)
> are consolidated into the registry. `urlTransitionInFlight` lives on the status snapshot.

---

## 3. Selector strategy — owned split-snapshot surfaces (primary), official shim (escape hatch)

The review surfaced a real concern: `use-sync-external-store` ships on a slow cadence and React's ecosystem
has churned. The package is now installed (`apps/web-next/package.json`: `use-sync-external-store: catalog:store`
→ `^1.6.0`; `@types/use-sync-external-store ^1.5.0`), so it's available — but the architecture should **not
lean on it for the critical path**. Resolution:

**Primary mechanism — narrow, referentially-stable snapshot surfaces, each consumed by React-core
`useSyncExternalStore` with NO selector memo.** The store publishes one `(subscribe, getSnapshot)` pair per
concern; each surface's snapshot object identity changes *only* when that slice changes, so subscribers never
re-render on unrelated mutations and there is **zero render-phase ref/memo magic** — the safest possible shape
under React 19.2 + `reactStrictMode:true` + `reactCompiler:true`.

| Surface | `getXSnapshot()` returns | Changes when |
|---|---|---|
| `committed` | `readonly MessageSingleton<true>[]` | hydrate / commit / prepend / reconcile / patch |
| `feed` | `readonly MessageSingleton<true>[]` (committed + draft synthetic) | commit **or** chunk |
| `draft` | `ChatDraft \| null` | per chunk |
| `status` | `ChatStatus` (flags, title, ids, phase, `urlTransitionInFlight`) | flag/title/id flips |
| `conversationMeta` | `{ conversationId, title }` | sidebar-narrow; rekey/title only |
| `error` | `string \| null` | error/clear |

Each surface has its own listener `Set` and its own cached snapshot; a reducer rebuilds only the affected
surfaces and notifies only their listeners. `getServerSnapshot` per surface returns a frozen empty constant
(`EMPTY_LIST` / `null` / `EMPTY_STATUS`). Hooks are trivial:

```ts
// hooks/use-chat-store-selector.ts (the ONLY React file that touches the store)
export function useChatFeed(store: ChatStore) {
  return useSyncExternalStore(store.subscribeFeed, store.getFeedSnapshot, store.getFeedServerSnapshot);
}
// ...useChatCommitted / useChatDraft / useChatStatus / useChatConversationMeta / useChatError likewise
```

**Escape hatch:** for any *future* derived sub-pick that doesn't warrant its own surface, the installed
`useSyncExternalStoreWithSelector` from `use-sync-external-store/shim/with-selector` is sanctioned. It is
React-team-authored and now an explicit dep, so there is no friction — but the core flows above never import
it, so the package's cadence is irrelevant to the critical path. **Do not** hand-roll a render-phase
`{version,value}` ref cache under any circumstances (Strict-Mode double-invoke poisons it; the React Compiler
forbids render-phase ref mutation).

> This supersedes the single-`ChatSnapshot`-plus-selector design from earlier drafts. The store still keeps
> one coherent internal state; it just *publishes* it through several stable surfaces instead of one wide
> snapshot. `version`/`prependVersion` counters remain for debug/anchoring signals, not as the render trigger.

---

## 4. Store location, naming, files

Plain state machine under `apps/web-next/src/state/chat/`. No barrels; explicit `.ts` imports. **Class
internals use `private`, not `#`** (matches repo style — `#` appears only in credential/crypto/redis classes;
this is not a security boundary; `private` is friendlier to Fast Refresh, tests, profiler, and the
`window.__chatStoreSnapshot` debug path). Invariants are enforced by the public command API + tests, not
runtime field privacy.

**Create:**
- `state/chat/chat-store-types.ts` — snapshot/surface/draft/phase/command-param types; frozen `EMPTY_*`.
- `state/chat/chat-message-workup.ts` — `orderBlocks`, `mergeBlock`, text/thinking extraction,
  `extractCommittedMessage`, `messageComparator`. Pure, React-free.
- `state/chat/chat-store.ts` — the `ChatStore` class (surfaces, reducers). React-free.
- `state/chat/chat-store-registry.ts` — singleton registry; `getOrCreate` (client-only), `bindClient`,
  routing, rekey, eviction, `debugSnapshot`.
- `state/chat/chat-store.test.ts` — `node:test` reducer suite.
- `hooks/use-chat-store-selector.ts` — the per-surface hooks (the only store-touching React module).
- `hooks/use-send-chat.ts` — assembles `AIChatRequest` + optimistic user message; per-conversation guards.
- `hooks/use-hydrate-chat-store-from-swr.ts` — feeds settled SWR pages into `store.hydratePage`.
- `lib/draft-to-message.ts` — `draftToStreamingMessage` / `appendDraft` adapter (display-only).

---

## 5. Snapshot types

```ts
export type ChatStreamPhase =
  | "idle" | "awaiting-id" | "streaming" | "interrupted" | "complete" | "error";

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

export interface ChatStatus {
  readonly conversationId: string;
  readonly title: string | null;
  readonly phase: ChatStreamPhase;
  readonly isStreaming: boolean;
  readonly isComplete: boolean;
  readonly isWaitingForRealId: boolean;
  readonly isNewChat: boolean;
  readonly urlTransitionInFlight: boolean;
  readonly currentUserMsgId: string | null;
  readonly currentAiMsgId: string | null;
  readonly currentImgGenAttachmentId: string | null;
  readonly imgGenEnabled: boolean;
  readonly imgGenFields: AIChatResponseImgGenFieldsFinal | null;
  readonly prependVersion: number;
}
```

The store keeps private mutable registries and publishes the surfaces of §3. Internal note: `committed` stays
referentially stable across chunks (the perf invariant); `feed` recomposes on chunk **or** commit but is
memoized on mutation (never rebuilt inside a `getSnapshot` call — that would loop under Strict Mode).

---

## 6. SSR & registry safety (correctness + privacy, not just perf)

The chat route is an `async` server component (`page.tsx`, `dynamic="force-dynamic"`) rendering the
`"use client"` `<ChatInterface>` **directly** (not via `next/dynamic ssr:false`); the façade replaces
`AIChatProvider` in the **server-rendered** provider tree (`(chat)/layout.tsx`). So the façade body runs on
the Node server for initial HTML. A module-singleton `Map<string, ChatStore>` whose façade calls
`getOrCreate` *during render* would mutate a **process-global, cross-request, cross-user, never-evicted** Map
server-side (the existing `WebSocketManager` avoids this only because its Map is mutated solely inside a
`useEffect`).

Rules: **never** call `registry.getOrCreate` during server render; `getServerSnapshot` returns frozen empties
and touches nothing; resolve stores client-only (`typeof window !== "undefined"` / inside an effect or the
subscribe path); SSR fidelity comes from the route seed / SWR `fallbackData`, never a server-populated store.

---

## 7. Registry responsibilities + WS lifecycle binding

The registry owns: stores keyed by conversationId; client-only `getOrCreate`; `bindClient`/`unbindClient`
with **one stable listener function**; routing of `ai_chat_chunk` / `ai_chat_response` / `ai_chat_error` by
`evt.conversationId`; rekey `"new-chat" → realId` (and the §2 protocol seam); bounded eviction; connectivity
interruption detection; `debugSnapshot(conversationId)`.

The WS client is **not a stable singleton** — it's `useMemo(() => new ChatWebSocketClient(wsUrl), [wsUrl])`
recreated on user-id change, and `close()` clears all listeners. So the store's subscription lifetime is owned
by a React effect keyed on client identity:

```ts
useEffect(() => chatStoreRegistry.bindClient(client), [client]); // returns unbind
```

Requirements: stable listener identity (Set-dedup makes bind idempotent); StrictMode mount→unmount→mount
leaves no duplicate/orphaned listeners; reconnect after a `close()` re-binds via this effect (not the socket);
all mutations are **id-keyed idempotent** (commit by `message.id`; draft last-write-wins per conversation).

---

## 8. Store internals & public command API

```ts
// private, not #
private byId = new Map<string, MessageSingleton<true>>();
private messageIds = Array.of<string>();
private committedList = Array.of<MessageSingleton<true>>();
private feedList = Array.of<MessageSingleton<true>>();
private optimisticToServerId = new Map<string, string>();
private optimisticAttachmentDrafts = new Map<string, string>();
```

```ts
subscribeCommitted/Feed/Draft/Status/ConversationMeta/Error(l): () => void
getCommittedSnapshot/...Server(): <surface>      // stable per §3
hydratePage(page): void
prependHistory(params): void
beginSend(params): void
applyChunk(evt): void
applyResponse(evt): void
applyError(evt): void
markInterrupted(params): void
retryInterrupted(params): void
reconcileUserId(params): void
patchAttachmentUrls(params): void
patchMessageReaction(params): void
adoptSnapshot(params): void          // rekey transplant
clearError(): void
resetStreamingState(): void
```

No generic `setState(partial)`.

---

## 9. Reducer semantics (deltas over earlier drafts in **bold**)

- **`hydratePage`** — ignore wrong-conversation pages; merge by id; preserve identity for unchanged rows;
  don't clear an active draft; don't duplicate the optimistic user message; sort via `messageComparator`;
  recompute `committed`+`feed` only when changed. Idempotent.
- **`beginSend`** — append optimistic user message; **record whether it had attachments**; reset transients;
  empty draft; `phase = isNewChat ? "awaiting-id" : "streaming"`; `isWaitingForRealId` only for new-chat;
  `currentUserMsgId = optimistic id`; **per-conversation** stream guard; dup-click guard keyed
  `${conversationId}-${prompt}` (500ms).
- **`applyChunk`** — update only `draft` + `status` (+ recompose `feed`); merge blocks by ordinal; derive
  text/thinking; preserve legacy chunk-only; accumulate imgGen partials; **preserve `imgGenFields` /
  `imgGenEnabled` / `imgGenAttachmentId`** (the load-bearing image channel — there is no separate
  `image_gen_*` path); request registry rekey when a real id first appears for new-chat; **keep `committed`
  referentially identical.**
- **`applyResponse`** — `committed = evt.convo.messages.at(0)`; if missing → typed protocol error; **rekey
  from `evt.conversationId`, title from `evt.title`** (convo.id/title are redundant; only
  `evt.convo.conversationSettings` is new — read only if a consumer needs it pre-cold-load); reconcile
  optimistic user id via `evt.userMsgId`; commit AI message by `committed.id`; drop draft; set
  `isStreaming=false`, `isComplete=evt.done`, `isWaitingForRealId=false`; **if new-chat transition && done,
  signal the façade to run the mandatory `router.replace`**; never `finalizeStreamingMessage`; don't rebuild
  final attachments from draft imgGen.
- **`applyError`** — clear draft; `phase="error"`; `error=evt.message`; `isStreaming=false`;
  `isComplete=true`; preserve committed + optimistic user message; follow a real id; clear the
  per-conversation guard.
- **`markInterrupted`** — on disconnect/unrecoverable close, transition streaming drafts to `"interrupted"`,
  keep draft content visible, surface Retry, unlock the per-conversation guard. Never spin forever.
- **`reconcileUserId`** — replace the optimistic user id key with `evt.userMsgId`, preserving display position
  (the temp→real swap from `dynamic/index.tsx`, now owned by the store).
- **`patchAttachmentUrls`** — replace cdnUrl/publicUrl on the in-flight optimistic user message keyed by
  `draftId` (the async upload reconciliation from `dynamic/index.tsx:243-288`, now a store action).
- **`patchMessageReaction`** — upsert `liked`/`disliked` (or the full returned row) on a committed message by
  id; called from the `rxnAction` result (§17).

---

## 10. Eviction

Bounded LRU; default cap ~12; update `lastAccess` on `getOrCreate`; **never** evict a store with live
subscribers, a non-null draft, or phase `"streaming" | "awaiting-id" | "interrupted"`. Mandatory (the project
targets mobile; unbounded retention OOMs the tab over a long session).

---

## 11. Disconnect & resume

The ws-server **already** implements Redis-backed resume: it persists stream state (every ~10 chunks, 1h TTL,
key `stream:state:<convId>`) and, when the client **re-sends `ai_chat_request`** for that conversation,
replays buffered chunks via a catch-up `ai_chat_chunk` (and a `stream:resumed` signal). Critical on ECS
Fargate (120s stopTimeout drops in-flight streams on every deploy).

Web-next behavior: detect disconnect/close while a store is streaming (registry watches `client.isConnected`
/ `onclose`/`onopen`); `markInterrupted`; present Retry (or approved auto-resume); on retry, **re-send the
original `ai_chat_request`** and accept the catch-up `ai_chat_chunk` as authoritative draft replacement
(de-dupe against already-rendered text). `stream:resumed` is **not** in `@slipstream/types` `EventTypeMap`;
the web-next-only default ignores it and relies on the catch-up chunk. A first-class resumed signal is a
**separate shared-contract change** (add to `packages/types` + allowlist + handler) — out of scope unless
approved. **Default: interrupted-state + explicit Retry first.**

---

## 12. Ordering

The store owns display order. `messageComparator`: `createdAt` ascending (normalize via
`new Date(x).getTime()` — JSON serializes `Date` → ISO string; `cuid(2)` ids are **not** chronological);
tie-break user-before-AI; final tie-break by id. Merge precedence: existing local rows win over re-fetched
history for the same id; `applyResponse` overwrites by id (authoritative).

---

## 13. SWR & API contract

```ts
export interface ConversationMessagesPage {
  readonly convo: ConversationSingleton<true>;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
```

Add `getConversationMessagesPage(conversationId, take, cursorId?)` to `orm/user-message-service.ts`: query
`createdAt desc`; fetch **`take + 1`**; `hasMore = rows.length > take`; page = first `take`;
`nextCursor = oldest page row id when hasMore else null`; keep the deep includes (blocks, attachments+metadata,
ttsJob, imageGenJob) + `bigintToInt`; `return … satisfies ConversationMessagesPage`. Point both routes
(`.../chat/[conversationId]/route.ts`, `.../messages/[cursorId]/route.ts`) at it.

Convert `use-conversation-messages.ts` to a **loader**: fetch pages; expose `loadMore`, loading flags, errors;
skip `"home"`/`"new-chat"`; no focus/reconnect revalidation; delete `appendMessage`/`removeMessage` and the
`conversation` memo as the read model. `use-hydrate-chat-store-from-swr.ts` feeds settled pages into
`store.hydratePage`. Store is the single read model.

---

## 14. Scroll anchoring (ships WITH `prependHistory`)

Upward pagination is brand-new (today the feed only appends, with no anchoring). Before prepend, capture
`scrollHeight`; after commit (layout effect/RAF) set `scrollTop += newScrollHeight - oldScrollHeight`; suppress
the bottom auto-scroll + the conversation-change force-to-bottom during prepend; drive it off the discriminated
**`prependVersion`** store signal (not `messages.length`); set `overflow-anchor: none` on the scroll container.

---

## 15. Optimistic user-message fidelity

`ai_chat_response.convo.messages[0]` is the **AI** message only (server builds `convo` with
`include.messages take:1`); the user message is persisted separately and not returned (only `userMsgId`). So
the store must **own the optimistic user row** and converge it: `reconcileUserId` on completion; text-only
sends converge via id-swap; **attachment-bearing sends** must reconcile server-normalized attachments —
`buildOptimisticAttachment` hard-codes `status:'UPLOADING'`, `compatStatus:'PENDING'`, fake `draft-` id, null
`s3ObjectId/versionId/etag`, which otherwise persist until a cold reload. **Recommended:** after
`applyResponse(done)` for an attachment send, trigger an SWR page-0 `mutate`/refetch and reconcile the user
row into the store (gate on "had attachments" to avoid a round-trip on every text send). Robust future option
(shared-contract): server returns the persisted user message (`take:2` or a dedicated field). Don't leave
attachment-bearing optimistic rows permanently stuck.

---

## 16. Completion flash

The current `200ms/202ms` timers mask a real transition: `MessageBubble` renders streaming markdown
**synchronously** but switches to an **async** `processMarkdownToReact` on completion, briefly falling back to
raw text. Swapping the synthetic `streaming-<convId>` draft for `evt.convo.messages[0]` (different identity/key)
forces a remount and would flash. **Fix:** key the committed bubble identically to the draft where possible
(use the known real `aiMsgId`), pre-warm/preserve the markdown cache on swap, or retain a short RAF defer
before dropping the draft. Do **not** set completion synchronously *and* drop the draft unless the completed
render path is cache-warm.

---

## 17. Reactions

`useReaction(message)` seeds hook-local state **once** from `message.liked/disliked`; with `React.memo` + a
store-owned re-committed row, that seed-once diverges (stale like state). Persistence is the `rxnAction`
**server action** (returns the full updated `MessageSingleton<true>`, calls `refresh()`), **not** WebSocket —
the `user_rxn_update*` WS types are dead (no emitters/consumers). **Fix:** make the committed store row the
source of truth — call `store.patchMessageReaction(conversationId, message.id, { liked, disliked })` from the
`rxnAction` result inside `useReaction`'s transition, and key `useReaction` off `message.id` so it re-derives
on row replacement. **No** WebSocket reaction reducer.

---

## 18. Image-gen & thinking + confirmed-SAFE (don't over-build)

Chat image generation rides on `ai_chat_chunk`/`ai_chat_response` via `imgGenFields` / `imgGenEnabled` /
`imgGenAttachmentId` — the standalone `image_gen_*` event family is **dead/unwired** (the resolver dispatch has
no `image_gen_request` case). **Do not** add `image_gen_*` handlers; **do** preserve those three fields through
`applyChunk`/`applyResponse` + the draft adapter. `ai_chat_inline_data` is a Gemini-only diagnostic (its `data`
is a byte-count string) consumed by nothing — **ignore it**. On final response, final images come from the
committed server attachments; clear draft imgGen fields; don't rewrite attachment ids from draft. Thinking text
derives from message blocks (legacy chunk fields still supported).

**Also confirmed safe — no store reducers needed:** reactions (server action + hook state), TTS (`Map<messageId>`
cache seeded *from* `message.ttsJob`, store→context), assets (keyed by `draftId`/`batchId` on the pre-send
pipeline; baked into the message before commit). The only message-row mutations the store must own are
§15 (optimistic user) and §17 (reaction source-of-truth).

---

## 19. `AIChatContext` façade

Keep `AIChatProvider` / `useAIChatContext`. Responsibilities: bind/unbind the registry in
`useEffect([client])`; resolve the active store (client-only); the §2 router-deception coordination (passive
path effect bails on `isStreaming || urlTransitionInFlight`; mandatory `router.replace` on the `onRekey`
completion seam); expose store-selected state + `sendChat` + `isConnected` (from WS context) + the active
`store` (so `ChatInterface` subscribes via §3 hooks). It must **not** own messages/draft, register chat handlers
via `client.on`, mirror fields into refs, or finalize assistant messages. Net ~120 lines.

---

## 20. `ChatInterface` migration

Keep UI-local only: queued prompt, initial-prompt-consumed flag, sessionStorage handoff, input flow. Remove
local ownership of: committed timeline, streaming row, finalization effect, id reconciliation, imgGen final
reconciliation. New shape:

```ts
const { store, sendChat, isConnected, ...status } = useAIChatContext();
const feedMessages = useChatFeed(store);   // committed + draft, stable surface
const draft = useChatDraft(store);
```

`handleUserMessage` calls `sendChat` (never `setMessages`). Seed from `initialMessages` during the store-core
phase; remove that path once SWR hydration owns cold history. Sidebar swaps to `useChatConversationMeta(store)`
(narrow surface — no per-token re-render).

---

## 21. Rendering performance

Invariants: chunks don't rebuild `committed` or change committed object identity; draft updates change `feed`
not `committed`; final response = one committed update. Component changes: **`React.memo` on `MessageBubble`**;
pass `live*` props only to the streaming message; remove the imgGen debug `console.log` effects in `ChatFeed` +
`MessageBubble`; verify auto-scroll still follows draft text/thinking. Optional later: split committed list and
streaming draft bubble — not required if memo + stable identity hit the target profile.

---

## 22. Route strategy

End-state: no transcript fetch in `page.tsx`; auth stays in `(chat)/layout.tsx`; client surface receives route
params; SWR hydrates after mount; metadata stays cheap (title-only or generic) and never reintroduces the heavy
fetch. **Done after** the store is proven under the current route seed.

---

## 23. Debug hook (`window.__chatStoreSnapshot`)

Already declared in `apps/web-next/index.d.ts` (inside the existing `declare global` block):

```ts
interface Window {
  dataLayer?: object[];
  __chatStoreSnapshot?: <T = unknown>(conversationId?: string) => T;   // already present
}
```

Assign **dev-only, client-only**, reading through the registry; the `as T` is the one tolerated boundary cast
(intentional DevTools opt-in, like `JSON.parse<T>()`), never used by app logic:

```ts
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  window.__chatStoreSnapshot = <T = unknown>(conversationId?: string) =>
    chatStoreRegistry.debugSnapshot(conversationId) as T;
  // cleanup on bridge unmount: delete window.__chatStoreSnapshot
}
```

Expose a read-only snapshot function (not the store/registry). Typed app code uses a normal imported helper
`getChatStoreSnapshot(conversationId?)` → `registry.debugSnapshot(...)` (precise `ChatSnapshot`), never `window`.

---

## 24. Package & script changes

1. **`use-sync-external-store`** is already an explicit `@slipstream/web-next` dependency
   (`package.json` → `catalog:store` → `^1.6.0`; types `^1.5.0`). No action; §3 keeps it off the critical path.
2. **Add a `test` script** (none exists today) using the repo's existing zero-framework convention (matches
   `apps/ws-server` + `packages/img-gen`; `tsx` is already a devDep):
   ```json
   "test": "node --test --import tsx --test-reporter spec"
   ```

---

## 25. Tests (`node:test` + `node:assert/strict`)

The React-free reducer/registry layer is unit-testable before any UI wiring. Cases: hydrate merges by id;
repeated hydrate idempotent; chunk updates draft and **preserves the `committed` reference**; blocks merge by
ordinal; response commits `evt.convo.messages[0]`; optimistic user id reconciles; attachment send triggers the
reconcile path; new-chat rekey preserves draft + optimistic user; interrupted transition; error preserves
committed; LRU skips subscribed/streaming/draft stores; a surface subscriber doesn't fire for unrelated-surface
mutations. **Hard requirement:** `chat-store.ts` imports no React (the `useSyncExternalStore` binding lives only
in `use-chat-store-selector.ts`). Verify path aliases resolve under `tsx` (ws-server already does this; a
`--tsconfig` flag may be needed).

---

## 26. Implementation sequence

1. **React-free store core + tests.** Types, message-workup, store (surfaces + reducers incl.
   `markInterrupted`/`reconcileUserId`/`patchAttachmentUrls`/`patchMessageReaction`), registry (rekey, LRU,
   `debugSnapshot`), comparator, `node:test` suite. Consolidate rekey here.
2. **Selector hooks + façade.** Per-surface hooks (React-core); rewrite `AIChatProvider` as façade; bind via
   `useEffect([client])`; implement the §2 protocol (passive bail / registry `replaceState` / mandatory
   completion `router.replace`); client-only `getOrCreate` + `EMPTY` server snapshots; wire `window.__chatStoreSnapshot`.
3. **UI reads store.** Migrate `dynamic/index.tsx` to surfaces; `React.memo` on `MessageBubble`; delete the
   four reconciliation effects; sidebar → `useChatConversationMeta`; reaction source-of-truth (§17); completion
   flash (§16). **End of cornerstone unit.**
4. **SWR/API + pagination.** `ConversationMessagesPage` + `getConversationMessagesPage` (`take+1`); update both
   routes; loader conversion + hydration bridge; scroll anchoring (§14); attachment-bearing user reconciliation
   on done (§15).
5. **Disconnect recovery.** Interrupted-state UX + explicit Retry (default); rely on catch-up `ai_chat_chunk`
   after re-sending the request; `stream:resumed` first-class signal only if approved (shared-contract).
6. **Client route.** Remove `getConversationRouteProps`; SWR hydrates after mount; simplify metadata; add
   eviction wiring/verification.
7. **Cleanup.** Delete `finalizeStreamingMessage`, `createAIMessage` (if unused), the `initialMessages` seed
   path, dead full-transcript service methods, **`conversation-id-context.tsx` (dead — see §27)**, debug logs.
   Keep `createUserMessage` (used by `useSendChat`).

---

## 27. File-level change list

**Create:** the 9 files in §4.

**Modify:** `package.json` (test script); `context/ai-chat-context.tsx` (→ façade); `context/chat-ws-context.tsx`
(bind timing); `hooks/use-conversation-messages.ts` (→ loader); `hooks/use-reaction.ts` (store source-of-truth);
`ui/chat/dynamic/index.tsx`; `ui/chat/chat-feed/index.tsx` (drop log; prepend anchoring); `ui/chat/message-bubble/index.tsx`
(`React.memo`; drop log); `ui/chat/sidebar/index.tsx`; `app/(chat)/chat/[conversationId]/page.tsx` (phase 6);
the two API routes + `orm/user-message-service.ts` (phase 4); `types/ui.ts` (Page type + slim `ChatInterfaceProps`);
`lib/ui-message-helpers.ts` (delete `createAIMessage`/`finalizeStreamingMessage`).

**Delete:** `context/conversation-id-context.tsx` — **grep-verified zero consumers and not mounted anywhere**
(`useConversationIdContext`/`ConversationIdProvider` have no references outside the file). It's dead code whose
only behavior would be a latent single-handler `client.on` collision; the registry's `addListener` + the
consolidated rekey replace it. (This refines the v2 "live collision" note — it is latent, not active.)

**Avoid modifying:** `apps/web`, `apps/ws-server`, `packages/*` — except an approved shared-contract change if a
first-class `stream:resumed` UI is chosen (§11).

---

## 28. Verification

```bash
pnpm --filter=@slipstream/web-next test
pnpm --filter=@slipstream/web-next typecheck
pnpm --filter=@slipstream/web-next lint
pnpm build:web-next        # root Turbo script, not a scoped build
```

Manual: long existing convo (first-page hydration; load-older preserves scroll position); send in existing
convo; send from `/chat/new-chat` (shallow URL change mid-stream, mandatory router reconcile on completion, no
reload/wipe); attachment send (user attachments reconcile to server-normalized); image-gen (partials → committed
final); reasoning model (thinking live + final); `ai_chat_error`; disconnect mid-stream → interrupted/Retry →
reconnect resumes; reactions consistent after row replacement. Profiler: committed rows don't re-render per
token; sidebar doesn't re-render per token; final response = one committed update; chunks don't mutate `committed`.

---

## 29. Acceptance criteria

**Functional:** final AI messages committed only from `evt.convo.messages[0]`; optimistic user ids reconcile;
attachment-bearing user messages converge to server-normalized state; new-chat preserves the router deception
protocol; disconnect never leaves infinite spinners or permanent send locks; upward pagination preserves
viewport; reactions consistent after row updates; route eventually stops server-fetching the transcript.
**Performance:** chunks preserve the `committed` reference; committed rows + sidebar skip per-token re-render;
400–600+ message convos stay responsive. **Quality:** store core React-free; reducer tests exist; no `any`, no
`.filter(Boolean)`, no bare assertions, no zod, no third-party state manager, no exceptions for expected control
flow; `private` (not `#`) internals.

---

## 30. Final recommendation

Build the React-free store core first and prove it with `node:test`. Subscribe the UI through **narrow stable
snapshot surfaces** (React-core `useSyncExternalStore`, no render-phase memo) — keeping the installed selector
shim available but off the critical path. Keep `AIChatContext` a façade. Consolidate rekeying into the registry
and preserve the router deception protocol exactly. Make SWR a cold-history loader, not the read model. Commit
final AI messages from `ai_chat_response.convo.messages[0]`. Own the optimistic user row (ids + attachments),
recover interrupted streams, anchor upward pagination, and keep reactions sourced from the committed row.

The boundary is correct. v3 is the set of real lifecycle, routing, pagination, recovery, and rendering edges
that make that boundary survive contact with this codebase — now grounded in verified facts and locked decisions.

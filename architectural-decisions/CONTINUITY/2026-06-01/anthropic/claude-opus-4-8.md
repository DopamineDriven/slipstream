# Continuity Handoff — `web-next` chat `useSyncExternalStore` refactor (Phase 1)

> Written 2026-06-01 by Claude Opus 4.8 at ~98% context. This is your handoff. **Read this top to bottom,
> then read the three already-written files + the build playbook + the memories listed below before
> writing anything.** Everything compiles green (`pnpm --filter=@slipstream/web-next typecheck`).

---

## 0. Mission

Rebuild the `apps/web-next` chat frontend around ONE hand-written `useSyncExternalStore` chat store — "React
is a sweet summer child," not the load-bearing transcript engine. The WebSocket server is the source of truth.
Replace the brittle 903-line `ai-chat-context.tsx` (useState/useRef thrash) with a store. No third-party state
libs, no zod. **`apps/web-next` is a deliberate SANDBOX CLONE of prod `apps/web` — never touch `apps/web`;
commit locally, never push; intermediate breakage is fine.**

**Build doc of record:** `architectural-decisions/2026-05-31/claude-react-sweet-summer-child-final.md` (the
phased playbook). Also `claude-react-sweet-summer-child-v3.md` (deep rationale) + `architectural-notes.md` (the
6-phase plan-of-attack). Approved plan: `/home/dopaminedriven/.claude/plans/gleaming-fluttering-quail.md`.

**Phases:** (1) Store core ← **IN PROGRESS**; (2) SWR/API pagination; (3) façade + UI store-rewire (under the
existing route); (4) route→client; (5) local ws-server+web-next manual test; (6) Playwright e2e. Phase 3 & 4
land as separate commits, façade-first (UI store-driven under the existing route, THEN swap the route to SWR).

---

## 1. STATUS — what's done, what's next

New module: **`apps/web-next/src/state/chat/`**

- ✅ **`store-types.ts`** — types. green.
- ✅ **`message-workup.ts`** — `ChatMessageWorkup` base class. green.
- ✅ **`store.ts`** — `ChatStore extends ChatMessageWorkup`. green.
- ⬜ **`store-registry.ts`** — **WRITE THIS NEXT** (detail in §5).
- ⬜ **`store.test.ts`** — `node:test` after the registry.
- Later: `hooks/use-chat-store-selector.ts`, `hooks/use-send-chat.ts`, `hooks/use-hydrate-chat-store-from-swr.ts`,
  `lib/draft-to-message.ts` (Phase 2/3).

**Read the three written files** — they're heavily doc-commented and are the source of truth for the API. Key
shapes:

- `ChatDraft = readonly AIChatChunk[]` — the raw chunk frames, reflexive, throwaway (dropped on response); the
  live bubble is DERIVED at the render boundary in Phase-3 `draft-to-message.ts`, never stored. (We went back
  and forth and landed here: do NOT reshape the chunk; the draft is just the array of `AIChatChunk` received.)
- `ChatConversation = DX<RTC<ConversationSingleton<true>, "messages" | "conversationSettings">>` — the envelope
  (singleton with those two flipped optional via the repo's `RTC`).
- `ChatStatus` = `{ conversationId, title, isStreaming, isInterrupted, isNewChat, urlTransitionInFlight }` —
  derived public flags. `ChatStreamPhase` (`idle|awaiting-id|streaming|interrupted|complete|error`) is **private
  internal**, never on a surface.
- `ChatStore` exposes **5 surfaces** — `committed | draft | status | conversation | error` — each with
  `subscribeX` / `getXSnapshot` / `getXServerSnapshot` (stable arrow props) + a listener `Set` + a cached
  snapshot. A reducer notifies ONLY the surfaces it touched. `committed` rebuilds only on hydrate/send/commit/
  reaction (NEVER per chunk → the perf invariant; only `draft` changes per token). The composed **`feed`**
  (committed + draft synthetic bubble) is assembled in the Phase-3 hook, NOT the store.
- Reducers: `ingestConversation(convo)` (unified merge — used by `hydratePage` AND `applyResponse`), `hydratePage`,
  `beginSend(request, optimisticUser)`, `applyChunk(evt)`, `applyResponse(evt)`, `applyError(evt)`,
  `markInterrupted()`, `patchMessageReaction(message)`, `clearError()`, `resetStreamingState()`. Registry-facing:
  `setConversationId(id)`, `setUrlTransitionInFlight(bool)`, `isAwaitingRealId()`, `debugSnapshot()`.

---

## 2. HARD-WON PROTOCOL FACTS (verify against code; these drove the design)

These are in `/home/dopaminedriven/.claude/projects/.../memory/` — **read them** (auto-loaded, but re-read):
`project_first_chunk_carries_id_title`, `project_message_block_streaming`, `project_response_convo_user_and_ai`,
`project_asset_pipeline_separate`, `project_img_gen_live_flow`, `project_newchat_router_deception`. Summary:

1. **`packages/types/src/events.ts` `EventTypeMap` is the contract of contracts.** The store's reducer inputs ARE
   the real wire types (`AIChatChunk`/`AIChatResponse`/`AIChatError`/`AIChatRequest`), consumed verbatim. **The
   store NEVER fabricates a server event** (no synthetic `ai_chat_error` — `applyError` fires only from a real
   server error routed by the registry). This was a fix the user caught.
2. **First `ai_chat_chunk`** always carries the real `conversationId` + `title` (DB persists the request
   immediately) → the new-chat rekey is deterministic, no fallback. `userMsgId` is present from the first chunk;
   `aiMsgId` is `undefined` until `ai_chat_response` (a convenience mirror of `convo.messages[0].id`).
3. **`ai_chat_response.convo`** returns the **two** most recent messages: `messages[0]` = AI, `messages[1]` =
   user (both fully server-persisted). Server: `apps/ws-server/src/prisma/chat-response.ts` (`take: 2`,
   `orderBy createdAt desc`). `applyResponse` ingests the WHOLE convo (commits AI + reconciles the optimistic
   user, gated on the `user` row being present so a degenerate payload can't orphan it).
4. **Message blocks:** `ChatChunkAndResMsgBlock` (wire) is a subset of DB `MessageBlock`. `ai_chat_chunk`
   carries ONE block; `ai_chat_response` an array (but the response array is UNUSED — `convo.messages[0]` wins).
   `ordinal` is authoritative — merge/replace by ordinal, sort ascending, don't second-guess. Blocks emit at
   reasoning enter/exit + tool boundaries, NOT per token (per-token text rides the `chunk?: string` delta).
   The draft-block array materializes only at the render boundary (Phase 3), from the chunks' single blocks.
5. **Asset pipeline is a SEPARATE state machine — DON'T touch it.** Attachments are uploaded/reconciled BEFORE
   send and joined to the message server-side during `ai_chat_request` via a shared `batchId` (each has a
   `draftId`). On response, user-upload attachments come on `convo.messages[1].attachments`, AI-generated
   (image-gen) on `convo.messages[0].attachments` — both arrive free via `ingestConversation`. The chat store
   has ZERO attachment responsibility (no `patchAttachmentUrls`, no `hadAttachments`, no refetch).
6. **`imgGenEnabled`** = user-driven UI toggle owned by `ImageGenProvider`/`useImageGen()` (image-gen-capable /
   OpenAI-"facilitating" models only); the send path stamps it + `fields` onto the request. `imgGenFields` =
   progressive partials, ride the chunks → live in the draft. Model behaviors (Phase-3 derivation must be
   model-agnostic/additive, never "img-gen ⇒ no text"): **OpenAI** = reasoning + PARTIALS + final + summary text;
   **Grok** = sometimes-reasoning + ONE image (no partials) + sometimes-summary; **Gemini** = heavy reasoning
   (20-30s+) + full conversational text WHILE generating + image (no partials). **Only OpenAI emits partials.**
7. **Router deception protocol (NON-NEGOTIABLE)** for new-chat → real-id: (a) the façade's passive pathname
   effect bails while `isStreaming || urlTransitionInFlight`; (b) the **registry** does a shallow
   `window.history.replaceState(null,"","/chat/"+realId)` on the first real-id chunk + `setUrlTransitionInFlight(true)`
   (does NOT notify Next's router); (c) the façade fires a **MANDATORY** `router.replace("/chat/"+realId,{scroll:false})`
   at completion, then clears the flag. After (b), `usePathname()` still reports `new-chat` — the active id comes
   from the registry/local state, NOT pathname. The store survives stray re-renders (state is external), so the
   protocol's job narrows to preventing the `force-dynamic` refetch + flicker. **Don't simplify this.**
8. **`AIChatProvider` is the INNERMOST provider** in `apps/web-next/src/app/(chat)/layout.tsx` (order:
   `ChatWebSocket → ModelSelection → ApiKeys → SettingsDrawer → Asset → ImageGen → TTS → AIChat`). It's a pure
   leaf CONSUMER of everything upstream, owns nothing downstream. The new store provider must stay innermost;
   `use-send-chat` consumes `useImageGen`/`useAssetUpload`/`useModelSelection`/`useApiKeys`/ws/cookies.
9. **`ordinal`** is now a REQUIRED `Int` on `Message` with `@@unique([conversationId, ordinal])` (prod-deployed,
   backfilled gapless 0..n-1 by createdAt; server assigns on create in chat-req/chat-res). So `messageComparator`
   is just `left.ordinal - right.ordinal` (unique per conversation = unambiguous). The client-built optimistic
   user message has no server ordinal → `beginSend` assigns it `lastCommitted.ordinal + 1` (sorts last, matches
   the server's next assignment, self-corrected on commit). `MessageSingleton<true>.ordinal: number` (required).

---

## 3. WORKSPACE CONVENTIONS (non-obvious; from CLAUDE.md + the user)

- **Imports:** the repo uses **NodeNext + `.ts` extensions everywhere EXCEPT the UI package and the Next app
  (`apps/web`, `apps/web-next`), which are EXTENSIONLESS.** So in `web-next`: `import { X } from "@/state/chat/store"`
  (no `.ts`). `.ts` on type-only imports happens to slip past tsgo, but value imports with `.ts` error (TS5097).
  Use extensionless in web-next. `@/` → `src/`.
- **Class-based everything** (user requirement for this store). `ChatStore extends ChatMessageWorkup` (base =
  helpers, subclass = reducers/state), mirroring `GrokWorkupService → GrokCollectionsService`. Helpers are
  `protected`. Use `private` NOT `#` (repo style; `#` only in credential/crypto/redis).
- **Reuse `@slipstream/types` contracts, never redefine.** The singletons (`ConversationSingleton<true>`,
  `MessageSingleton<true>`, etc.) ARE the data model. `T` is always `true` in the Next realm (the API
  `bigintToInt`/`bigIntToIntMsg` + ws-server serialize bigint→number before the client). No `<T>` generic in
  store types. Use the repo utils: **`Rm` over `Omit`** (better DX), `CTR`/`RTC` to flip optionality, `DX` to
  flatten hovers.
- **The store is REFLEXIVE** to the wire protocol — honor event/singleton shapes, accumulate in place, no one-off
  domain reshaping, no fabricated server events.
- `Object.freeze` for shared snapshot singletons (runtime immutability) — NOT `as const` (compile-only).
- CLAUDE.md hard rules: no `any`, no `enum`, no barrels, no `.filter(Boolean)` (use type predicates),
  `satisfies`/`as const`, `Array.of<T>()`, `import type`, `void`-prefix fire-and-forget, let TS infer.
- **Typecheck:** `pnpm --filter=@slipstream/web-next typecheck` (tsgo, NOT npx tsc).
- **`use-sync-external-store@^1.6.0` is INSTALLED** (`apps/web-next/package.json` `catalog:store` + `@types`).
  BUT primary selector strategy = **narrow split-snapshot surfaces consumed by React-core `useSyncExternalStore`
  (no render-phase memo)** — the shim is an escape hatch, not the critical path (the user distrusts its release
  cadence; keep it off the core flows). `reactStrictMode:true` + `reactCompiler:true` are on, so NEVER hand-roll
  a render-phase ref-cache selector.
- **Debug hook:** `window.__chatStoreSnapshot?: <T = unknown>(conversationId?: string) => T;` is ALREADY in
  `apps/web-next/index.d.ts`. Wire it dev/client-only via `registry.debugSnapshot`. `store.debugSnapshot()` exists.

---

## 4. KEY EXTERNAL FILES (you'll consume these)

- `apps/web-next/src/utils/chat-ws-client.ts` — `ChatWebSocketClient`. **`client.addListener(fn)`** (~line
  442/508) fires for EVERY parsed event (multi-listener — use this for the store fan-out). `client.on(event,fn)`
  is SINGLE-handler (don't use for the store). `close()` (~529-530) clears `registry` + `listeners`. The client
  is `useMemo(() => new ChatWebSocketClient(wsUrl), [wsUrl])` (`use-chat-ws.ts`) → recreated on user-id change →
  bind from `useEffect([client])`.
- `apps/web-next/src/context/chat-ws-context.tsx` — `WebSocketManager` singleton (mirror its pattern for the
  registry), `useChatWebSocketContext()` exposes `client`, `sendEvent`, `isConnected`.
- `apps/web-next/src/context/ai-chat-context.tsx` — the 903-line context to gut → façade (Phase 3). Consumers of
  `useAIChatContext()`: ONLY `ui/chat/dynamic/index.tsx` + `ui/chat/sidebar/index.tsx` (closed set).
- `apps/web-next/src/context/conversation-id-context.tsx` — **DEAD** (grep-verified zero consumers, not mounted).
  Delete in Phase 3.
- `apps/web-next/src/context/image-gen-context.tsx` — `useImageGen()` (`enabled`, `fields`).
- `apps/web-next/src/ui/chat/dynamic/index.tsx` + `lib/ui-message-helpers.ts` — got `ordinal` added
  (`ordinal: 0` placeholders in dynamic literals; `ordinal: params.ordinal` in `createUserMessage`/
  `createAIMessage`). These are Phase-3 rewrite/deletion targets. `createAIMessage` + `finalizeStreamingMessage`
  get deleted in Phase 3; `createUserMessage` + `toMessageBlocks` survive.
- `apps/web-next/src/hooks/use-conversation-messages.ts` — the SWR hook (exists, UNWIRED, has a buggy
  `conversation` memo). Phase 2: → loader; the API routes return bare `ConversationSingleton<true>` not the
  `Page` shape — fix via `getConversationMessagesPage(id, take, cursorId?)` in `orm/user-message-service.ts`
  (`take+1`, `nextCursor`=oldest page id, `hasMore`=count>take).
- `apps/web-next/src/app/(chat)/chat/[conversationId]/page.tsx` — `force-dynamic` RSC (Phase 4: → client).

---

## 5. NEXT FILE: `store-registry.ts` (write this)

`class ChatStoreRegistry` — module singleton (mirror `WebSocketManager`). Responsibilities:
- `private readonly stores = new Map<string, ChatStore>()` (the outer half of the `Map<convoId, ChatStore>`
  nesting — the inner `byId` lives in each store, by design; the value is a full ChatStore because a conversation
  is more than messages).
- `getOrCreate(conversationId): ChatStore` — **client-only** (guard `typeof window !== "undefined"`; never run
  during SSR render — SSR uses `getXServerSnapshot` which returns frozen empties). LRU touch on access.
- `peek(conversationId)`, `static getInstance()` / `getChatStoreRegistry()`.
- `bindClient(client)` / `unbindClient(client)` — ONE stable listener via `client.addListener`; filter to
  `ai_chat_chunk`/`ai_chat_response`/`ai_chat_error`; route by `evt.conversationId` to `getOrCreate(id).applyX`.
  Called from `useEffect(() => registry.bindClient(client), [client])` in the façade (re-binds on client identity
  change so it never goes deaf after logout/login or `close()`). Listener fn identity STABLE (define once) so
  Set-dedup makes it StrictMode-safe.
- **Rekey + router deception:** when a `"new-chat"` store `isAwaitingRealId()` and an event carries a real
  `conversationId`: `rekey("new-chat", realId)` → move the store to the real key in `stores`, delete the
  `"new-chat"` slot (idempotent), call `store.setConversationId(realId)` + `store.setUrlTransitionInFlight(true)`,
  `window.history.replaceState(null,"","/chat/"+realId)`, and fire an `onRekey(oldId, realId)` callback (the
  façade registers it via `setRekeyHandler` to drive `setActiveId` + the MANDATORY completion `router.replace`).
  At `applyResponse` with `done` for a rekeyed store, the registry signals completion so the façade runs
  `router.replace` then `store.setUrlTransitionInFlight(false)`. (See memory `project_newchat_router_deception`.)
- **Bounded LRU eviction** (cap ~12): on `getOrCreate` over cap, evict least-recently-used — but NEVER evict a
  store with live subscribers, a non-null draft, or phase `streaming`/`awaiting-id`/`interrupted`. Track lastAccess.
- `debugSnapshot(conversationId?)` → the active (or named) store's `debugSnapshot()`, for `window.__chatStoreSnapshot`.

Then **`store.test.ts`**: add `"test": "node --test --import tsx --test-reporter spec"` to
`apps/web-next/package.json` (matches `apps/ws-server` + `packages/img-gen`; `tsx` is catalog-pinned — NO new dep).
Test the reducers React-free: hydrate merges by id + is idempotent; `applyChunk` keeps `getCommittedSnapshot()`
referentially stable; `applyResponse` commits `convo.messages[0]` AND replaces the optimistic user (`[1]`) by id;
ordinal ordering; optimistic ordinal = lastCommitted+1; `markInterrupted` keeps the draft; `applyError` preserves
committed; a surface subscriber doesn't fire for unrelated-surface mutations. **`store.ts` imports no React** (the
selector hook is separate) so tests drive it directly.

---

## 6. OPEN DECISIONS / GOTCHAS

- Selector strategy: split-snapshot surfaces (primary) vs the installed shim (escape hatch) — decided: surfaces.
- Per-conversation stores vs a single store with nested `Map<convoId, Map<msgId,msg>>`: decided per-conversation
  (the user asked; answer: registry `Map<convoId, ChatStore>` IS the nesting; inner value is a full ChatStore
  because a conversation owns draft/status/surfaces, not just messages). Could revisit if asked.
- LRU cap (~12), disconnect recovery (Retry vs auto-resume — server has Redis resume via re-sent
  `ai_chat_request`; `stream:resumed` not in client `EVENT_TYPES`) — Phase-4 decisions, flagged for the human.
- The user just set effort to **max**, model Opus 4.8 (1M). Ultracode is currently OFF (standard Workflow opt-in).
- `message-bubble/index.tsx` had a stray `Provider` export issue — the USER fixed it (don't worry about it).
- A linter split a word in the `messageComparator` doc comment ("Th\ne store") — cosmetic, leave it.

**Resume by:** reading the 3 written files + the build playbook + the memories, then writing `store-registry.ts`
per §5, then `store.test.ts`. Keep everything green (`pnpm --filter=@slipstream/web-next typecheck`). Confirm with
the user before big moves; they are extremely hands-on and catch real issues (they caught the reflexive-draft
shape, the asset boundary, and the no-fabricated-error rule). Commit (locally) after each green milestone.

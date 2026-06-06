# Continuity Handoff — web-next chat refactor (Phases 1–4 shipped; load-older in flight)

> Written 2026-06-07 by Claude Opus 4.8 (1M ctx). Successor to `2026-06-03/anthropic/claude-opus-4-8.md` (Phase-3
> handoff). **Read this top-to-bottom, then the memory `project_loadolder_perf_plan` (the active task), then the
> referenced files.** Phases 1–4 are committed & green; the in-flight load-older work is UNCOMMITTED (details §5).

---

## 0. Mission
Rebuild `apps/web-next` chat around ONE hand-written `useSyncExternalStore` (`ChatStore`). React is a "sweet summer
child" — NOT the load-bearing transcript engine; the **WS server is the source of truth**. 6 phases, locally
commit-checkpointed. Build doc of record: `architectural-decisions/2026-05-31/claude-react-sweet-summer-child-final.md`.

## 1. Hard constraints (NON-NEGOTIABLE)
- `apps/web-next` is a SANDBOX CLONE of prod `apps/web`. **NEVER touch `apps/web`.** Commit LOCALLY on branch
  `sweet-summer-child`, **never push**. Intermediate breakage is fine. (One exception the user OK'd: bumping a shared
  dep version across all three package.jsons — turborepo lockstep — incl. apps/web's, since mismatch breaks turbo.)
- No third-party state libs, no zod. EXTENSIONLESS imports (`@/foo` not `@/foo.ts`). `private` not `#`. `Rm` over `Omit`.
- `undefined` over `null` EXCEPT where Prisma/DB DTOs force null (`title` mirrors nullable `Conversation.title`).
- `satisfies` over `as`, except `as const`, overload impls, and the SANCTIONED `selectedModel.modelId as AllModelsUnion`
  (100+ models — DON'T flag). No `.filter(Boolean)` — explicit predicates.
- **`pnpm --filter=@slipstream/web-next typecheck`** (tsgo, NOT tsc). Tests: `pnpm --filter=@slipstream/web-next test`
  (node:test). **The Bash sandbox shell intermittently HANGS for many minutes — especially on `pnpm test`/install/turbo
  (cold dep resolves). typecheck is reliable & fast. Prefer the Read tool over shell `grep/cat`.**
- The user is EXTREMELY hands-on: confirm before big moves; they edit files mid-stream (re-Read before editing — the
  harness sends "file modified" system reminders); they correct often; keep behavior identical unless it's a deliberate
  optimization. `motion/react` (NOT `framer-motion`).

## 2. Commits (branch `sweet-summer-child`, local only — newest first)
- `0cd1634` Phase 4: fully-client chat route + SWR hydration + AI Coalesce loader
- `24df3bb` Tooling: Node 26 base image + ws-server target, postcss config → TS
- `8ffed43` Phase 3 Pass B: store-fed façade switch (−1038 net lines)
- `7e87634` Tooling: pnpm 11.5.1, @slipstream/vitest-config, web-next test harness
- `d7f2f5c` Phase 3 Pass A: store-fed React surface (hooks + draft adapter)
- (earlier: `42d9bd2` store test suite, `54c0bbd` Phase 2 ordinal pagination, `f431dc2` Phase 1 store core)

## 3. The architecture (DONE — Phases 1–4)
**The store (React-free)** — `apps/web-next/src/state/chat/`:
- `store.ts` — `ChatStore extends ChatMessageWorkup`. 5 SPLIT surfaces, each its own listener Set + cached snapshot
  (`committed`/`draft`/`status`/`conversation`/`error`), each with `subscribeX`/`getXSnapshot`/`getXServerSnapshot`
  (stable arrow props; server snapshots = frozen empties). Reducers: `ingestConversation`, `hydratePage`, `beginSend`
  (optimistic user, ordinal = last+1), `applyChunk` (touches ONLY draft — committed ref STABLE = the perf invariant),
  `applyResponse` (commits `[ai,user]` by id, drops optimistic temp only if real user present, drops draft),
  `applyError`, `markInterrupted`, `patchMessageReaction`, `clearError`, `resetStreamingState`. Registry seams:
  `setConversationId`, `setUrlTransitionInFlight`, `isAwaitingRealId`, `isEvictable`.
- `store-registry.ts` — `export const chatStoreRegistry`. `Map<convoId, ChatStore>`. `getOrCreate` (CLIENT-ONLY — never
  SSR, cross-request leak), `bindClient(client)` uses `addListener` FAN-OUT (NOT `client.on`, owned by sibling
  providers). `route` = `switch(evt.type)` over the 3 transcript events. `rekeyBegin` (migrate same instance, raw
  `history.replaceState`, emit `decoupled`) / `recoupleIfInFlight` (emit `recoupled` on done/error). `setRekeyHandler`.
  LRU evict (never a subscribed/streaming/draft store).
- `store-types.ts` — `ChatDraft = readonly AIChatChunk[]`; private `ChatStreamPhase`; `ChatStatus`; `EMPTY_*` frozen.
- `message-workup.ts` — pure helpers (`messageComparator` = `left.ordinal - right.ordinal`, `splitConversation`,
  `extractResponseMessages` → `{ai: convo.messages[0], user: [1]}`).

**The React seam**:
- `hooks/use-chat-store-selector.ts` — `useChatCommitted/Draft/Status/Conversation/Error(store)` — thin
  `useSyncExternalStore` wrappers (the ONLY React modules touching the store).
- `lib/draft-to-message.ts` — `deriveDraft(draft)` (folds chunks → scalar fields, ONCE per token),
  `streamingMessageFromDerived(derived, ctx)` (the synthetic `streaming-<id>` `MessageSingleton`),
  `draftToStreamingMessage` (wrapper), `appendDraft`.
- `hooks/use-send-chat.ts` — `useSendChat(store, userId)` → `send(payload: SendChatPayload)`. Builds optimistic user +
  `AIChatRequest`, `store.beginSend` + `sendEvent` + `startNewBatch`. Downstream of chat-input's `asset_ready` gate.
- `context/ai-chat-context.tsx` — the **FAÇADE** (~250 lines, store-fed). Module-level `ssrPlaceholderStore` +
  `typeof window`-gated `useState` init for CLIENT-ONLY store resolution; `bindClient(client)` effect; `setRekeyHandler`
  (`decoupled → setActiveConversationId`, `recoupled → router.replace`); passive path-sync (bails on
  streaming/urlTransitionInFlight); `document.title` effect; ONE `deriveDraft`; builds `currentStreamingMessage`
  (repurposed field, was the dead `StreamingMessage` interface). Exposes `AIChatContextValue` + `store`. `sendChat` =
  `useSendChat(store, userId)`. `isNewChat ← status.urlTransitionInFlight`; `title ← status.title` (the LIVE surface —
  this is WHY the sidebar's near-instant new-chat title insert works; the conversation ENVELOPE title only fills on the
  full response, too late).

**The route (Phase 4 — fully client, off SSR)**:
- `app/(chat)/chat/[conversationId]/page.tsx` — `"use client"`, `use(params)` (suspends into `loading.tsx`) +
  `useSession()` for the user. NO `generateMetadata`/`getConversationRouteProps` (deleted). Tab title is client-owned
  (façade `document.title`). `(chat)/layout.tsx` STAYS server (auth gate) — that's correct Next semantics.
- `loading.tsx` → `<AiCoalesceLoader/>` (auto-Suspense fallback; Next wraps page in `<Suspense>`).
- `ui/loading/ai-coalesce-loader.tsx` — branded "AI COALESCE" scramble loader (`motion-plus` `ScrambleText`,
  stagger-from-center, hover/interval re-coalesce, reduced-motion-safe, brand glow + masked dot-grid).
- `ui/chat/dynamic/index.tsx` (`ChatInterface`) — `{ user, conversationId }` props; `useChatCommitted(store)`;
  `useHydrateChatStore` (SWR cold-load bridge); `feed = currentStreamingMessage ? [...committed, csm] : committed`;
  `ChatAreaSkeleton` gated on `committed.length===0` (no flash); keeps queued-prompt machinery (`_handlePromptClick` is
  intentionally dormant — see memory `project_queued_prompt_machinery_dormant`).
- `hooks/use-hydrate-chat-store.ts` — SWR→store bridge: feeds the merged `conversation` to `store.hydratePage`; returns
  `{ isLoading, isValidating, isLoadingMore, loadMore, hasMore, error }`.
- `hooks/use-conversation-messages.ts` — `useSWRInfinite` ordinal-cursor loader. Exposes `conversation` (merged
  `flatMap(...).reverse()`), `hasMore`, `isLoadingMore`, `loadMore`. **NOTE: each page is `ordinal desc`; the
  `flatMap().reverse()` is CORRECT — do NOT copy v0's per-page merge.**
- `orm/user-message-service.ts` — `getConversationMessagesPage(conversationId, take=25, cursorOrdinal?)` — `ordinal
  desc`, `take`, `hasMore = oldestOrdinal > 0`, `nextCursor = oldestOrdinal`. Probe-free (gapless ordinals).

**Protocol facts (also in memory/):** router deception (decoupled/recoupled) is HARD-WON, don't simplify. First
`ai_chat_chunk` always carries real conversationId+title. `ai_chat_response.convo = [ai, user]`. Ordinals gapless +
`@@unique([conversationId, ordinal])`. Asset pipeline is separate/seamless. imgGen always CDN-normalized.

## 4. Phase 5 verdict — IT WORKS
User ran ws-server + web-next and exercised a real multi-model session (kimi/opus/gemini, thinking, TTS, imgGen,
pasted attachments, long streams): "remarkably smoother, all functionality perfectly preserved or even enhanced
without all that tug'o'war." The store-driven UI held. Phases 1–4 are proven.

## 5. ⚠️ IN-FLIGHT / UNCOMMITTED — the load-older feature
**Files changed but NOT committed** (working tree, on top of `0cd1634`):
- `hooks/use-load-older-history.ts` (NEW) — **velocity-adaptive** upward pagination + scroll anchoring + a **client
  idle-loop backfill**. `useScroll({container})→useVelocity` → trigger margin scales with upward fling speed (fast →
  fires earlier / more runway). Anchor = capture `scrollHeight`+count before `loadMore`, restore `scrollTop += delta`
  in `useLayoutEffect` ONLY once `messages.length > capturedCount` (codex's guard — web-next renders from the store
  AFTER the bridge ingests SWR, so restoring on the loading flag alone fires with delta=0). `backfill` arg (default
  true) advances `loadMore` on `requestIdleCallback` until `hasMore` false, sharing the anchored `triggerLoad` +
  `pendingRef`. `overflow-anchor: none` required (manual anchor). **The backfill was added LAST and is NOT YET
  TYPECHECKED — verify `pnpm --filter=@slipstream/web-next typecheck` first thing (watch the `window.requestIdleCallback`
  /`IdleRequestOptions` typing).**
- `ui/chat/chat-feed/index.tsx` — hook call + `didInitialScroll` state (gates the trigger off first paint, resets on
  convo change) + `[overflow-anchor:none]` + bottom-auto-scroll re-keyed `messages.length`→`lastMessageId` (so a
  prepend never yanks to bottom) + "Loading older…" / "Beginning of conversation" markers (DISCRETIONARY — user OK'd,
  one word to remove).
- `ui/chat/dynamic/index.tsx` — forwards `loadOlderMessages`/`hasOlderMessages`/`isLoadingOlderMessages`.
- `hooks/use-hydrate-chat-store.ts` + `hooks/use-conversation-messages.ts` — expose `hasMore`/`isLoadingMore`.
- `state/chat/store-types.ts` — `ConversationMessagesPage.nextCursor: string→number` (ordinal cursors).

User VERIFIED the load-older works (before the backfill was added). It works but they flagged a perf drag (see §6).

## 6. ⭐ THE DECIDED NEXT MOVE — WS-server push backfill
**Full spec in memory `project_loadolder_perf_plan`. This is the chosen direction (user's idea, supersedes the client
idle-loop + the server-HTTP-generator options).**

Reuse the already-open, IDLE WS connection to preload the whole convo:
- **New events in `@slipstream/types` events.ts** (the contract-of-contracts): `hydrate_conversation { conversationId }`
  (client→server, fired on idle after first paint) + `hydrate_conversation_ack { conversationId, convo }`
  (server→client; one payload normally, chunk/stream giant convos).
- **ws-server handler** (`apps/ws-server`): on `hydrate_conversation`, fetch the full convo via the CLEAN ordinal
  generator (page `ordinal < cursor`, yield, stop on a short page — **NO `seenTokens`/break-on-repeat; that defense is
  only for xAI's broken `pagination_token`, the DB cursors are reliable**), send `hydrate_conversation_ack`.
- **Client (web-next)**: on idle, send `hydrate_conversation`. On the ack → the registry ingests it into the `store`
  via its EXISTING WS fan-out (just add the case to `route`) AND `mutate(swrKey, …, { revalidate: false })` plops it
  into SWR-infinite's cache. **One push feeds BOTH caches → dissolves the SWR-vs-store fork.** Load-older stays as the
  on-demand face, now always hitting warm cache.
- **Cost:** shared-contract change (events in `@slipstream/types` + ws-server handler). But ADDITIVE — `apps/web`'s WS
  switch default-ignores unknown events, so nothing breaks there (and we don't touch apps/web source).

**Also still pending (lower priority):** page size `take` 25 → 12 (faster first paint); incremental bridge ingest
(ingest-by-index from `data`, not the full merged `conversation` each page — matters under the client idle-loop to
avoid O(n²) re-ingest, less so under WS-push since one ack hydrates once).

## 7. Memories to read (in `~/.claude/.../memory/`, indexed in MEMORY.md)
**`project_loadolder_perf_plan`** (the ACTIVE task — full backfill plan + the WS-push decision). Plus:
`project_newchat_router_deception`, `project_web_next_sandbox_clone`, `project_first_chunk_carries_id_title`,
`project_response_convo_user_and_ai`, `project_facade_preserve_context_contract`, `project_queued_prompt_machinery_dormant`,
`feedback_undefined_over_null_except_prisma`, `feedback_modelid_as_allmodelsunion_exception`, `feedback_minimal_processing`,
`feedback_minimal_blast_radius`, `feedback_pnpm_typecheck`, `feedback_modular_files`, `feedback_void_prefix_promises`.

## 8. Verification
- `pnpm --filter=@slipstream/web-next typecheck` — MUST be green (currently UNVERIFIED for the backfill addition — run
  first). No `any`, no bare `as` outside the sanctioned exceptions, no `.filter(Boolean)`.
- `pnpm --filter=@slipstream/web-next test` — store suite (was 16/16). NOTE: the shell may HANG on this; if so it's the
  cold turbo/dep resolve, not the tests.
- Runtime (Phase 5): user runs `pnpm run:web-next` + `pnpm run:ws-server` and tests manually. Phase 6 = Playwright
  (`apps/web-next/playwright.config.ts` exists; `src/__e2e__/**/*.e2e.ts`).

## 9. Immediate next step
1. `typecheck` the working tree (verify the backfill hook compiles; fix the `requestIdleCallback` typing if needed).
2. Decide with the user whether to commit the velocity load-older as a checkpoint first (it works), OR fold the WS-push
   work in. Then build the **WS-push backfill** (§6): types events → ws-server handler → registry `route` case + client
   send/handle + the SWR `mutate` plop.
3. Then 12/page + (optional) incremental ingest. Then Phase 6 (Playwright).

The user is back fresh after ~20h and ready to go. The cornerstone held through Phase 5; the path forward is decided
and clean. Welcome back, me. :3

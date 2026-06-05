# Continuity Handoff — web-next chat `useSyncExternalStore` refactor (Phase 3 IN PROGRESS)

> Written 2026-06-03 by Claude Opus 4.8 (1M ctx) at ~97%. Successor to `2026-06-01/anthropic/claude-opus-4-8.md`
> (Phase-1 handoff — still valid for deep store internals). **Read this top-to-bottom, then the referenced files.**
> Everything compiles green: `pnpm --filter=@slipstream/web-next typecheck` (tsgo). Store suite passes 16/16:
> `pnpm --filter=@slipstream/web-next test`.

## 0. Mission
Rebuild `apps/web-next` chat around ONE hand-written `useSyncExternalStore`. React is a "sweet summer child" — NOT
the load-bearing transcript engine; the WS server is the source of truth. 6 phases, locally commit-checkpointed.
Build doc of record: `architectural-decisions/2026-05-31/claude-react-sweet-summer-child-final.md` (+ `-v3.md`).
Phase-3 side-by-side: `architectural-decisions/2026-05-31/phase-three/claude-brainstorm-follow-up.md` (READ IT).

## 1. Hard constraints (NON-NEGOTIABLE)
- `apps/web-next` is a SANDBOX CLONE of prod `apps/web`. **NEVER touch `apps/web`.** Commit LOCALLY, **never push**.
  Intermediate breakage is fine. No CI/CD on web-next.
- No third-party state libs, no zod.
- web-next uses **EXTENSIONLESS imports** (`@/foo`, not `@/foo.ts`). `private` not `#`. `Rm` over `Omit`.
- `undefined` over `null` EXCEPT where Prisma/DB DTOs force null (e.g. `title` mirrors nullable `Conversation.title`).
  `@slipstream/types` event/imgGen types deal in `undefined`. Coerce `?? null` only at a null-typed helper boundary.
- `satisfies` over `as`, except `as const`, overload impls, and the SANCTIONED `selectedModel.modelId as AllModelsUnion`
  cast (100+ models; getModel takes a string reliably — DON'T flag it). No `.filter(Boolean)` — explicit predicates.
- `pnpm --filter=@slipstream/web-next typecheck` (tsgo, NOT tsc). Tests: `node --test --import tsx` (the `test` script).
- The user is EXTREMELY hands-on: confirm before big moves; they edit files mid-stream (re-Read before editing);
  they correct frequently. Keep behavior identical to old code unless it's a deliberate optimization.

## 2. Commits (branch `sweet-summer-child`, local only — `git log --oneline`)
- `f431dc2` Phase 1: store core (`state/chat/`) + message ordinals + eslint/prettier (tsdown) overhaul.
- `54c0bbd` Phase 2: ordinal cursor pagination (ORM `getConversationMessagesPage` + 2 routes + SWR hook) + store null→undefined.
- `42d9bd2` store/registry `node:test` suite + gitignored fixtures.
- **UNCOMMITTED (Phase-3 Pass A — 3 additive files, green):** `hooks/use-chat-store-selector.ts`, `lib/draft-to-message.ts`,
  `hooks/use-send-chat.ts`. (The user also has `chat-input/index.tsx` WIP, and `pnpm-lock`/`pnpm-workspace`/`tooling-eslint`
  may be their separate WIP — they committed those themselves once already; don't sweep them into Phase-3 commits.)

## 3. The store (DONE, committed `f431dc2`/`54c0bbd`/`42d9bd2`) — `apps/web-next/src/state/chat/`
- `store-types.ts`: `ChatDraft = readonly AIChatChunk[]`; private `ChatStreamPhase`; `ChatStatus {conversationId, title,
  isStreaming, isInterrupted, isNewChat, urlTransitionInFlight}`; surface aliases; `ConversationMessagesPage`; frozen
  `EMPTY_MESSAGES`/`EMPTY_STATUS`. Sentinels `undefined` (draft/conversation/error); `title` stays `string | null`.
- `message-workup.ts`: `ChatMessageWorkup` — `messageComparator` (`left.ordinal - right.ordinal`), `splitConversation`,
  `extractResponseMessages` (`{ai: convo.messages.at(0), user: at(1)}` — server returns `[ai, user]`).
- `store.ts`: `ChatStore extends ChatMessageWorkup`. 5 split surfaces (`committed`/`draft`/`status`/`conversation`/`error`),
  each `subscribeX`/`getXSnapshot`/`getXServerSnapshot` (stable arrow props) + listener Set + cached snapshot. Reducers:
  `ingestConversation`, `hydratePage`, `beginSend(request, optimisticUser)` (optimistic ordinal = last+1), `applyChunk`
  (only touches draft — committed ref STABLE = perf invariant), `applyResponse` (commits `[ai,user]` by id, drops the
  optimistic temp only if real user present, drops draft, never fabricates errors), `applyError`, `markInterrupted`,
  `patchMessageReaction`, `clearError`, `resetStreamingState`. Registry seams: `setConversationId`,
  `setUrlTransitionInFlight`, `isAwaitingRealId`, `isEvictable`. `debugSnapshot()` (dev).
- `store-registry.ts`: `export const chatStoreRegistry`. `Map<convoId, ChatStore>`. `getOrCreate` (CLIENT-ONLY),
  `bindClient(client: WsListenerHost)` where `WsListenerHost = Pick<ChatWebSocketClient, "addListener"|"removeListener">`
  — uses `addListener` fan-out (NOT `client.on`, which is single-handler-per-event owned by asset/tts/api-key providers).
  `route` = `switch(evt.type)` over the 3 transcript events + `default` ignores. `resolveStore` (existing id wins;
  parked `"new-chat"` + a real id → `rekeyBegin`). `rekeyBegin` = migrate the SAME instance to the real key, raw
  `history.replaceState` (the deception), `setUrlTransitionInFlight(true)`, emit `"decoupled"`. `recoupleIfInFlight` =
  emit `"recoupled"` on response(done)/error if mid-transition. `setRekeyHandler`. LRU `evictIfNeeded` (cap ~12, never
  evicts a subscribed/streaming/draft store). `debugSnapshot(id)` / `debugSnapshotAll()`. `ChatRekeyEvent {phase:
  "decoupled"|"recoupled", conversationId, previousId?}` + `ChatRekeyHandler`.

## 4. Pass A — Phase-3 foundation (DONE, uncommitted, green, ADDITIVE so app unchanged)
- `hooks/use-chat-store-selector.ts`: `useChatCommitted/Draft/Status/Conversation/Error(store)` — thin
  `useSyncExternalStore` wrappers over the store's stable surface methods. The ONLY React module touching the store.
- `lib/draft-to-message.ts` (the adapter, pure/React-free):
  - `deriveDraft(draft): DraftDerivation` — folds `AIChatChunk[]` → `{text, thinkingText, isThinking, thinkingDuration,
    blocks, imgGenEnabled, imgGenFields, userMsgId, aiMsgId, imgGenAttachmentId}`. Ported VERBATIM from
    `ai-chat-context.tsx` `handleChunk` (:388-509) + the helpers (:94-135): block providers recompute text/thinking from
    the ordinal-merged blocks; legacy providers append `chunk`/`thinkingText`; `mergeImgGen` folds imgGenFields latest-wins
    (preserve partials). thinking blocks join `"\n\n"` (faithful), legacy `thinkingText +=` raw.
  - `draftToStreamingMessage(draft, ctx: DraftRenderContext {conversationId, provider, model, userId}): MessageSingleton<true>`
    — the synthetic `streaming-<id>` bubble via `createAIMessage`; provider from `ctx` (SELECTED model) via `toPrismaFormat`,
    NOT the chunk; imgGen attachments via `normalizeImgGenFields` (partials+finals). `appendDraft(committed, draft, ctx)`.
  - imgGen rule (memory): images are ALWAYS CDN-normalized (real URLs), never base64 — zero decode/validation; arrival =
    imgGenEnabled + array length grows.
- `hooks/use-send-chat.ts`: `useSendChat(store, userId?)` → `send(payload: SendChatPayload {content, attachments?:
  AttachmentPreview[], batchId?, imgGenEnabled?, imgGenFields?})`. Builds optimistic user (`createUserMessage` +
  `buildOptimisticAttachment` via `getByPreviewId`), assembles `AIChatRequest` (metadata memo from cookies, `getModel(...,
  modelId as AllModelsUnion)`, provider keys `providerContext ?? fallbackApiKeys`, batchId logic), then `store.beginSend`
  + `sendEvent("ai_chat_request", request)` + `startNewBatch()`. Guards: skip if `store.getStatusSnapshot().isStreaming`;
  500ms dup-send. **DOWNSTREAM of `chat-input`'s `asset_ready` gate** (attachments already real; don't re-gate). The
  optimistic-user build MOVED here from `dynamic.handleUserMessage`, so `dynamic` must change with it.

## 5. Pass B — THE SWITCH (NOT STARTED). Keystone = the façade.

### 5a. `context/ai-chat-context.tsx` → store-fed façade (~120 lines). Reproduce `AIChatContextValue` EXACTLY (interface at
`:49-90`). It has a CUSTOM `StreamingMessage` type (`:32-47`, NOT `MessageSingleton`). Mapping (façade fields ← source):
- `activeConversationId` ← **façade `useState`** (from path via `pathParser`/`getConversationIdFromPath`, updated by the
  rekey `decoupled` handler) — NOT `status.conversationId` directly (the path LAGS during the deception). Keep
  `setActiveConversationId` on the value.
- `title` ← `useChatStatus(store).title` · `isStreaming` ← `status.isStreaming` · `error` ← `useChatError(store)`.
- `isNewChat` ← **`status.urlTransitionInFlight`** (RESOLVED note #2 — the context's transient isNewChat == the
  decoupled→recoupled window; its only consumer is `chat-feed`'s initial-scroll bail at `:108-124`). Do NOT use
  `status.isNewChat` (that's the persistent "began as new" flag).
- `isWaitingForRealId` ← `store.isAwaitingRealId()`.
- `isComplete` ← derive (e.g. `!status.isStreaming`); its only consumer is `dynamic`'s finalization effect (being deleted)
  — likely dead after 5b; verify.
- `streamedText / thinkingText / isThinking / thinkingDuration / streamingMessageBlocks(=blocks) / imgGenEnabled /
  imgGenFields / currentUserMsgId(=userMsgId) / currentAiMsgId(=aiMsgId) / currentImgGenAttachmentId(=imgGenAttachmentId)`
  ← `deriveDraft(useChatDraft(store))`.
- `currentStreamingMessage` ← **`null`** — grep-verified UNUSED by any UI (chat-feed/dynamic don't read it). Expose null
  (or build a StreamingMessage from the draft only if a consumer reappears).
- `sendChat` ← `useSendChat(store, userId)` → it's `send(payload)` now (signature CHANGES from the old positional one;
  `dynamic` is the only caller and is rewritten in 5b).
- `clearError` ← `store.clearError` · `resetStreamingState` ← `store.resetStreamingState` · `isConnected` ←
  `useChatWebSocketContext().isConnected`.
- **Effects:** `useEffect(() => chatStoreRegistry.bindClient(client), [client])`; register the rekey handler via
  `setRekeyHandler`: `decoupled → setActiveConversationId(realId)`, `recoupled → router.replace(\`/chat/${id}\`,
  {scroll:false})` (the MANDATORY completion reconcile — non-negotiable). Keep the `document.title` effect. Keep the
  passive path-sync effect that BAILS on `isStreaming || urlTransitionInFlight`.
- Store resolution: `store = registry.getOrCreate(activeConversationId ?? "new-chat")`. **SSR GOTCHA (the hard part):**
  the façade renders on the server (it's in `(chat)/layout.tsx`, route is `force-dynamic`). `getOrCreate` during SSR =
  cross-request leak. Must resolve client-only (v3 §6). Options: gate `typeof window`, resolve in an effect/ref, or accept
  empties server-side (the surface `getServerSnapshot`s already return frozen empties). The store hooks need a non-null
  store at render — solve this carefully (it's the trickiest bit). Phase 4 makes the route client, which dissolves it.

### 5b. `ui/chat/dynamic/index.tsx` — SHRINK. Delete local `messages` `useState` + ALL 5 reconciliation effects (initial-prompt,
attachment-patch [GONE — assets real pre-send], streaming-splice, finalization+202ms timer, nav-reset) + the
`handleUserMessage` optimistic body. Read `committed = useChatCommitted(store)` + `draft = useChatDraft(store)`; build
`feed = appendDraft(committed, draft, {conversationId, provider: selectedModel.provider, model: selectedModel.modelId,
userId: user.id})`; pass `feed` to `ChatFeed`. `handleUserMessage` → `send(payload)`. KEEP: queued prompt / initial-prompt /
sessionStorage handoff. The store/façade expose the active `store` so dynamic can call the hooks (expose `store` on the
context value).

### 5c. `ui/chat/message-bubble/index.tsx` — wrap in `React.memo` (one line; no prop/behavior change). Delivers the perf
invariant (committed bubbles skip per-token re-render). OPTIONAL: simplify the heavy `imageGenerationData` URL-cache memo
(`:153-296`) to `imgGenEnabled + attachments.length` (the user's simpler model) — can defer. OPTIONAL: completion-flash key.

### 5d. Cleanup: delete dead `context/conversation-id-context.tsx` (grep-verified unmounted). Delete `finalizeStreamingMessage`
from `lib/ui-message-helpers.ts` (only caller = the deleted finalization effect). **KEEP `createAIMessage`** (the adapter
uses it now — corrects the old plan) + `createUserMessage` (use-send-chat) + `toMessageBlocks`. `ui/chat/chat-feed/index.tsx`:
drop the imgGen debug `console.log` (:62); source live props from status/draft. `ui/chat/sidebar/index.tsx` UNCHANGED
(contract preserved — it reads only `activeConversationId` + `title`).

## 6. Consumer map (grep-verified, who reads what)
- Only `dynamic` + `sidebar` consume `useAIChatContext()`. Sidebar reads ONLY `{activeConversationId, title}` → UNTOUCHED.
- `chat-feed` (props, not context): threads `live*` to `MessageBubble` for the `streaming-<id>` message — keyed by
  `currentAiMsgId` + the `streaming-` id prefix. Keep that wiring.
- `finalizeStreamingMessage` / `currentStreamingMessage` → only the to-be-deleted dynamic effect; `currentStreamingMessage`
  has ZERO consumers.

## 7. Hard-won protocol facts (also in memory/)
Router deception = `decoupled` (shallow replaceState mid-stream, registry) / `recoupled` (mandatory router.replace at
completion, façade) — NON-NEGOTIABLE. First `ai_chat_chunk` always carries real conversationId+title (deterministic rekey).
`ai_chat_response.convo` = `[ai, user]` (both persisted) — obsoletes the old optimistic-attachment refetch. Ordinal
required + `@@unique([conversationId, ordinal])` (gapless 0..n-1). Asset pipeline is separate/seamless (don't touch); send
gated on `asset_ready` so attachments are real pre-send. imgGen rides `ai_chat_*` (imgGenEnabled/imgGenFields/imgGenAttachmentId).

## 8. Memories written this session (in `~/.claude/.../memory/`)
`project_facade_preserve_context_contract`, `feedback_undefined_over_null_except_prisma`,
`project_imggen_cdn_normalized_simple_detection`, `feedback_modelid_as_allmodelsunion_exception`. (Plus the Phase-1/2 set:
`project_newchat_router_deception`, `project_web_next_sandbox_clone`, `project_first_chunk_carries_id_title`,
`project_message_block_streaming`, `project_response_convo_user_and_ai`, `project_asset_pipeline_separate`,
`project_img_gen_live_flow`, `feedback_rm_over_omit`, etc.) MEMORY.md index had pointer-edit trouble (the `façade` line
encoding) — verify the index has all four new pointers; re-add any missing.

## 9. Immediate next step
Build Pass B starting with the façade (5a) — it's coupled to `dynamic` (5b) via the moved optimistic-user build, so do
5a+5b together (or accept intermediate typecheck breakage — sandbox). Solve the SSR store-resolution gotcha (5a) first.
Then `React.memo` (5c) + cleanup (5d). Typecheck after; the user runs `ws-server`+`web-next` for Phase 5 manual matrix.
Was mid-read of `ai-chat-context.tsx` (had its interface `:49-90` + the consumer grep) when this was written.

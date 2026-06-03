# Phase 3 — `ai-chat-context.tsx` → store/registry side-by-side

> Follow-up to `brainstorm.md` (codex's recon). Verified against the **current** code in
> `apps/web-next/src/state/chat/` and `apps/web-next/src/context/ai-chat-context.tsx` — not the plan docs.
> Adds a "why it's superior" column and corrects two stale rows from the brainstorm.
>
> **The thesis:** the store already owns the WebSocket/event-state + committed-timeline responsibilities. It is
> NOT a drop-in for the legacy context value, because it stores raw `AIChatChunk[]` draft frames and expects a
> Phase-3 adapter (`lib/draft-to-message.ts`) to derive the legacy fields (`streamedText`, `thinkingText`,
> `currentStreamingMessage`, …). Everything that builds/sends the request, plus the React halves of the router
> deception, stays in the façade.

---

## 1. WebSocket ingestion — the ~300-line handler block (`ai-chat-context.tsx:345–663`)

| `ai-chat-context.tsx` | Store / Registry | Why it's superior |
|---|---|---|
| `client.on("ai_chat_chunk"/"error"/"response")` effect (`:646–654`) | `ChatStoreRegistry.bindClient()` → `route()` (switch + default) | `addListener` fan-out — no single-handler collision with the asset/tts/api-key providers; React-free, survives remounts; routes by `conversationId` to per-convo stores |
| `handleChunk` (`:388–509`) — rebuilds `streamedText`/thinking/blocks/imgGen via ~10 `setState`s **per chunk** | `ChatStore.applyChunk(evt)` (`store.ts:219`) | Stores the **raw `AIChatChunk[]`** and notifies *only* the `draft` surface → `committed` stays referentially identical across tokens (the perf invariant). Legacy fields derived at the render edge, not re-pushed into React state per token |
| first-chunk URL deception inside `handleChunk` (`:404–424`): `replaceState` + `urlUpdatedRef` + `setIsNewChat` + `setActiveConversationId` | `resolveStore()` → `rekeyBegin()` (emits `"decoupled"`) | Same raw `replaceState`, but the Map key migrates the **same store instance** (subscribers never drop a chunk). The React half (`setActiveConversationId`) becomes the façade's `decoupled` handler |
| `handleResponse` (`:562–643`) — re-syncs blocks, `setIsComplete` after a **200ms timer**, `setIsStreaming(false)` | `ChatStore.applyResponse(evt)` (`store.ts:238`) | Commits the authoritative `evt.convo` `[ai, user]` **by id** — no rebuild-from-chunks, **`finalizeStreamingMessage` deleted**, optimistic user reconciled in the same pass. 200ms timer disappears (→ completion-flash keying fix) |
| final recouple in `handleResponse` (`:628–639`): `router.replace` + `setIsNewChat(false)` + `urlUpdatedRef=false` | `recoupleIfInFlight()` (emits `"recoupled"`); façade runs `router.replace` | Registry owns timing + flag; façade owns the React `router.replace`. The `decoupled`/`recoupled` names describe the actual `window.history` ↔ React Router invariant |
| `handleError` (`:511–560`) | `ChatStore.applyError(evt)` (`store.ts:259`) + `recoupleIfInFlight()` | Clears draft, sets the `error` surface, preserves committed; **never fabricates an error** (fires only from a real `ai_chat_error`) |

## 2. Send path (`sendChat`, `:697–842`)

| `ai-chat-context.tsx` | Replacement | Why |
|---|---|---|
| state-reset block (`:766–779`) — ~12 `setState`s clearing streaming | `ChatStore.beginSend(request, optimisticUser)` (`store.ts:184`) | One reducer: optimistic-user insert (placeholder ordinal = last+1), streaming flags, `awaiting-id` phase for new chats, draft+error clear |
| `AIChatRequest` assembly (`:799–820`) + `metadata` memo (`:672–695`) + batchId (`:786–796`) | **Façade** → `hooks/use-send-chat.ts` | Not the store's concern — model/provider/keys/metadata/asset/`sendEvent` |
| `startNewBatch()` rotation (`:825`) | `use-send-chat` | Asset pipeline untouched |
| dedupe guards `recentMessagesRef` + `activeUserStreamsRef` (`:711–731`) | `use-send-chat` (per-conversation guard) | |

## 3. Control flags → the `status` surface (collapses ~20 `useState`)

| `ai-chat-context.tsx` `useState` | Store surface | Why |
|---|---|---|
| `activeConversationId`, `title`, `isStreaming`, `isNewChat`, `isWaitingForRealId`, URL-transition | **`StatusSnapshot`** via `getStatusSnapshot()` (`buildStatus`, `store.ts:123`) | One referentially-stable surface; re-renders only on flag/title/id flips, **never per token**. `isWaitingForRealId` → internal `phase === "awaiting-id"` (`isAwaitingRealId()`) |
| `error` (`:196`) | **`error` surface** (`getErrorSnapshot`) | Isolated listener set |
| `clearError` (`:844`) / `resetStreamingState` (`:846–863`) | `ChatStore.clearError()` (`:291`) / `resetStreamingState()` (`:302`) | No-op if already clear → no snapshot churn; `undefined` not `null` |

## 4. The streaming/derived fields → **the adapter gap** (the crux of Phase 3)

The context exposes **11 derived fields**; the store deliberately keeps only `DraftSnapshot = readonly AIChatChunk[]`. `lib/draft-to-message.ts` folds the draft into these at the render boundary:

| `ai-chat-context.tsx` field | Derived from `draft` by the adapter |
|---|---|
| `streamedText` | concat TEXT-block content / chunk deltas |
| `thinkingText`, `isThinking`, `thinkingDuration` | fold THINKING / ENCRYPTED_THINKING blocks |
| `streamingMessageBlocks` | ordinal-keyed merge of each chunk's single block |
| `currentStreamingMessage` | `draftToStreamingMessage(draft)` → synthetic `streaming-<id>` `MessageSingleton<true>` |
| `imgGenEnabled`, `imgGenFields` | latest-wins fold (partials preserved) |
| `currentUserMsgId`, `currentAiMsgId`, `currentImgGenAttachmentId` | latest from the chunk frames |
| `isComplete` | derived: `!status.isStreaming` |

**Superior because:** the store holds no redundant derived state (no 11 mirrored fields, no per-token re-derivation into React); the derivation is a pure function of the raw frames, memoizable, and thrown away wholesale on commit.

## 5. Refs & bookkeeping → eliminated / consolidated

| `ai-chat-context.tsx` | Store/Registry | Why |
|---|---|---|
| ~14 `useRef` mirrors (`streamedTextRef`, `isStreamingRef`, `titleRef`, …) + sync effects (`:274–328`) | **Gone** — reducers read plain class fields directly | No ref-mirroring, no sync effects, no stale-closure hazards |
| `firstChunkReceivedRef`, `urlUpdatedRef`, `originalConversationIdRef` (`:220–223`) | Registry internals: the `"new-chat"` Map key + `urlTransitionInFlight` + `isAwaitingRealId()` | Scattered rekey bookkeeping → one owner |
| passive path-sync effect (`:229–256`) | Façade effect bailing on `isStreaming \|\| urlTransitionInFlight` | The "don't resync mid-stream" rule, centralized |

## 6. Committed timeline — **new ownership the context never had**

The context **doesn't own messages** — `dynamic/index.tsx` does (local `messages` state + 5 reconciliation effects). The store **absorbs that too**: `ingestConversation` / `hydratePage` (`store.ts:159/176`) + the `committed` surface + `messageComparator` (ordinal sort). The split brain (context flags + dynamic's `messages`) becomes one read model — the biggest structural win.

---

## Still façade-owned (correctly *not* in the store)
- `isConnected` — transport state, from `chat-ws-context`.
- `document.title` effect — from `status.title`.
- React halves of `decoupled`/`recoupled` — `setActiveConversationId` / `router.replace` via `setRekeyHandler`.
- The whole send-request assembly + asset rotation + dedupe — `use-send-chat`.
- The `draft-to-message` adapter — derives the legacy streaming fields.

## Two reconciliation notes (corrected from `brainstorm.md`)
1. **`prependHistory` is NOT a gap.** Gapless ordinals make a separate prepend reducer unnecessary — older pages merge by id and re-sort by `ordinal` through `ingestConversation`. The dangling mention is a stale comment in `store-types.ts` to delete.
2. **`isNewChat` semantics differ — RESOLVED.** Context: `isNewChat` is *transient* (true on first chunk `:418`, cleared on completion/error `:555/:637`). Store: set in `beginSend`, **never cleared** (= "began as a new chat"; used only by `isAwaitingRealId`, which `phase` already gates). Its single real consumer is a scroll effect in `chat-feed` (`:108–124`): `if (isNewChat) return;` skips the initial scroll-to-bottom while a new chat streams. That timing — true at the first real-id chunk, false at completion — is **exactly** `urlTransitionInFlight` (set true at `decoupled`/`rekeyBegin`, false at `recoupled`/`recoupleIfInFlight`). **Resolution:** map the façade's `isNewChat` ← `status.urlTransitionInFlight`; leave `store.isNewChat` as the internal "began-as-new" flag (no clear-on-recouple, no store change).

---

## Phase-3 file manifest (derived from the mapping)
**Create:** `hooks/use-chat-store-selector.ts` (per-surface hooks) · `hooks/use-send-chat.ts` · `lib/draft-to-message.ts` (the §4 adapter).
**Modify:** `context/ai-chat-context.tsx` → ~120-line façade · `ui/chat/dynamic/index.tsx` (drop local `messages` + the 5 effects → store surfaces + `appendDraft`) · `ui/chat/message-bubble/index.tsx` (`React.memo` + completion-flash key) · `ui/chat/chat-feed/index.tsx` (drop imgGen `console.log`; source live props from `status`/`draft`) · `ui/chat/sidebar/index.tsx` (**keep** `useAIChatContext()` for `activeConversationId`+`title` — contract preserved) · `hooks/use-reaction.ts` (`store.patchMessageReaction` from the `rxnAction` result) · `lib/ui-message-helpers.ts` (delete `createAIMessage` + `finalizeStreamingMessage`; keep `createUserMessage` + `toMessageBlocks`).
**Delete:** `context/conversation-id-context.tsx` (grep-verified dead).

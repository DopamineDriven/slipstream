### User (Andrew)
hey codex, can you please do some recon for me, check out apps/web-next/src/state (the whole directory, each file therein) and then cross-compare what exists in
there with what exists in the apps/web-next/src/context/ai-chat-context.tsx please, I'd like a ~1:1 mapping of which methods from the store are in place to
assume the responsibility of which methods from the context file so I can analyze them more carefully before we start phase 3



### GPT-5.5 xhigh fast

• I’ll inventory apps/web-next/src/state first, then read the chat context in slices and line up store APIs against the current context responsibilities.

• Explored
  └ List state
    List state

• Ran wc -l apps/web-next/src/context/ai-chat-context.tsx
  └ 903 apps/web-next/src/context/ai-chat-context.tsx

• Explored
  └ List state

• Explored
  └ List state

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• There are four state files: store-types.ts, store.ts, store-registry.ts, and message-workup.ts. I’m reading those alongside the current context now so the
  mapping is based on actual code, not just the plan docs.

• Explored
  └ Read store-types.ts, store.ts, store-registry.ts, message-workup.ts, ai-chat-context.tsx

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• The store has the reducer/state-machine pieces in place, but it deliberately does not expose the legacy context shape directly. I’m checking for any existing
  adapter/helper that derives streamedText, thinking fields, and currentStreamingMessage from ChatDraft, because that’s the main bridge Phase 3 will need.

• Explored
  └ Search draft-to-message|ChatDraft|currentStreamingMessage|streamedText|thinkingTextFrom|toMessageBlocks|useSyncExternalStore|chatStoreRegistry|beginSend|
           applyChunk|applyResponse|applyError|hydratePage in web-next
    List hooks
    Search export interface MessageSingleton|type Message =|interface Message extends|ordinal in types.ts
    Read types.ts

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Recon Summary
  The store layer is mostly ready to take over the websocket/event-state responsibilities from apps/web-next/src/context/ai-chat-context.tsx:345. It is not a drop-
  in replacement for the current context value yet, because it stores raw draft frames and expects Phase 3 selectors/adapters to derive legacy fields like
  streamedText, thinkingText, and currentStreamingMessage.

   Current context responsibility                            Store/registry replacement                          Notes
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   client.on("ai_chat_chunk/error/response") subscription    ChatStoreRegistry.bindClient() + route() in         Replaces the context websocket effect. Uses
                                                             apps/web-next/src/state/chat/store-                 addListener, so it does not fight other client.on
                                                             registry.ts:105                                     users.
  ────────────────────────────────────────────────────────  ──────────────────────────────────────────────────  ───────────────────────────────────────────────────
   handleChunk                                               ChatStore.applyChunk() in apps/web-next/src/        Stores raw AIChatChunk[] draft frames. Does not
                                                             state/chat/store.ts:219                             directly compute streamedText/thinking fields.
  ────────────────────────────────────────────────────────  ──────────────────────────────────────────────────  ───────────────────────────────────────────────────
   New-chat first chunk URL deception                        resolveStore() + rekeyBegin() in apps/web-next/     Replaces window.history.replaceState,
                                                             src/state/chat/store-registry.ts:164                urlUpdatedRef, and first real-id handling from
                                                                                                                 context.
  ────────────────────────────────────────────────────────  ──────────────────────────────────────────────────  ───────────────────────────────────────────────────
   handleResponse                                            ChatStore.applyResponse() in apps/web-next/src/     Drops draft, ingests authoritative evt.convo,
                                                             state/chat/store.ts:238                             swaps optimistic user if server user is present.
  ────────────────────────────────────────────────────────  ──────────────────────────────────────────────────  ───────────────────────────────────────────────────
   Final router recouple                                     recoupleIfInFlight() in apps/web-next/src/state/    Facade still must run router.replace; registry
                                                             chat/store-registry.ts:212                          emits the seam via setRekeyHandler().
  ────────────────────────────────────────────────────────  ──────────────────────────────────────────────────  ───────────────────────────────────────────────────
   handleError                                               ChatStore.applyError() in apps/web-next/src/        Clears draft, sets error snapshot, stops
                                                             state/chat/store.ts:259                             streaming.
  ────────────────────────────────────────────────────────  ──────────────────────────────────────────────────  ───────────────────────────────────────────────────
   Send-time stream reset                                    ChatStore.beginSend() in apps/web-next/src/         Covers optimistic user insert, streaming flags,
                                                             state/chat/store.ts:184                             new-chat awaiting-id phase, error/draft reset.
  ────────────────────────────────────────────────────────  ──────────────────────────────────────────────────  ───────────────────────────────────────────────────
   clearError                                                ChatStore.clearError() in apps/web-next/src/        Direct replacement, except store uses undefined;
                                                             state/chat/store.ts:291                             context uses null.
  ────────────────────────────────────────────────────────  ──────────────────────────────────────────────────  ───────────────────────────────────────────────────
   resetStreamingState                                       ChatStore.resetStreamingState() in apps/web-        Preserves committed history, clears draft/flags.
                                                             next/src/state/chat/store.ts:302
  ────────────────────────────────────────────────────────  ──────────────────────────────────────────────────  ───────────────────────────────────────────────────
                                                                                                                 facade/context wrapper.
  ────────────────────────────────────────────────────────  ──────────────────────────────────────────────────  ───────────────────────────────────────────────────
   title, isStreaming, isNewChat, URL transition flags       StatusSnapshot via getStatusSnapshot()              Replaces several useState fields with one status
                                                                                                                 surface.
                                                             web-next/src/state/chat/store.ts:159                targets Dynamic/SWR message ownership.
  ────────────────────────────────────────────────────────  ──────────────────────────────────────────────────  ───────────────────────────────────────────────────
   Dev inspection                                            debugSnapshot() / registry debugSnapshot()          Backs the planned window.__chatStoreSnapshot.

  Still Facade-Owned
  These are not replaced by the store itself and should stay in the Phase 3 facade/context adapter:

  - Building and sending the actual AIChatRequest: metadata, model lookup, provider key flags, batchId, imgGenFields, and sendEvent.
  - Asset batch rotation via startNewBatch().
  - Duplicate-send / active-stream guard currently handled by recentMessagesRef and activeUserStreamsRef.
  - isConnected, which still comes from chat-ws-context.
  - document.title effect from status title.
  - The React router half of recoupling after registry emits phase: "recoupled".

  Main Adapter Gap
  The current context exposes derived fields: streamedText, thinkingText, isThinking, thinkingDuration, streamingMessageBlocks, currentStreamingMessage,
  currentUserMsgId, currentAiMsgId, currentImgGenAttachmentId, imgGenEnabled, and imgGenFields.

  The store intentionally does not store those directly. It exposes DraftSnapshot = readonly AIChatChunk[] from apps/web-next/src/state/chat/store-types.ts:62.
  Phase 3 needs a selector/helper that folds ChatDraft into the legacy context shape.

  Small Mismatches To Check
  store-types.ts mentions prependHistory, but apps/web-next/src/state/chat/store.ts:175 currently only has hydratePage(). Ingesting any page works through
  ingestConversation(), but the named method is not there.

  Also, current context clears isNewChat after router recouple; store sets isNewChat in beginSend() but does not clear it on completion. If consumers depend on the
  old transient meaning, clear it during recouple or derive it in the facade.

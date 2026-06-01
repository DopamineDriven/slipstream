# Web-Next Chat External Store Architecture

## Summary

Move apps/web-next chat orchestration into a first-party useSyncExternalStore store, while keeping a chat context as the ergonomic React API. The context
should not own canonical chat state. It should subscribe to the external store, expose selected snapshots/actions, and wire app dependencies into store
commands.

Do not touch apps/web.

## Key Changes

- Add a dedicated chat external store for web-next, likely under apps/web-next/src/stores/chat-store.ts.
- Keep AIChatProvider / useAIChatContext, but convert it into a thin facade:
    - reads state from the external store via useSyncExternalStore
    - exposes stable chat actions
    - injects dependencies such as user id, selected model, provider context, cookies, batch helpers, router, and socket send
    - does not keep canonical messages, stream text, message ids, or completion state in useState

- Keep the first pass scoped to chat state only:
    - active conversation id
    - title
    - streaming blocks/text/thinking state
    - optimistic user messages
    - final persisted AI message from ai_chat_response.convo
    - image-gen streaming/final fields
    - error/connection-facing chat status

- Leave asset upload, model selection, API keys, TTS, and provider-context concerns in their existing contexts for now.
- Keep ChatWebSocketProvider as the socket owner in this phase, but have WebSocket chat events dispatch into the chat store.

## Implementation Details

- The store exposes:
    - getSnapshot
    - subscribe
    - typed action methods such as hydrateConversation, sendChatStarted, applyChunk, applyResponse, applyError, resetStreamingState, and
      setActiveConversationId

- The chat context exposes the same practical shape the UI already expects where possible:
    - activeConversationId
    - messages
    - streamedText
    - isStreaming
    - isComplete
    - thinkingText
    - isThinking
    - thinkingDuration
    - imgGenEnabled
    - imgGenFields
    - currentUserMsgId
    - currentAiMsgId
    - sendChat
    - resetStreamingState

- Store internals use purpose-specific registries:
    - messageRegistry: Map<string, MessageSingleton<true>>
    - ordered message ids per conversation
    - active stream state keyed by conversation id
    - optimistic id mapping for temp user ids to real server ids

- ai_chat_chunk only updates ephemeral stream state.
- ai_chat_response commits the server-persisted result:
    - read evt.convo.messages[0]
    - replace/remove the temporary streaming AI message
    - reconcile the optimistic user message id if evt.userMsgId is present
    - merge final image-gen attachments from the server payload rather than recreating them client-side

- Keep local stream assembly from messageBlocks for live display, but treat it as provisional. The final rendered AI message should come from evt.convo, not
  from finalizeStreamingMessage.

- Preserve the new-chat transition behavior:
    - initial send uses new-chat
    - first real conversationId from chunk/response updates store state
    - route replacement happens only for the new-chat to real id transition

- Convert apps/web-next/src/app/(chat)/chat/[conversationId]/page.tsx into a client-shell route:
    - no getConversationRouteProps
    - pass only conversationId param into the client chat surface
    - keep auth in (chat)/layout.tsx

- Fix useConversationMessages and matching API route contracts:
    - current hook expects { convo, nextCursor, hasMore }
    - current API routes return raw ConversationSingleton<true>
    - recommended: update the API routes to return the Page shape so pagination remains explicit
    - first page loads newest persisted messages
    - loadMore fetches older pages
    - no focus/reconnect revalidation
    - SWR hydration calls chatStore.hydrateConversation(...)
    - WebSocket final responses update the chat store, not the SWR cache by default

## Test Plan

- Typecheck apps/web-next and affected packages.
- Add focused unit tests for the store action layer:
    - SWR hydration
    - optimistic user message insertion
    - new-chat real id transition
    - chunk block merge by ordinal
    - final ai_chat_response.convo.messages[0] commit
    - duplicate response handling by message id
    - error transition clears active stream without deleting persisted messages

- Manual scenarios:
    - open existing conversation with 500+ messages and load older pages
    - send text message in existing conversation
    - send from new-chat and verify URL/state transition
    - send image-gen message and verify partial then final attachments
    - verify no full message list flicker after final response

## Assumptions

- AIChatContext remains, but becomes a store-backed facade rather than the source of truth.
- apps/web-next only; apps/web remains untouched.
- Backend WebSocket contract is already correct, especially ai_chat_response.convo: ConversationSingleton<true> containing exactly the latest persisted AI
  message.

- SWR remains acceptable for paginated persisted history, but it is not the live chat authority.
- No new dependencies, no any, no zod, no bare type assertions, and no .filter(Boolean).

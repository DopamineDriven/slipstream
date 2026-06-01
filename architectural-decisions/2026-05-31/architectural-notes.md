# Plan of Attack

*commit after each phase for checkpoints (that way we can revert if something goes awry)*

### Phase One &mdash; The Store itself

### Phase Two &mdash; Rewire SWR and the two API files it hits to close the gap for handling cursors/pagination (in the api [at the convo level](./apps/web-next/src/app/api/users/[userId]/chat/[conversationId]/route.ts) ([and the messages only level](./apps/web-next/src/app/api/users/[userId]/chat/[conversationId]/messages/[cursorId]/route.ts)) and in the [swr workup itself](./apps/web-next/src/hooks/use-conversation-messages.ts)) 

- note: the client tree expects the shape of `ConversationSingleton<true>` so getting the conversation object (identical to the shape my convo field returns on ai_chat_response) is highly advised to avoid massive rewriting

### Phase Three &mdash; rewire the [ai-chat-context.tsx file](./apps/web-next/src/context/ai-chat-context.tsx) as a façade

### Phase Four &mdash; convert the existing [apps/web/src/app/(chat)/chat/[conversationId]/page.tsx](./apps/web-next/src/app/(chat)/chat/[conversationId]/page.tsx) from server to client

### Phase Five &mdash; test the changes by spinning ws-server and web-next up locally 

### Phase Six &mdash; add playwright e2e testing to the apps/web-next repo

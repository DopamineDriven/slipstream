# Conversation Hydration Cache Prewarm

Date: 2026-06-26

Status: implemented in `apps/web-next` (and `apps/web`)

## Summary

Conversation history pagination is split into two paths:

1. Visible pagination remains user-driven. `useLoadOlderHistory` calls `loadMore`
   only when upward scroll velocity crosses the trigger threshold.
2. Background hydration is cache-only. `ConversationHydrationProvider` listens for
   `hydrate_conversation_ack` and writes older pages into SWR cursor keys without
   increasing SWR Infinite `size` and without hydrating the chat store directly.

This keeps the "next page is instant" behavior while avoiding the old
`requestIdleCallback` cascade that loaded every remaining page into the rendered
message list.

## Diagram

```mermaid
flowchart TD
  subgraph Browser
    A["Chat route mounts"] --> B["useConversationMessages loads page 0"]
    B --> C["SWR Infinite data contains visible pages only"]
    C --> D["useHydrateChatStore hydrates ChatStore from visible SWR data"]
    D --> E["ChatFeed renders committed store messages"]

    B --> F{"oldest visible page has nextCursor?"}
    F -- "yes" --> G["ConversationHydrationProvider sends hydrate_conversation"]
    F -- "no" --> H["No prewarm needed"]

    N["hydrate_conversation_ack received"] --> O["Map each ack page to SWR Page"]
    O --> P["mutate cursor key with revalidate:false"]
    P --> Q["Future cursor page is warm in SWR cache"]

    R["User scrolls upward"] --> S["useLoadOlderHistory velocity trigger"]
    S --> T["loadMore increments SWR Infinite size by 1"]
    T --> U["SWR asks for cursor key"]
    U --> V{"cursor key warm?"}
    V -- "yes" --> W["Resolve instantly from cache"]
    V -- "no" --> X["Fetch cursor API route"]
    W --> C
    X --> C
  end

  subgraph WSServer
    G --> I["ResolverHydrateConvoService"]
    I --> J["PrismaConvoHydrationService async generator"]
    J --> K["Query messages where ordinal < cursor"]
    K --> L["Yield HydrateConversationPage objects"]
    L --> M["Send one hydrate_conversation_ack"]
    M --> N
  end

  Y["Important boundary"] -.-> P
  Y -.->|does not call setSize| T
  Y -.->|does not call store.hydratePage| D
```

## Key Decisions

- The websocket ack is handled by a top-level context, not the pagination hook,
  so the listener is stable and mounted once under `ChatWebSocketProvider`.
- The context uses `client.addListener` rather than `client.on`, because this is
  shared transport plumbing and should coexist with other event consumers.
- `hydrate_conversation_ack.pages` are written to future SWR cursor keys:
  `["cursor", userId, conversationId, cursorOrdinal]`.
- The shared `CONVERSATION_PAGE_SIZE` and page-key builders live in
  `apps/web-next/src/lib/conversation-pages.ts`, keeping the API routes, hook,
  and context aligned.
- The chat store only ingests pages currently present in SWR Infinite `data`.
  Prefetched pages become visible only after the user triggers `loadMore`.

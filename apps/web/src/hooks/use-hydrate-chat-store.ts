"use client";

/**
 * The SWR → store hydration bridge. Phase 4 replaces the server route's `initialMessages` seed with client-side
 * SWR loading: `useConversationMessages` fetches cold history pages, and this hook feeds the merged
 * `ConversationSingleton<true>` into `store.hydratePage` (→ `ingestConversation`, idempotent upsert-by-id). The
 * store stays the single read model; SWR is a write-only loader into it.
 *
 * `loadMore` / `hasMore` are returned for the (deferred) upward-pagination + scroll-anchoring wiring; `isLoading`
 * drives the cold-load skeleton. Pass `conversationId: undefined` for home / new-chat so the loader's key is null
 * and no fetch happens (those have no server history).
 */

import { useEffect } from "react";
import { useConversationMessages } from "@/hooks/use-conversation-messages";
import type { ChatStore } from "@/state/chat/store";

export function useHydrateChatStore(
  store: ChatStore,
  args: { userId?: string; conversationId?: string }
) {
  const { conversation, isLoading, isValidating, loadMore, error } =
    useConversationMessages(args);

  useEffect(() => {
    if (conversation) store.hydratePage({ convo: conversation });
  }, [conversation, store]);

  const hasMore = conversation
    ? (conversation.messages.at(0)?.ordinal ?? 0) > 0
    : false;

  return { isLoading, isValidating, loadMore, hasMore, error } as const;
}

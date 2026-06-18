"use client";

/**
 * The SWR → store hydration bridge. Phase 4 replaces the server route's `initialMessages` seed with client-side
 * SWR loading: `useConversationMessages` fetches cold history pages, and this hook feeds the merged
 * `ConversationSingleton<true>` into `store.hydratePage` (→ `ingestConversation`, idempotent upsert-by-id). The
 * store stays the single read model; SWR is a write-only loader into it.
 *
 * `loadMore` / `hasMore` / `isLoadingMore` drive the feed's upward-pagination + scroll-anchoring; `isLoading` drives
 * the cold-load skeleton. Pass `conversationId: undefined` for home / new-chat so the loader's key is null and no
 * fetch happens (those have no server history).
 */
import { useEffect } from "react";
import { useConversationMessages } from "@/hooks/use-conversation-messages";
import type { ChatStore } from "@/state/chat/store";

export function useHydrateChatStore(
  store: ChatStore,
  args: { userId?: string; conversationId?: string }
) {
  const { conversation, isLoading, isValidating, isLoadingMore, loadMore, error } =
    useConversationMessages(args);

  useEffect(() => {
    if (conversation) store.hydratePage({ convo: conversation });
  }, [conversation, store]);

  // Ordinal-based: oldest loaded ordinal > 0 means older pages remain. `false` until the first page lands (safer
  // than the loader's optimistic `true`, so the sentinel can't fire page 1 before page 0 exists).
  const hasMore = conversation
    ? (conversation.messages.at(0)?.ordinal ?? 0) > 0
    : false;

  return {
    isLoading,
    isValidating,
    isLoadingMore,
    loadMore,
    hasMore,
    error
  } as const;
}

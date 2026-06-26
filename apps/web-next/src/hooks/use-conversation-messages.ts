"use client";

import type {
  ConversationMessagesPage,
  ConversationPageKey
} from "@/lib/conversation-pages";
import type { SWRInfiniteKeyLoader } from "swr/infinite";
import { useCallback, useEffect, useMemo } from "react";
import { useConversationHydration } from "@/context/convo-hydration-context";
import {
  CONVERSATION_PAGE_SIZE,
  conversationCursorPageKey,
  conversationInitialPageKey
} from "@/lib/conversation-pages";
import useSWRInfinite from "swr/infinite";
import type {
  ConversationSingleton,
  MessageSingleton
} from "@slipstream/types";

export type Page = ConversationMessagesPage;

export interface UseConversationMessagesArgs {
  userId?: string;
  conversationId?: string;
  fallback?: Page;
}

const fetcher = async <const T>(url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return await res.json<T>();
};

export function useConversationMessages({
  userId,
  conversationId,
  fallback
}: UseConversationMessagesArgs) {
  const { requestConversationHydration } = useConversationHydration();

  const getKey: SWRInfiniteKeyLoader<Page, ConversationPageKey | null> =
    useCallback(
      (pageIndex, previousPageData) => {
        if (!userId || !conversationId) return null;

        if (pageIndex === 0) {
          return conversationInitialPageKey(userId, conversationId);
        }

        if (
          !previousPageData ||
          !previousPageData.hasMore ||
          !previousPageData.nextCursor
        ) {
          return null;
        }

        return conversationCursorPageKey(
          userId,
          conversationId,
          previousPageData.nextCursor
        );
      },
      [userId, conversationId]
    );

  const pageFetcher = async (key: ConversationPageKey) => {
    if (key[0] === "initial") {
      const [_, userId, conversationId] = key;
      const url = `/api/users/${userId}/chat/${conversationId}`;
      const initial = await fetcher<Page>(url);
      return {
        convo: initial.convo,
        nextCursor: initial.nextCursor,
        hasMore: initial.hasMore
      };
    }
    const [_, userId, conversationId, cursorId] = key;
    const url = `/api/users/${userId}/chat/${conversationId}/messages/${cursorId}`;
    return await fetcher<Page>(url);
  };
  const { data, error, size, setSize, mutate, isLoading, isValidating } =
    useSWRInfinite<Page, Error>(getKey, pageFetcher, {
      // Same posture as your useConversations — chat history is cold data.
      // Revalidating on focus/reconnect would fight the WebSocket and
      // blow away in-memory mutations we made via appendMessage.
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: !fallback, // if RSC hydrated us, trust it
      revalidateFirstPage: false, // critical: don't refetch page 0 when loading page 1+
      revalidateIfStale: false,
      refreshInterval: 0,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      fetcher: pageFetcher,
      dedupingInterval: 60000,
      errorRetryCount: 2,
      errorRetryInterval: 5000,
      fallbackData: fallback ? [{ ...fallback }] : undefined
    });

  const lastPage = data?.at(-1);
  const prewarmCursor = lastPage?.nextCursor;

  useEffect(() => {
    if (
      !userId ||
      !conversationId ||
      lastPage?.hasMore !== true ||
      prewarmCursor == null
    ) {
      return;
    }

    requestConversationHydration({
      conversationId,
      lowestLoadedOrdinal: prewarmCursor,
      take: CONVERSATION_PAGE_SIZE
    });
  }, [
    conversationId,
    lastPage?.hasMore,
    prewarmCursor,
    requestConversationHydration,
    userId
  ]);

  const conversation = useMemo<ConversationSingleton<true> | undefined>(() => {
    const firstPage = data?.[0]?.convo;
    if (!firstPage) return undefined;
    // Each page is DB-ordered `ordinal: desc` and pages load newest-block-first, so the flattened result is
    // already globally descending — a reverse (not a comparator sort) yields the ascending transcript. Gapless
    // ordinals + the exclusive `ordinal < cursor` cursor guarantee contiguous, non-overlapping page blocks.
    const messages = (data ?? [])
      .flatMap(page => page.convo.messages)
      .reverse();
    return { ...firstPage, messages };
  }, [data]);

  const hasMore = data ? (data[data.length - 1]?.hasMore ?? false) : true;

  const isLoadingMore =
    (data && size > data?.length) ??
    (size > 0 && isValidating && !!data && data.length < size);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) return Promise.resolve();
    return setSize(s => s + 1);
  }, [hasMore, isLoadingMore, setSize]);

  /**
   * Append to the newest page (page 0). No server roundtrip.
   * SWR Infinite's mutate receives Page[] — we clone-modify page 0
   * and pass `{ revalidate: false }` so focus/reconnect rules stay out
   * of the way.
   */
  const appendMessage = useCallback(
    (message: MessageSingleton<true>) => {
      return mutate(
        pages => {
          if (!pages || pages.length === 0) return pages;
          const [first, ...rest] = pages;
          if (
            first?.convo.messages.findLastIndex(m => m.id === message.id) !== -1
          ) {
            return pages;
          }
          return [
            {
              ...first,
              convo: {
                ...first.convo,
                messages: [...first.convo.messages, message]
              }
            },
            ...rest
          ];
        },
        { revalidate: false }
      );
    },
    [mutate]
  );

  const removeMessage = useCallback(
    (messageId: string) => {
      return mutate(
        pages => {
          if (!pages) return pages;
          return pages.map(page => ({
            ...page,
            convo: {
              ...page.convo,
              messages: page.convo.messages.filter(m => m.id !== messageId)
            }
          }));
        },
        { revalidate: false }
      );
    },
    [mutate]
  );
  const updateCache = useCallback(
    (updater: (pages: Page[] | undefined) => Page[]) => {
      return mutate(updater, { revalidate: false });
    },
    [mutate]
  );

  const refresh = useCallback(() => mutate(), [mutate]);

  return {
    refresh,
    updateCache,
    appendMessage,
    loadMore,
    conversation,
    removeMessage,
    isLoading,
    isValidating,
    isLoadingMore,
    hasMore,
    data,
    error
  };
}

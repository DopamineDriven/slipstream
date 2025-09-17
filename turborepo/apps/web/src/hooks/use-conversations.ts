"use client";

import type { SidebarProps } from "@/types/ui";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import useSWR, { KeyedMutator } from "swr";

export type UseConversationsReturn = {
  conversations: SidebarProps[] | undefined;
  isLoading: boolean;
  error: Error | undefined;
  isValidating: boolean;
  mutate: KeyedMutator<SidebarProps[]>;
  updateTitle: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  refresh: () => Promise<SidebarProps[] | undefined>;
  forceRefresh: () => Promise<SidebarProps[] | undefined>;
  updateCache: (
    updater: (current: SidebarProps[] | undefined) => SidebarProps[]
  ) => Promise<SidebarProps[] | undefined>;
  refreshSilently: () => Promise<SidebarProps[] | undefined>;
};

const fetcher = async (url: string): Promise<SidebarProps[]> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<SidebarProps[]>;
};
export function useConversations(userId?: string): UseConversationsReturn {
  const router = useRouter();
  const {
    data: conversations,
    mutate,
    isLoading,
    error,
    isValidating
  } = useSWR<SidebarProps[], Error>(
    userId ? `/api/users/${userId}/conversations` : null,
    fetcher,
    {
      revalidateOnFocus: false, // Don't revalidate when window gains focus (tab switching)
      revalidateOnReconnect: false, // Don't revalidate on network reconnect
      revalidateOnMount: true, // Keep initial load on mount
      revalidateIfStale: false, // Don't revalidate if data is considered stale
      refreshInterval: 0, // Disable automatic polling
      dedupingInterval: 60000, // Cache requests for 1 minute to prevent duplicate calls
      errorRetryCount: 2,
      errorRetryInterval: 5000,
      fetcher
    }
  );
  /**
   * Revalidate from server
   */
  const refresh = useCallback(async () => {
    return await mutate();
  }, [mutate]);

  /**
   * Refresh without showing loading state
   */
  const refreshSilently = useCallback(async () => {
    return await mutate(undefined, { revalidate: true });
  }, [mutate]);

  /**
   * Clear cache and fetch fresh
   */
  const forceRefresh = useCallback(async () => {
    return await mutate(undefined, { revalidate: true, populateCache: true });
  }, [mutate]);
  /**
   *  Update cache without server call
   */
  const updateCache = useCallback(
    (updater: (current: SidebarProps[] | undefined) => SidebarProps[]) => {
      return mutate(updater, false);
    },
    [mutate]
  );

  const updateTitle = async (id: string, newTitle: string): Promise<void> => {
    if (!conversations || !userId) return;

    // Optimistic update
    const optimisticData = conversations.map(conv =>
      conv.id === id ? { ...conv, title: newTitle } : conv
    );

    try {
      await mutate(optimisticData, false);

      const response = await fetch(`/api/users/${userId}/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle })
      });

      if (!response.ok) throw new Error("Update failed");

      const updated = (await response.json()) as SidebarProps;
      const serverData = conversations.map(conv =>
        conv.id === id ? updated : conv
      );

      await mutate(serverData, false);
    } catch (error) {
      await mutate(conversations, false); // Revert
      throw error;
    }
  };

  const deleteConversation = async (id: string): Promise<void> => {
    if (!conversations) return;

    const optimisticData = conversations.filter(conv => conv.id !== id);

    try {
      await mutate(optimisticData, false);

      const response = await fetch(`/api/users/${userId}/conversations/${id}`, {
        method: "DELETE"
      });

      if (!response.ok) throw new Error("Delete failed");

      // Check if we need to navigate away
      if (window.location.pathname === `/chat/${id}`) {
        router.push("/");
      }
    } catch (error) {
      await mutate(conversations, false); // Revert
      throw error;
    }
  };

  return {
    mutate,
    conversations,
    isLoading,
    isValidating,
    error,
    updateTitle,
    deleteConversation,
    refresh,
    refreshSilently,
    updateCache,
    forceRefresh
  };
}

// src/context/api-keys-context.tsx
"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import useSWR from "swr";
import type { ClientContextWorkupProps } from "@slipstream/types";

interface ApiKeysContextValue {
  apiKeys: ClientContextWorkupProps;
  updateApiKeys: (keys: ClientContextWorkupProps) => void;
}

const ApiKeysContext = createContext<ApiKeysContextValue | undefined>(
  undefined
);

const fallbackApiKeys = {
  isDefault: {
    anthropic: false,
    gemini: false,
    grok: false,
    meta: false,
    openai: false,
    vercel: false
  },
  isSet: {
    anthropic: false,
    gemini: false,
    grok: false,
    meta: false,
    openai: false,
    vercel: false
  }
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json<ClientContextWorkupProps>();
};

export function ApiKeysProvider({
  children,
  userId,
  fallbackData
}: Readonly<{
  children: ReactNode;
  userId?: string;
  fallbackData?:
    | ClientContextWorkupProps
    | Promise<ClientContextWorkupProps>
    | undefined;
}>) {
  const { data, mutate } = useSWR(
    userId ? `/api/users/${userId}/api-keys` : null,
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
      fetcher,
      fallbackData // always hydrates on first load or when a user reauthenticates (starts a new session)
    }
  );

  const updateApiKeys = (keys: ClientContextWorkupProps) => {
    // Optimistically update SWR cache, no immediate revalidation
    mutate(keys, false);
  };

  return (
    <ApiKeysContext.Provider
      value={{ updateApiKeys, apiKeys: data ?? fallbackApiKeys }}>
      {children}
    </ApiKeysContext.Provider>
  );
}

export function useApiKeys() {
  const context = useContext(ApiKeysContext);
  if (!context) {
    throw new Error("useApiKeys must be used within ApiKeysProvider");
  }
  return context;
}

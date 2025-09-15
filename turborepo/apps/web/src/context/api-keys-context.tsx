// src/context/api-keys-context.tsx
"use client";

import type { ClientContextWorkupProps } from "@slipstream/types";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";

interface ApiKeysContextValue {
  apiKeys: ClientContextWorkupProps;
  updateApiKeys: (keys: ClientContextWorkupProps) => void;
}

const ApiKeysContext = createContext<ApiKeysContextValue | undefined>(
  undefined
);

export function ApiKeysProvider({
  children,
  userId
}: Readonly<{ children: ReactNode; userId?: string }>) {
  const [apiKeys, setApiKeys] = useState<ClientContextWorkupProps>();
  const [_isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchApiKeys() {
      if (!userId) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/users/${userId}/api-keys`);
        console.log("fetching user api key data");
        if (response.ok) {
          const data = (await response.json()) as ClientContextWorkupProps;
          setApiKeys(data);
        }
      } catch (error) {
        console.error("Failed to fetch API keys:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchApiKeys();
  }, [userId]);

  const updateApiKeys = (keys: ClientContextWorkupProps) => {
    setApiKeys(keys);
  };
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
  return (
    <ApiKeysContext.Provider
      value={{ updateApiKeys, apiKeys: apiKeys ?? fallbackApiKeys }}>
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

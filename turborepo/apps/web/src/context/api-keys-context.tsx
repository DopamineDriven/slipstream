// src/context/api-keys-context.tsx
"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";
import type { ClientContextWorkupProps } from "@t3-chat-clone/types";

interface ApiKeysContextValue {
  apiKeys: ClientContextWorkupProps;
  updateApiKeys: (keys: ClientContextWorkupProps) => void;
}

const ApiKeysContext = createContext<ApiKeysContextValue | undefined>(
  undefined
);

interface ApiKeysProviderProps {
  children: ReactNode;
  initialApiKeys: ClientContextWorkupProps;
}

export function ApiKeysProvider({
  children,
  initialApiKeys
}: ApiKeysProviderProps) {
  const [apiKeys, setApiKeys] =
    useState<ClientContextWorkupProps>(initialApiKeys);

  const updateApiKeys = (keys: ClientContextWorkupProps) => {
    setApiKeys(keys);
  };

  return (
    <ApiKeysContext.Provider value={{ apiKeys, updateApiKeys }}>
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

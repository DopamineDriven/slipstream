"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import type { ClientContextWorkupProps, EventTypeMap } from "@slipstream/types";
import type { $Enums } from "@slipstream/db/node/generated/client";

interface ApiKeysContextValue {
  sendProviderContextPing: () => void;
  sendProviderContextUpdate: (success: boolean) => void;
  providerContext: ClientContextWorkupProps | null;
  isAwaitingUpdateAck: boolean;
  isAwaitingInitial: boolean;
  isAwaitingPong: boolean;
}

const ApiKeysContext = createContext<ApiKeysContextValue | undefined>(
  undefined
);

function equalityCheck(
  one: ClientContextWorkupProps,
  two: ClientContextWorkupProps
) {
  const isSet = { o: one.isSet, t: two.isSet } as const;

  const isDefault = { o: one.isDefault, t: two.isDefault } as const;

  const p = [
    "anthropic",
    "cohere",
    "gemini",
    "mistral",
    "openai",
    "meta",
    "vercel",
    "grok",
    "deepseek",
    "moonshotai",
    "zai",
    "alibaba",
    "minimax"
  ] as const satisfies Lowercase<$Enums.Provider>[];

  for (const provider of p) {
    if (isSet.o[provider] !== isSet.t[provider]) return false;
    if (isDefault.o[provider] !== isDefault.t[provider]) return false;
  }

  return true;
}

function eqCheck(
  one: ClientContextWorkupProps | null,
  two: ClientContextWorkupProps | null
) {
  if (one && two) return equalityCheck(one, two);
  // return false if one or both are null
  else return false;
}

export function ApiKeysProvider({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const { client, sendEvent } = useChatWebSocketContext();

  const [providerContext, setProviderContext] =
    useState<ClientContextWorkupProps | null>(null);

  const providerContextRef = useRef<ClientContextWorkupProps | null>(null);

  const [isAwaitingUpdateAck, setIsAwaitingUpdateAck] = useState(false);
  const [isAwaitingPong, setIsAwaitingPong] = useState(false);
  const [isAwaitingInitial, setIsAwaitingInitial] = useState(true);

  useEffect(() => {
    providerContextRef.current = providerContext;
  }, [providerContext]);

  useEffect(() => {
    const handleConnection = (ev: EventTypeMap["connection_established"]) => {
      if (eqCheck(providerContextRef.current, ev.providerContext) === false) {
        setProviderContext(ev.providerContext);
        setIsAwaitingInitial(false);
      } else {
        setIsAwaitingInitial(false);
      }
    };

    const handleProviderContextUpdateAck = (
      ev: EventTypeMap["provider_context_update_ack"]
    ) => {
      if (eqCheck(providerContextRef.current, ev.providerContext) === false) {
        setProviderContext(ev.providerContext);
        setIsAwaitingUpdateAck(false);
      } else {
        setIsAwaitingUpdateAck(false);
      }
    };

    const handleProviderContextPong = (
      ev: EventTypeMap["provider_context_pong"]
    ) => {
      if (eqCheck(providerContextRef.current, ev.providerContext) === false) {
        setProviderContext(ev.providerContext);
        setIsAwaitingPong(false);
      } else {
        setIsAwaitingPong(false);
      }
    };

    client.on("connection_established", handleConnection);
    client.on("provider_context_pong", handleProviderContextPong);
    client.on("provider_context_update_ack", handleProviderContextUpdateAck);
    return () => {
      client.off("connection_established");
      client.off("provider_context_pong");
      client.off("provider_context_update_ack");
    };
  }, [client]);

  const sendProviderContextUpdate = useCallback(
    (success: boolean) => {
      if (success === false) return;
      else {
        setIsAwaitingUpdateAck(true);
        sendEvent("provider_context_update", {
          type: "provider_context_update"
        });
      }
    },
    [sendEvent]
  );

  const sendProviderContextPing = useCallback(() => {
    setIsAwaitingPong(true);
    sendEvent("provider_context_ping", {
      type: "provider_context_ping"
    });
  }, [sendEvent]);

  return (
    <ApiKeysContext.Provider
      value={{
        isAwaitingInitial,
        isAwaitingPong,
        isAwaitingUpdateAck,
        sendProviderContextPing,
        sendProviderContextUpdate,
        providerContext
      }}>
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

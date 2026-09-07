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
  /**
   * monotonic count of `provider_context_update_ack` frames received. Snapshot
   * it before sending `provider_context_update`; an ack whose seq exceeds the
   * snapshot is yours — even when its providerContext equals the current one
   * (e.g. editing an existing key).
   */
  updateAckSeq: number;
  /**
   * subscribe to ack arrivals; the listener receives the new seq. Returns the
   * unsubscribe. This is the sanctioned "external event → setState in a
   * callback" shape, so consumers don't need a setState-in-effect watcher.
   */
  subscribeUpdateAck: (listener: (seq: number) => void) => () => void;
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
    "minimax",
    "sakana"
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
  const [updateAckSeq, setUpdateAckSeq] = useState(0);
  // ref-backed so the (once-registered) socket handler always sees the live seq + listeners
  const ackSeqRef = useRef(0);
  const ackListenersRef = useRef(new Set<(seq: number) => void>());

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
      }
      setIsAwaitingUpdateAck(false);
      ackSeqRef.current += 1;
      const seq = ackSeqRef.current;
      setUpdateAckSeq(seq);
      for (const listener of ackListenersRef.current) listener(seq);
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

  const subscribeUpdateAck = useCallback((listener: (seq: number) => void) => {
    const listeners = ackListenersRef.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <ApiKeysContext.Provider
      value={{
        isAwaitingInitial,
        isAwaitingPong,
        isAwaitingUpdateAck,
        sendProviderContextPing,
        sendProviderContextUpdate,
        providerContext,
        updateAckSeq,
        subscribeUpdateAck
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

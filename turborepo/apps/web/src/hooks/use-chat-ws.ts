"use client";

import { useEffect, useMemo, useState } from "react";
import { ChatEventResolver } from "@/resolver/chat-event-resolver";
import { ChatWebSocketClient } from "@/utils/chat-ws-client";
import type { ChatWsEvent, EventTypeMap } from "@t3-chat-clone/types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";

export function useChatWebSocket(email?: string | null) {
  const [lastEvent, setLastEvent] = useState<ChatWsEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const client = useMemo(() => new ChatWebSocketClient(`${WS_BASE}?email=${email}`), [email]);

  useEffect(() => {
    const resolver = new ChatEventResolver(client);
    resolver.registerAll();
  }, [client]);

  useEffect(() => {
    client.connect();

    const onEvent = (ev: ChatWsEvent) => setLastEvent(ev);
    client.addListener(onEvent);

    // polling -> connection status update
    const tid = setInterval(() => setIsConnected(client.isConnected), 200);

    return () => {
      clearInterval(tid);
      client.removeListener(onEvent);
      client.close();
    };
  }, [client]);

  const sendEvent = useMemo(
    () =>
      <const T extends keyof EventTypeMap>(
        event: T,
        data: EventTypeMap[typeof event]
      ) =>
        client.send(event, data),
    [client]
  );

  return { lastEvent, isConnected, sendEvent, client };
}

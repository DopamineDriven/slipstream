"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatWsEvent } from "@/types/chat-ws";
import { ChatWebSocketClient } from "@/utils/chat-ws-client";

export function useChatWebSocket(wsUrl: string) {
  const [lastEvent, setLastEvent] = useState<ChatWsEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);


  const clientRef = useRef<ChatWebSocketClient | null>(
    new ChatWebSocketClient(wsUrl)
  );

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    client.connect();

    const handleEvent = (data: ChatWsEvent) => setLastEvent(data);
    client.addListener(handleEvent);

    const interval = setInterval(() => setIsConnected(client.isConnected), 300);

    return () => {
      clearInterval(interval);
      client.removeListener(handleEvent);
      client.close();
    };
  }, [wsUrl]);
  const sendEvent = useCallback((event: ChatWsEvent) => {
    clientRef.current?.send(event);
  }, []);
  // once we're connected, send our auth
  useEffect(() => {
    if (isConnected) {
      sendEvent({
        type: "ping"
      } as ChatWsEvent);
    }
    return () => {};
  }, [isConnected, sendEvent]);

  return { lastEvent, sendEvent, isConnected, client: clientRef.current };
}

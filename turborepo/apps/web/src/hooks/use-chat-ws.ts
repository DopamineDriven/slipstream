"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { ChatWsEvent, EventTypeMap } from "@/types/chat-ws";
import { ChatEventResolver } from "@/resolver/chat-event-resolver";
import { ChatWebSocketClient } from "@/utils/chat-ws-client";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";

export function useChatWebSocket() {
  const { status, data: session } = useSession();
  const [lastEvent, setLastEvent] = useState<ChatWsEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const wsUrl = useMemo(() => {
    const email =
      status === "authenticated" && session?.user?.email
        ? encodeURIComponent(session.user.email)
        : "no-user-email";

    return `${WS_BASE}?email=${email}`;
  }, [status, session?.user?.email]);

  const client = useMemo(() => new ChatWebSocketClient(wsUrl), [wsUrl]);

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
      <const T extends keyof EventTypeMap>(event: T, data: EventTypeMap[typeof event]) =>
        client.send(event, data),
    [client]
  );

  return { lastEvent, isConnected, sendEvent, client };
}

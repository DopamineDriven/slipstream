"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ChatWebSocketClient } from "@/utils/chat-ws-client";
import type { ChatWsEvent, EventTypeMap } from "@t3-chat-clone/types";
import type { MessageHandler } from "@/types/chat-ws";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";

export function useChatWebSocket(email?: string | null) {
  const [lastEvent, setLastEvent] = useState<ChatWsEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Use ref to maintain stable client reference
  const clientRef = useRef<ChatWebSocketClient | null>(null);
  const emailRef = useRef(email);

  // Track if we need to recreate the client due to email change
  const shouldRecreateClient = emailRef.current !== email;

  // Initialize or recreate client when needed
  if (!clientRef.current || shouldRecreateClient) {
    // Clean up existing client before creating new one
    if (clientRef.current) {
      clientRef.current.close();
    }

    // Create new client with current email
    const wsUrl = email ? `${WS_BASE}?email=${encodeURIComponent(email)}` : WS_BASE;
    clientRef.current = new ChatWebSocketClient(wsUrl);
    emailRef.current = email;
  }

  const client = clientRef.current;

  useEffect(() => {
    // Event listener for all events
    const handleEvent = (event: ChatWsEvent) => {
      setLastEvent(event);
    };

    // Connection status listener
    const handleConnectionChange = (event: ChatWsEvent) => {
      // Update connection status based on events
      if (event.type === "ping") {
        setIsConnected(true);
      }
    };

    // Add listeners
    client.addListener(handleEvent);
    client.addListener(handleConnectionChange);

    // Connect
    client.connect();

    // More efficient connection status monitoring
    // Check immediately and after potential state changes
    const checkConnection = () => {
      setIsConnected(client.isConnected);
    };

    // Initial check
    checkConnection();

    const intervalId = setInterval(checkConnection, 1000);

    // Cleanup
    return () => {
      clearInterval(intervalId);
      client.removeListener(handleEvent);
      client.removeListener(handleConnectionChange);
    };
  }, [client]);

  // Stable send function
  const sendEvent = useCallback(
    <T extends keyof EventTypeMap>(
      event: T,
      data: EventTypeMap[T]
    ) => {
      client.send(event, data);
    },
    [client]
  );

  // Register handlers for specific events
  const on = useCallback((
      event: keyof EventTypeMap,
      handler: MessageHandler<typeof event>
    ) => {
      client.on(event, handler);

      // Return cleanup function
      return () => {
        client.off(event);
      };
    },
    [client]
  );

  // Manual cleanup function
  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
    }
  }, []);

  return {
    lastEvent,
    isConnected,
    sendEvent,
    client,
    on,
    disconnect
  };
}

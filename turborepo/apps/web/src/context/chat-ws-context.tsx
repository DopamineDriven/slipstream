"use client";

import type { MessageHandler } from "@/types/chat-ws";
import type { ChatWsEvent, EventTypeMap } from "@slipstream/types";
import type { User } from "next-auth";
import type { Context, ReactNode } from "react";
import { createContext, useContext, useEffect, useRef } from "react";
import { useChatWebSocket } from "@/hooks/use-chat-ws";
import { ChatWebSocketClient } from "@/utils/chat-ws-client";

export interface ChatWsContextProps {
  lastEvent: ChatWsEvent | null;
  isConnected: boolean;
  sendEvent: <T extends keyof EventTypeMap>(
    event: T,
    data: EventTypeMap[T]
  ) => void;
  client: ChatWebSocketClient;
  on: (
    event: keyof EventTypeMap,
    handler: MessageHandler<typeof event>
  ) => () => void;
}

const ChatWebSocketContext = createContext<ChatWsContextProps | null>(
  null
) satisfies Context<ChatWsContextProps | null>;

// Singleton manager to ensure only one client exists globally
class WebSocketManager {
  private static instance: WebSocketManager;
  private clients = new Map<string, ChatWebSocketClient>();

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  public getClient(key: string): ChatWebSocketClient | null {
    return this.clients.get(key) ?? null;
  }

  public setClient(key: string, client: ChatWebSocketClient): void {
    // Clean up any existing client with this key
    const existing = this.clients.get(key);
    if (existing && existing !== client) {
      existing.close();
    }
    this.clients.set(key, client);
  }

  public removeClient(key: string): void {
    const client = this.clients.get(key);
    if (client) {
      client.close();
      this.clients.delete(key);
    }
  }

  public clear(): void {
    this.clients.forEach(client => client.close());
    this.clients.clear();
  }
}

export function ChatWebSocketProvider({
  children,
  user
}: Readonly<{
  children: ReactNode;
  user?: undefined | null | User;
}>) {
  const wsManager = useRef(WebSocketManager.getInstance());
  const { lastEvent, isConnected, sendEvent, client, on, disconnect } =
    useChatWebSocket(user?.email);

  // Register this client with the manager
  useEffect(() => {
    if (!user?.email) return;
    const wsManagerInner = wsManager.current;
    const key = user?.email ?? "no-user@gmail.com";
    wsManagerInner.setClient(key, client);

    return () => {
      // Only remove if it's still our client (email hasn't changed)
      const currentClient = wsManagerInner.getClient(key);
      if (currentClient === client) {
        wsManagerInner.removeClient(key);
      }
    };
  }, [client, user?.email]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <ChatWebSocketContext.Provider
      value={{ lastEvent, isConnected, sendEvent, client, on }}>
      {children}
    </ChatWebSocketContext.Provider>
  );
}

export function useChatWebSocketContext() {
  const context = useContext(ChatWebSocketContext);
  if (!context) {
    throw new Error(
      "useChatWebSocketContext must be used within ChatWebSocketProvider"
    );
  }
  return context;
}

// Export manager for debugging/testing
export const getWebSocketManager = () => WebSocketManager.getInstance();

"use client";

import React, { createContext, useContext } from "react";
import type { ChatWsEvent } from "@/types/chat-ws";
import { useChatWebSocket } from "@/hooks/use-chat-ws";

export interface ChatWebSocketContextValue {
  lastEvent: ChatWsEvent | null;
  isConnected: boolean;
  sendEvent: (event: ChatWsEvent) => void;
}

const ChatWebSocketContext = createContext<ChatWebSocketContextValue | null>(
  null
);

export function ChatWebSocketProvider({
  children,
  wsUrl
}: {
  children: React.ReactNode;
  wsUrl: string;
}) {
  const { lastEvent, isConnected, sendEvent } = useChatWebSocket(wsUrl);

  return (
    <ChatWebSocketContext.Provider
      value={{ lastEvent, isConnected, sendEvent }}>
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

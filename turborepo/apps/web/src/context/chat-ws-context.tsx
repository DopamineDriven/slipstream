"use client";

import type { Context, ReactNode } from "react";
import { createContext, useContext } from "react";
import { useChatWebSocket } from "@/hooks/use-chat-ws";
import { ChatWebSocketClient } from "@/utils/chat-ws-client";
import type { ChatWsEvent, EventTypeMap } from "@t3-chat-clone/types";

export interface ChatWsContextProps {
  lastEvent: ChatWsEvent | null;
  isConnected: boolean;
  sendEvent: <const T extends keyof EventTypeMap>(
    event: T,
    data: EventTypeMap[T]
  ) => void;
  client: ChatWebSocketClient;
}

const ChatWebSocketContext = createContext<ChatWsContextProps | null>(
  null
) satisfies Context<ChatWsContextProps | null>;

export function ChatWebSocketProvider({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const { lastEvent, isConnected, sendEvent, client } = useChatWebSocket();

  return (
    <ChatWebSocketContext.Provider
      value={{ lastEvent, isConnected, sendEvent, client }}>
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

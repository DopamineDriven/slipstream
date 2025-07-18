"use client";

import type { Context, ReactNode } from "react";
import { createContext, useContext } from "react";
import { useChatWebSocket } from "@/hooks/use-chat-ws";
import { ChatWebSocketClient } from "@/utils/chat-ws-client";
import type { ChatWsEvent, EventTypeMap } from "@t3-chat-clone/types";
import { User } from "next-auth";

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
  children,
  user
}: Readonly<{
  children: ReactNode;
  user?: undefined | null | User;
}>) {
  const { lastEvent, isConnected, sendEvent, client } = useChatWebSocket(user?.email);

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

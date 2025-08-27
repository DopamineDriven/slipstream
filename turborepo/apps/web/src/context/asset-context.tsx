// src/context/ai-chat-context.tsx
"use client";

import {
  createContext,
  useContext
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApiKeys } from "@/context/api-keys-context";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import { useCookiesCtx } from "@/context/cookie-context";
import { useModelSelection } from "@/context/model-selection-context";
import { getModel } from "@/lib/get-model";
import { pathParser } from "@/lib/path-parser";
import type {
  AllModelsUnion,
  EventTypeMap,
  Provider
} from "@t3-chat-clone/types";
import type { AIChatRequestUserMetadata as UserData } from "@t3-chat-clone/types/events";

interface StreamingMessage {
  id: string;
  content: string;
  provider: Provider;
  model: string;
  timestamp: Date;
  isUser: boolean;
  thinkingText?: string;
  thinkingDuration?: number;
}

interface AIChatContextValue {
  // Core state - single source of truth
  activeConversationId: string | null;
  title: string | null;
  streamedText: string;
  isStreaming: boolean;
  isComplete: boolean;
  error: string | null;

  // Thinking state
  thinkingText: string;
  isThinking: boolean;
  thinkingDuration: number | null;

  // Message tracking
  currentStreamingMessage: StreamingMessage | null;

  // Actions
  sendChat: (prompt: string) => void;
  setActiveConversationId: (id: string | null) => void;
  clearError: () => void;
  resetStreamingState: () => void;

  // Status flags
  isWaitingForRealId: boolean;
  isConnected: boolean;
}


const AssetProvider = createContext<AIChatContextValue | undefined>(undefined);




export function AssetContextProvider({
  children,
  userId
}: {
  children: React.ReactNode;
  userId?: string;
}) {

}

export function useAssetContext() {
  const context = useContext(AssetProvider);
  if (!context) {
    throw new Error("useAIChatContext must be used within AIChatProvider");
  }
  return context;
}

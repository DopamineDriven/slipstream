// src/context/ai-chat-context.tsx
"use client";

import { createContext, useContext, useCallback, useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import { useModelSelection } from "@/context/model-selection-context";
import { useApiKeys } from "@/context/api-keys-context";
import { pathParser } from "@/lib/path-parser";
import { getModel } from "@/lib/get-model";
import type { Provider, AllModelsUnion, EventTypeMap } from "@t3-chat-clone/types";

interface StreamingMessage {
  id: string;
  content: string;
  provider: Provider;
  model: string;
  timestamp: Date;
  isUser: boolean;
}

interface AIChatContextValue {
  // Core state - single source of truth
  activeConversationId: string | null;
  title: string | null;
  streamedText: string;
  isStreaming: boolean;
  isComplete: boolean;
  error: string | null;

  // Message tracking
  currentStreamingMessage: StreamingMessage | null;

  // Actions - just one method!
  sendChat: (prompt: string) => void;

  setActiveConversation: (id: string) => void;
  clearError: () => void;
  resetStreamingState: () => void;

  // Status flags
  isWaitingForRealId: boolean;
  isConnected: boolean;
}

const AIChatContext = createContext<AIChatContextValue | undefined>(undefined);

// Active user streams tracking (prevents duplicate sends)
const activeUserStreams = new Set<string>();

export function AIChatProvider({
  children,
  userId
}: {
  children: React.ReactNode;
  userId?: string;
}) {
  const pathname = usePathname();
  const { client, isConnected, sendEvent } = useChatWebSocketContext();
  const { selectedModel } = useModelSelection();
  const { apiKeys } = useApiKeys();

  // Parse conversation ID from pathname using robust parser
  const getConversationIdFromPath = useCallback((): string | null => {
    const parsed = pathParser(pathname);
    return parsed.conversationId ?? null;
  }, [pathname]);

  // Core state
  const [activeConversationId, setActiveConversationId] = useState<string | null>(getConversationIdFromPath());
  const [title, setTitle] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isWaitingForRealId, setIsWaitingForRealId] = useState<boolean>(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState<StreamingMessage | null>(null);

  // Refs for tracking
  const lastKnownConversationIdRef = useRef<string | null>(null);

  // Update active conversation when pathname changes
  useEffect(() => {
    const pathConvId = getConversationIdFromPath();
    if (pathConvId && pathConvId !== activeConversationId) {
      console.log(`[AIChatContext] Updating conversation ID from path: ${pathConvId}`);
      setActiveConversationId(pathConvId);
      lastKnownConversationIdRef.current = pathConvId;
    }
  }, [pathname, activeConversationId, getConversationIdFromPath]);

  // Clear streaming when conversation changes
  useEffect(() => {
    if (activeConversationId && activeConversationId !== 'new-chat') {
      setStreamedText("");
      setCurrentStreamingMessage(null);
      setIsStreaming(false);
      setIsWaitingForRealId(false);
    }
  }, [activeConversationId]);

  // WebSocket event handlers with proper typing
  useEffect(() => {
    const handleChunk = (evt: EventTypeMap["ai_chat_chunk"]) => {
      // Capture real ID when it arrives
      if (evt.conversationId && evt.conversationId !== 'new-chat') {
        if (lastKnownConversationIdRef.current === 'new-chat' || isWaitingForRealId) {
          console.log(`[AIChatContext] Received real conversation ID: ${evt.conversationId}`);
          lastKnownConversationIdRef.current = evt.conversationId;
          setActiveConversationId(evt.conversationId);
          setIsWaitingForRealId(false);
        }
      }

      if (evt.title) {
        setTitle(evt.title);
      }

      setStreamedText(prev => prev + evt.chunk);
      setIsStreaming(true);
      setIsComplete(false);

      // Update streaming message
      setCurrentStreamingMessage({
        id: `stream-${evt.conversationId}`,
        content: streamedText + evt.chunk,
        provider: evt.provider ?? selectedModel.provider,
        model: evt.model ?? selectedModel.modelId,
        timestamp: new Date(Date.now()),
        isUser: false
      });
    };

    const handleError = (evt: EventTypeMap["ai_chat_error"]) => {
      console.error(`[AIChatContext] Chat error: ${evt.message}`);
      setError(evt.message);
      setIsStreaming(false);
      setIsComplete(true);
      setIsWaitingForRealId(false);
      setCurrentStreamingMessage(null);

      // Clear active stream
      if (userId) {
        activeUserStreams.delete(userId);
      }
    };

    const handleResponse = (evt: EventTypeMap["ai_chat_response"]) => {
      setIsComplete(evt.done);
      if (evt.done) {
        setIsStreaming(false);
        setIsWaitingForRealId(false);
        setCurrentStreamingMessage(null);

        // Clear active stream
        if (userId) {
          activeUserStreams.delete(userId);
        }
      }
    };

    // Subscribe to events with properly typed handlers
    client.on("ai_chat_chunk", handleChunk);
    client.on("ai_chat_error", handleError);
    client.on("ai_chat_response", handleResponse);

    return () => {
      client.off("ai_chat_chunk")
      client.off("ai_chat_error");
      client.off("ai_chat_response");
    };
  }, [client, streamedText, userId, isWaitingForRealId, selectedModel]);

  const sendChat = useCallback((prompt: string) => {
    if (!userId) {
      console.warn("[AIChatContext] Cannot send chat without userId");
      return;
    }

    // Prevent duplicate sends
    if (activeUserStreams.has(userId)) {
      console.warn(`[AIChatContext] User ${userId} already has an active stream`);
      return;
    }

    // CRITICAL: Use the active conversation ID from state/pathname
    const conversationId = activeConversationId ?? 'new-chat';

    // Get API key configuration from context
    const hasProviderConfigured = apiKeys.isSet[selectedModel.provider];
    const isDefaultProvider = apiKeys.isDefault[selectedModel.provider];

    console.log(`[AIChatContext] Sending chat with conversationId: ${conversationId}`);
    console.log(`[AIChatContext] Using model: ${selectedModel.displayName} (${selectedModel.modelId})`);
    console.log(`[AIChatContext] API key configured: ${hasProviderConfigured}, is default: ${isDefaultProvider}`);

    // Mark user as having active stream
    activeUserStreams.add(userId);

    // Reset state for new message
    setStreamedText("");
    setError(null);
    setIsComplete(false);
    setIsStreaming(true);
    setCurrentStreamingMessage(null);

    if (conversationId === 'new-chat') {
      setIsWaitingForRealId(true);
    }

    sendEvent("ai_chat_request", {
      type: "ai_chat_request",
      conversationId,
      prompt,
      provider: selectedModel.provider,
      model: getModel(selectedModel.provider, selectedModel.modelId as AllModelsUnion),
      hasProviderConfigured,
      isDefaultProvider,
      maxTokens: undefined,
      systemPrompt: undefined,
      temperature: undefined,
      topP: undefined
    });
  }, [sendEvent, userId, activeConversationId, selectedModel, apiKeys]);

  const setActiveConversation = useCallback((id: string) => {
    console.log(`[AIChatContext] Manually setting active conversation: ${id}`);
    setActiveConversationId(id);
    lastKnownConversationIdRef.current = id;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const resetStreamingState = useCallback(() => {
    setStreamedText("");
    setCurrentStreamingMessage(null);
    setIsStreaming(false);
    setIsComplete(false);
    setError(null);
  }, []);

  return (
    <AIChatContext.Provider value={{
      activeConversationId,
      title,
      streamedText,
      isStreaming,
      isComplete,
      error,
      currentStreamingMessage,
      sendChat,
      setActiveConversation,
      clearError,
      resetStreamingState,
      isWaitingForRealId,
      isConnected
    }}>
      {children}
    </AIChatContext.Provider>
  );
}

export function useAIChatContext() {
  const context = useContext(AIChatContext);
  if (!context) {
    throw new Error("useAIChatContext must be used within AIChatProvider");
  }
  return context;
}

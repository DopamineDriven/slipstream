// src/context/ai-chat-context.tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
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
import type { AIChatRequestUserMetadata } from "@t3-chat-clone/types/events";

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

  // Actions
  sendChat: (prompt: string) => void;
  setActiveConversationId: (id: string | null) => void;
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
  const router = useRouter();
  const pathname = usePathname();
  const { client, isConnected, sendEvent } = useChatWebSocketContext();
  const { selectedModel } = useModelSelection();
  const { apiKeys } = useApiKeys();

  // Parse conversation ID from pathname
  const getConversationIdFromPath = useCallback((): string | null => {
    const parsed = pathParser(pathname);
    return parsed.conversationId ?? null;
  }, [pathname]);

  // Core state - initialize from path
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(getConversationIdFromPath());
  const [title, setTitle] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isWaitingForRealId, setIsWaitingForRealId] = useState<boolean>(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] =
    useState<StreamingMessage | null>(null);

  // Track if we've updated the URL for this stream
  const urlUpdatedRef = useRef<boolean>(false);
  const firstChunkReceivedRef = useRef<boolean>(false);
  const originalConversationIdRef = useRef<string | null>(activeConversationId);

  // Initialize and sync active conversation from pathname
  // This is passive - only reads from the URL, never manipulates it
  // Router manipulation only happens during new-chat → real ID transitions
  useEffect(() => {
    // Skip during streaming or URL transitions
    if (isStreaming || urlUpdatedRef.current) {
      return;
    }

    const pathConvId = getConversationIdFromPath();

    // Only update if we have a valid path conversation ID and it's different
    if (pathConvId && pathConvId !== activeConversationId) {
      console.log(
        `[AIChatContext] Updating conversation ID from path: ${pathConvId}`
      );
      setActiveConversationId(pathConvId);
      originalConversationIdRef.current = pathConvId;

      // Reset streaming state when navigating to a different conversation
      setStreamedText("");
      setCurrentStreamingMessage(null);
      setIsWaitingForRealId(false);
      firstChunkReceivedRef.current = false;
    }
  }, [pathname, activeConversationId, getConversationIdFromPath, isStreaming]);

  // WebSocket event handlers
  useEffect(() => {
    const handleChunk = (evt: EventTypeMap["ai_chat_chunk"]) => {
      // Handle first chunk with real conversation ID for new-chat transitions
      if (
        !firstChunkReceivedRef.current &&
        evt.conversationId &&
        evt.conversationId !== "new-chat" &&
        originalConversationIdRef.current === "new-chat" &&
        isWaitingForRealId
      ) {
        console.log(
          `[AIChatContext] First chunk received with real ID: ${evt.conversationId}`
        );
        firstChunkReceivedRef.current = true;

        // Update window.history immediately to show real URL
        window.history.replaceState(null, "", `/chat/${evt.conversationId}`);
        urlUpdatedRef.current = true;

        // Update active conversation ID to the real one from the event
        setActiveConversationId(evt.conversationId);
        setIsWaitingForRealId(false);
      }

      if (evt.title) {
        setTitle(evt.title);
      }

      setStreamedText(prev => prev + evt.chunk);
      setIsStreaming(true);
      setIsComplete(false);

      // Update streaming message with conversationId from event
      setCurrentStreamingMessage({
        id: `stream-${evt.conversationId}`,
        content: streamedText + evt.chunk,
        provider: evt.provider ?? selectedModel.provider,
        model: evt.model ?? selectedModel.modelId,
        timestamp: new Date(),
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

      // Update active conversation ID to match the event
      if (evt.conversationId !== activeConversationId) {
        setActiveConversationId(evt.conversationId);
      }

      // Clear active stream
      if (userId) {
        activeUserStreams.delete(userId);
      }

      // Sync React Router only for new-chat transitions
      // For existing chats, we never manipulate the router
      if (
        urlUpdatedRef.current ||
        (originalConversationIdRef.current === "new-chat" &&
          evt.conversationId !== "new-chat")
      ) {
        console.log(
          `[AIChatContext] Error occurred, syncing router to: /chat/${evt.conversationId}`
        );
        router.replace(`/chat/${evt.conversationId}`, { scroll: false });
        urlUpdatedRef.current = false;
      }

      firstChunkReceivedRef.current = false;
    };

    const handleResponse = (evt: EventTypeMap["ai_chat_response"]) => {
      setIsComplete(evt.done);
      if (evt.done) {
        console.log("[AIChatContext] Stream completed");
        setIsStreaming(false);
        setIsWaitingForRealId(false);
        setCurrentStreamingMessage(null);

        // Update active conversation ID to match the event
        if (evt.conversationId !== activeConversationId) {
          setActiveConversationId(evt.conversationId);
        }

        // Clear active stream
        if (userId) {
          activeUserStreams.delete(userId);
        }

        // Sync React Router only for new-chat transitions
        // For existing chats, we never manipulate the router
        if (
          urlUpdatedRef.current ||
          (originalConversationIdRef.current === "new-chat" &&
            evt.conversationId !== "new-chat")
        ) {
          console.log(
            `[AIChatContext] Stream complete, syncing router to: /chat/${evt.conversationId}`
          );
          router.replace(`/chat/${evt.conversationId}`, { scroll: false });
          urlUpdatedRef.current = false;
        }

        firstChunkReceivedRef.current = false;
      }
    };

    // Subscribe to events
    client.on("ai_chat_chunk", handleChunk);
    client.on("ai_chat_error", handleError);
    client.on("ai_chat_response", handleResponse);

    return () => {
      client.off("ai_chat_chunk");
      client.off("ai_chat_error");
      client.off("ai_chat_response");
    };
  }, [
    client,
    streamedText,
    userId,
    isWaitingForRealId,
    selectedModel,
    activeConversationId,
    router
  ]);

  const { getAll } = useCookiesCtx();
  const metadata = useMemo(() => {
    const { city, country, latlng, postalCode, region, tz } = getAll();

    const [lat, lng] = latlng
      ? latlng.split(",").map(p => {
          return Number.parseFloat(p);
        })
      : [undefined, undefined];
    return {
      city,
      country,
      postalCode,
      region,
      tz,
      lat,
      lng
    } satisfies AIChatRequestUserMetadata;
  }, [getAll]);
  const sendChat = useCallback(
    (prompt: string) => {
      if (!userId) {
        console.warn("[AIChatContext] Cannot send chat without userId");
        return;
      }

      // Prevent duplicate sends
      if (activeUserStreams.has(userId)) {
        console.warn(
          `[AIChatContext] User ${userId} already has an active stream`
        );
        return;
      }

      // Use the active conversation ID
      const conversationId = activeConversationId ?? "new-chat";

      // Get API key configuration
      const hasProviderConfigured = apiKeys.isSet[selectedModel.provider];
      const isDefaultProvider = apiKeys.isDefault[selectedModel.provider];

      console.log(
        `[AIChatContext] Sending chat with conversationId: ${conversationId}`
      );
      console.log(
        `[AIChatContext] Using model: ${selectedModel.displayName} (${selectedModel.modelId})`
      );

      // Mark user as having active stream
      activeUserStreams.add(userId);

      // Reset state for new message
      setStreamedText("");
      setError(null);
      setIsComplete(false);
      setIsStreaming(true);
      setCurrentStreamingMessage(null);
      urlUpdatedRef.current = false;
      firstChunkReceivedRef.current = false;

      if (conversationId === "new-chat") {
        setIsWaitingForRealId(true);
        originalConversationIdRef.current = "new-chat";
      }

      sendEvent("ai_chat_request", {
        metadata,
        type: "ai_chat_request",
        conversationId,
        prompt,
        provider: selectedModel.provider,
        model: getModel(
          selectedModel.provider,
          selectedModel.modelId as AllModelsUnion
        ),
        hasProviderConfigured,
        isDefaultProvider,
        maxTokens: undefined,
        systemPrompt: undefined,
        temperature: undefined,
        topP: undefined
      });
    },
    [sendEvent, metadata, userId, activeConversationId, selectedModel, apiKeys]
  );

  const clearError = useCallback(() => setError(null), []);

  const resetStreamingState = useCallback(() => {
    setStreamedText("");
    setCurrentStreamingMessage(null);
    setIsStreaming(false);
    setIsComplete(false);
    setError(null);
  }, []);

  return (
    <AIChatContext.Provider
      value={{
        activeConversationId,
        title,
        streamedText,
        isStreaming,
        isComplete,
        error,
        currentStreamingMessage,
        sendChat,
        setActiveConversationId,
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

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

const AIChatContext = createContext<AIChatContextValue | undefined>(undefined);

// Active user streams tracking (prevents duplicate sends)
const activeUserStreams = new Set<string>();

// Helper to check if provider supports thinking
const _supportsThinking = (provider: Provider): boolean => {
  return provider === "anthropic" || provider === "gemini";
};

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

  // Thinking state
  const [thinkingText, setThinkingText] = useState<string>("");
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [thinkingDuration, setThinkingDuration] = useState<number | null>(null);

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
      setThinkingText("");
      setIsThinking(false);
      setThinkingDuration(null);
      setCurrentStreamingMessage(null);
      setIsWaitingForRealId(false);
      firstChunkReceivedRef.current = false;
    }
  }, [pathname, activeConversationId, getConversationIdFromPath, isStreaming]);

  // Store refs for state values that need to be accessed in event handlers
  const streamedTextRef = useRef(streamedText);
  const thinkingTextRef = useRef(thinkingText);
  const isThinkingRef = useRef(isThinking);
  const thinkingDurationRef = useRef(thinkingDuration);
  
  // Update refs when state changes
  useEffect(() => {
    streamedTextRef.current = streamedText;
  }, [streamedText]);
  
  useEffect(() => {
    thinkingTextRef.current = thinkingText;
  }, [thinkingText]);
  
  useEffect(() => {
    isThinkingRef.current = isThinking;
  }, [isThinking]);
  
  useEffect(() => {
    thinkingDurationRef.current = thinkingDuration;
  }, [thinkingDuration]);

  // WebSocket event handlers - only depend on stable references
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

      // Always set isStreaming true when we have conversationId and title
      if (evt.conversationId && evt.title) {
        setIsStreaming(true);
      }

      // Handle thinking chunks differently
      if (evt.isThinking && evt.thinkingText) {
        setThinkingText(prev => prev + evt.thinkingText);
        setIsThinking(true);
        setThinkingDuration(evt.thinkingDuration ?? null);
      } else if (evt.chunk) {
        // Regular chunk - if we were thinking, we're done now
        if (isThinkingRef.current) {
          setIsThinking(false);
          // Capture thinking duration if provided
          if (evt.thinkingDuration) {
            setThinkingDuration(evt.thinkingDuration);
          }
        }
        setStreamedText(prev => prev + evt.chunk);
      }

      // Always update thinking duration if provided
      // This handles both initial capture and updates during streaming
      if (evt.thinkingDuration) {
        setThinkingDuration(evt.thinkingDuration);
      }

      setIsComplete(false);

      // Update streaming message with all relevant data using refs
      setCurrentStreamingMessage({
        id: `stream-${evt.conversationId}`,
        content: streamedTextRef.current + (evt.chunk ?? ""),
        thinkingText: thinkingTextRef.current + (evt.thinkingText ?? ""),
        thinkingDuration: evt.thinkingDuration ?? thinkingDurationRef.current ?? undefined,
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
        setIsThinking(false);
        setIsWaitingForRealId(false);

        // Capture final thinking duration if provided
        if (evt.thinkingDuration) {
          setThinkingDuration(evt.thinkingDuration);
        }

        if (evt.thinkingText) {
          setThinkingText(evt.thinkingText);
        }

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
    userId,
    isWaitingForRealId,
    selectedModel,
    activeConversationId,
    router
  ]);

  // Track recently sent messages to prevent duplicates
  const recentMessagesRef = useRef<Map<string, number>>(new Map());
  
  const { getAll } = useCookiesCtx();
  const metadata = useMemo(() => {
    const { city, country, latlng, postalCode, region, tz, locale } = getAll();

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
      lng,
      locale
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
      
      // Check for duplicate messages sent within 500ms
      const messageKey = `${userId}-${prompt}`;
      const now = Date.now();
      const lastSentTime = recentMessagesRef.current.get(messageKey);
      
      if (lastSentTime && now - lastSentTime < 500) {
        console.warn(
          `[AIChatContext] Duplicate message detected, skipping: "${prompt.substring(0, 50)}..."`
        );
        return;
      }
      
      // Track this message
      recentMessagesRef.current.set(messageKey, now);
      
      // Clean up old entries after 2 seconds
      setTimeout(() => {
        recentMessagesRef.current.delete(messageKey);
      }, 2000);

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
      console.log(
        `[AIChatContext] Message content: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`
      );
      console.log(
        `[AIChatContext] Message length: ${prompt.length} characters`
      );

      // Mark user as having active stream
      activeUserStreams.add(userId);

      // Reset state for new message
      setStreamedText("");
      setThinkingText("");
      setIsThinking(false);
      setThinkingDuration(null);
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
    setThinkingText("");
    setIsThinking(false);
    setThinkingDuration(null);
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
        thinkingText,
        isThinking,
        thinkingDuration,
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

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
import { useAssetUpload } from "@/context/asset-context";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import { useCookiesCtx } from "@/context/cookie-context";
import { useModelSelection } from "@/context/model-selection-context";
import { getModel } from "@/lib/get-model";
import { pathParser } from "@/lib/path-parser";
import type {
  AIChatRequest,
  AIChatRequestImgGenFields,
  UserMetadata as AIChatRequestUserMetadata,
  AIChatResponseImgGenFieldsFinal,
  AllModelsUnion,
  EventTypeMap,
  Provider
} from "@slipstream/types";

interface StreamingMessage {
  id: string;
  content: string;
  provider: Provider;
  model: string;
  timestamp: Date;
  isUser: boolean;
  thinkingText?: string;
  thinkingDuration?: number;
  imgGenEnabled?: boolean;
  imgGenFields?: AIChatResponseImgGenFieldsFinal | null;
  userMsgId?: string;
  aiMsgId?: string;
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
  currentUserMsgId: string | null;
  currentAiMsgId: string | null;

  // Actions
  // Optionally accept an explicit batchId to associate attachments deterministically
  sendChat: (
    prompt: string,
    explicitBatchId?: string,
    imgGenEnabled?: boolean,
    imgGenFields?: AIChatRequestImgGenFields,
    optimisticUserMsgId?: string
  ) => void;
  setActiveConversationId: (id: string | null) => void;
  clearError: () => void;
  resetStreamingState: () => void;

  // Status flags
  isWaitingForRealId: boolean;
  isConnected: boolean;

  // Live image generation (progressive) state - complete server shape
  imgGenEnabled: boolean;
  imgGenFields: AIChatResponseImgGenFieldsFinal | null;
}

const AIChatContext = createContext<AIChatContextValue | undefined>(undefined);

// Note: Track active user streams within the provider to avoid module-scope writes

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
  const { startNewBatch, currentBatchId, getUploadsByBatchId } =
    useAssetUpload();

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

  // Live image-gen progressive state
  const [imgGenEnabled, setImgGenEnabled] = useState<boolean>(false);
  const [imgGenFields, setImgGenFields] =
    useState<AIChatResponseImgGenFieldsFinal | null>(null);

  // Message ID tracking
  const [currentUserMsgId, setCurrentUserMsgId] = useState<string | null>(null);
  const [currentAiMsgId, setCurrentAiMsgId] = useState<string | null>(null);

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
      // eslint-disable-next-line
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
  const isStreamingRef = useRef(isStreaming);
  const titleRef = useRef<string | null>(null);
  const activeUserStreamsRef = useRef<Set<string>>(new Set());
  const imgGenEnabledRef = useRef(imgGenEnabled);
  const imgGenFieldsRef = useRef(imgGenFields);
  const currentUserMsgIdRef = useRef<string | null>(null);
  const currentAiMsgIdRef = useRef<string | null>(null);

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

  // Mirror isStreaming in a ref to avoid redundant setState in handlers
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Keep a ref of the latest title to avoid redundant updates in handlers
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  // Keep refs for imgGen state
  useEffect(() => {
    imgGenEnabledRef.current = imgGenEnabled;
  }, [imgGenEnabled]);

  useEffect(() => {
    imgGenFieldsRef.current = imgGenFields;
  }, [imgGenFields]);

  // Keep refs for message ID state
  useEffect(() => {
    currentUserMsgIdRef.current = currentUserMsgId;
  }, [currentUserMsgId]);

  useEffect(() => {
    currentAiMsgIdRef.current = currentAiMsgId;
  }, [currentAiMsgId]);

  // Stable helper to update title state only when changed
  const updateTitle = useCallback((nextTitle?: string | null) => {
    if (!nextTitle) return;
    if (titleRef.current === nextTitle) return;
    setTitle(nextTitle);
  }, []);

  // Reflect title state into the DOM in an effect (React Compiler-friendly)
  useEffect(() => {
    if (!title) return;
    if (typeof window !== "undefined") {
      window.document.title = title;
    }
  }, [title]);

  // WebSocket event handlers - only depend on stable references
  useEffect(() => {
    const handleChunk = (evt: EventTypeMap["ai_chat_chunk"]) => {
      // Capture message IDs from the event, only update if different
      if (evt.userMsgId && currentUserMsgIdRef.current !== evt.userMsgId) {
        setCurrentUserMsgId(evt.userMsgId);
      }
      if (evt.aiMsgId && currentAiMsgIdRef.current !== evt.aiMsgId) {
        setCurrentAiMsgId(evt.aiMsgId);
      }

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

      // Update title only if it actually changed
      updateTitle(evt.title ?? null);

      // Mark streaming only once per session to avoid redundant updates
      if (evt.conversationId && evt.title && !isStreamingRef.current) {
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

      // Image generation progressive updates - accumulate the complete fields
      if (evt.imgGenEnabled) {
        setImgGenEnabled(evt.imgGenEnabled);
      }
      if (evt.imgGenFields) {
        setImgGenEnabled(true);
        console.log(evt.imgGenFields);
            if (!firstChunkReceivedRef.current) firstChunkReceivedRef.current = true;
        // Merge new fields with existing, preserving all partial images
        setImgGenFields(prev => ({
          ...prev,
          ...evt.imgGenFields,
          // Accumulate partial images array if it exists
          partialImages: evt.imgGenFields?.partialImages ?? prev?.partialImages
        }));
      }

      // Update streaming message with all relevant data using refs
      // Keep the streaming ID pattern during active streaming
      setCurrentStreamingMessage({
        id: `streaming-${evt.conversationId}`,
        content: streamedTextRef.current + (evt.chunk ?? ""),
        thinkingText: thinkingTextRef.current + (evt.thinkingText ?? ""),
        thinkingDuration:
          evt.thinkingDuration ?? thinkingDurationRef.current ?? undefined,
        provider: evt.provider ?? selectedModel.provider,
        model: evt.model ?? selectedModel.modelId,
        timestamp: new Date(),
        isUser: false,
        imgGenEnabled: imgGenEnabledRef.current || evt.imgGenEnabled,
        imgGenFields: imgGenFieldsRef.current ?? evt.imgGenFields,
        userMsgId: evt.userMsgId ?? currentUserMsgIdRef.current ?? undefined,
        aiMsgId: undefined // Don't pass aiMsgId during streaming chunks
      });
    };

    const handleError = (evt: EventTypeMap["ai_chat_error"]) => {
      // Capture message IDs from the event, only update if different
      if (evt.userMsgId && currentUserMsgIdRef.current !== evt.userMsgId) {
        setCurrentUserMsgId(evt.userMsgId);
      }
      if (evt.aiMsgId && currentAiMsgIdRef.current !== evt.aiMsgId) {
        setCurrentAiMsgId(evt.aiMsgId);
      }

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
        activeUserStreamsRef.current.delete(userId);
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
      // Capture message IDs from the event, only update if different
      if (evt.userMsgId && currentUserMsgIdRef.current !== evt.userMsgId) {
        setCurrentUserMsgId(evt.userMsgId);
      }
      // aiMsgId should always be defined in ai_chat_response
      if (evt.aiMsgId && currentAiMsgIdRef.current !== evt.aiMsgId) {
        setCurrentAiMsgId(evt.aiMsgId);
      }

      // Image generation final response - complete fields with final images
      if (evt.imgGenEnabled) {
        setImgGenEnabled(true);
        if (evt.imgGenFields) {
          // Set the complete final fields, including all images
          setImgGenFields(evt.imgGenFields);
        }
      }
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
          activeUserStreamsRef.current.delete(userId);
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
    router,
    updateTitle
  ]);

  // Track recently sent messages to prevent duplicates
  const recentMessagesRef = useRef<Map<string, number>>(new Map());

  const { getAll } = useCookiesCtx();
  const { city, country, latlng, postalCode, region, tz, locale } = getAll(); // already wrapped in a useCallback
  const metadata = useMemo(() => {
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
  }, [city, country, latlng, postalCode, region, tz, locale]);

  const sendChat = useCallback(
    (
      prompt: string,
      explicitBatchId?: string,
      imgGenEnabled?: boolean,
      imgGenFields?: AIChatRequestImgGenFields,
      optimisticUserMsgId?: string
    ) => {
      if (!userId) {
        console.warn("[AIChatContext] Cannot send chat without userId");
        return;
      }

      // Prevent duplicate sends
      if (activeUserStreamsRef.current.has(userId)) {
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

      // Generate or use provided optimistic userMsgId
      const tempUserMsgId = optimisticUserMsgId ?? `user-${Date.now()}-${Math.random()}`;
      setCurrentUserMsgId(tempUserMsgId);

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
        `[AIChatContext] Message content: "${prompt.substring(0, 100)}${prompt.length > 100 ? "..." : ""}"`
      );
      console.log(
        `[AIChatContext] Message length: ${prompt.length} characters`
      );

      // Mark user as having active stream
      activeUserStreamsRef.current.add(userId);

      // Reset state for new message
      setStreamedText("");
      setThinkingText("");
      setIsThinking(false);
      setThinkingDuration(null);
      setError(null);
      setImgGenEnabled(false);
      setImgGenFields(null);
      setIsComplete(false);
      setIsStreaming(true);
      setCurrentStreamingMessage(null);
      urlUpdatedRef.current = false;
      firstChunkReceivedRef.current = false;

      if (conversationId === "new-chat") {
        setIsWaitingForRealId(true);
        originalConversationIdRef.current = "new-chat";
      }

      // Determine which batchId to send:
      // - Prefer explicit (ChatInput provided because there were attachments)
      // - Otherwise, only include the current batch if it actually has uploads
      let batchIdUsed: string | undefined = explicitBatchId ?? undefined;
      if (!batchIdUsed) {
        const cur = currentBatchId ?? undefined;
        const hasUploads = cur
          ? (getUploadsByBatchId(cur)?.length ?? 0) > 0
          : false;
        batchIdUsed = hasUploads ? cur : undefined;
      }
      // intentionally not logging batchId in production

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
        topP: undefined,
        // Use the explicit batchId from the input when provided so that
        // the message uses the same batch as the registered attachments.
        batchId: batchIdUsed,
        imgGenEnabled,
        imgGenFields: imgGenEnabled === true ? imgGenFields : undefined
      } satisfies AIChatRequest);

      // Immediately rotate to a fresh batch for the NEXT message.
      // This covers all send paths (including initialPrompt/new-chat) so
      // we never accidentally reuse the previous batch for subsequent uploads.
      try {
        startNewBatch();
      } catch (err) {
        console.log(err);
      }
    },
    [
      sendEvent,
      metadata,
      userId,
      activeConversationId,
      selectedModel,
      apiKeys,
      startNewBatch,
      currentBatchId,
      getUploadsByBatchId
    ]
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
    // Reset image generation state
    setImgGenEnabled(false);
    setImgGenFields(null);
    // Reset message IDs
    setCurrentUserMsgId(null);
    setCurrentAiMsgId(null);
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
        currentUserMsgId,
        currentAiMsgId,
        sendChat,
        setActiveConversationId,
        clearError,
        resetStreamingState,
        isWaitingForRealId,
        isConnected,
        imgGenEnabled,
        imgGenFields
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

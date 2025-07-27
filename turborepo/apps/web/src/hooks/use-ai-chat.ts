// src/hooks/use-ai-chat.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageHandler } from "@/types/chat-ws";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import { getModel } from "@/lib/get-model";
import { AllModelsUnion, Provider } from "@t3-chat-clone/types";

const activeUserStreams = new Set<string>();

export function useAiChat(userId?: string, initialConversationId?: string) {
  const { client, isConnected, sendEvent } = useChatWebSocketContext();
  const [streamedText, setStreamedText] = useState<string>("");
  const [title, setTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [liveConversationId, setLiveConversationId] = useState<string | null>(
    initialConversationId ?? null
  );
  const [isWaitingForRealId, setIsWaitingForRealId] = useState<boolean>(false);

  // Keep the "current" conversationId in a ref so we don't force
  // sendChat to depend on it
  const conversationIdRef = useRef<string | null>(initialConversationId ?? null);

  // Update the ref when initialConversationId changes (e.g., navigation)
  useEffect(() => {
    if (initialConversationId) {
      conversationIdRef.current = initialConversationId;
      setLiveConversationId(initialConversationId);
    }
  }, [initialConversationId]);

  // When the stream ends, allow a new sendChat for this user
  useEffect(() => {
    if (isComplete && userId) {
      activeUserStreams.delete(userId);
      setIsWaitingForRealId(false); // Ensure flag is cleared
    }
  }, [isComplete, userId]);

  // 1️⃣ Subscribe with **named** handlers, so we can clean them up by reference
  useEffect(() => {
    const onChunk: MessageHandler<"ai_chat_chunk"> = (evt) => {
      // capture the real ID once it arrives
      if (evt.conversationId && conversationIdRef.current !== evt.conversationId) {
        console.log(`[useAiChat] Received real conversation ID: ${evt.conversationId} (was: ${conversationIdRef.current})`);
        conversationIdRef.current = evt.conversationId;
        setLiveConversationId(evt.conversationId);
        setIsWaitingForRealId(false); // Clear the waiting flag
      }
      setTitle((t) => t ?? evt.title ?? null);
      setIsComplete(false);
      setStreamedText((txt) => txt + evt.chunk);
    };

    const onInline: MessageHandler<"ai_chat_inline_data"> = (evt) => {
      console.info("inline data:", evt.data);
    };

    const onError: MessageHandler<"ai_chat_error"> = (evt) => {
      setError(evt.message);
      setIsComplete(true);
      setIsWaitingForRealId(false); // Clear waiting flag on error
    };

    const onResponse: MessageHandler<"ai_chat_response"> = (evt) => {
      // you might prefer evt.chunk or streamedText here
      setMessages((ms) => [...ms, evt.chunk]);
      setIsComplete(evt.done);
      if (evt.done) {
        setIsWaitingForRealId(false); // Clear waiting flag when complete
      }
    };

    client.on("ai_chat_chunk", onChunk);
    client.on("ai_chat_inline_data", onInline);
    client.on("ai_chat_error", onError);
    client.on("ai_chat_response", onResponse);

    return () => {
      client.off("ai_chat_chunk");
      client.off("ai_chat_inline_data");
      client.off("ai_chat_error");
      client.off("ai_chat_response");
    };
  }, [client]);

  // 2️⃣ sendChat now accepts an optional conversationId parameter
  const sendChat = useCallback(
    (
      prompt: string,
      provider?: Provider,
      model?: AllModelsUnion,
      hasProviderConfigured?: boolean,
      isDefaultProvider?: boolean,
      conversationId?: string // Optional parameter to override the current conversation
    ) => {
      if (!userId) {
        console.warn("sendChat called without a userId.");
        return;
      }
      if (activeUserStreams.has(userId)) {
        console.warn(
          `Request ignored: User ${userId} already has an active stream.`
        );
        return;
      }

      activeUserStreams.add(userId);
      setStreamedText("");
      setError(null);
      setIsComplete(false);

      // Use the provided conversationId, or fall back to the ref, or default to "new-chat"
      const effectiveConversationId = conversationId ?? conversationIdRef.current ?? "new-chat";

      // Log what's happening for debugging
      console.log(`[useAiChat.sendChat] Current ref: ${conversationIdRef.current}, Provided: ${conversationId}, Using: ${effectiveConversationId}`);

      // CRITICAL: If we're already streaming a new-chat and receive another send with the same prompt,
      // ignore it to prevent duplicates
      if (effectiveConversationId === "new-chat" && (streamedText || isWaitingForRealId)) {
        console.warn("Ignoring duplicate new-chat send while streaming is active or waiting for real ID");
        activeUserStreams.delete(userId);
        return;
      }

      // IMPORTANT: Don't allow sending to "new-chat" if we already have a real conversation ID
      if (effectiveConversationId === "new-chat" && liveConversationId && liveConversationId !== "new-chat") {
        console.warn(`[useAiChat.sendChat] Attempted to send to new-chat but already have real ID: ${liveConversationId}`);
        conversationIdRef.current = liveConversationId;

        // Retry with the real conversation ID
        sendEvent("ai_chat_request", {
          type: "ai_chat_request",
          conversationId: liveConversationId,
          prompt,
          provider: provider ?? "openai",
          model: getModel(
            provider ?? "openai",
            model as AllModelsUnion | undefined
          ),
          hasProviderConfigured: hasProviderConfigured ?? false,
          isDefaultProvider: isDefaultProvider ?? false,
          maxTokens: undefined,
          systemPrompt: undefined,
          temperature: undefined,
          topP: undefined
        });
        return;
      }

      // Set waiting flag if this is a new-chat request
      if (effectiveConversationId === "new-chat") {
        setIsWaitingForRealId(true);
      }

      // Update the ref if a new conversationId was provided
      if (conversationId && conversationId !== conversationIdRef.current) {
        conversationIdRef.current = conversationId;
        setLiveConversationId(conversationId);
      }

      console.log(`[useAiChat] Sending chat request with conversationId: ${effectiveConversationId}`);

      sendEvent("ai_chat_request", {
        type: "ai_chat_request",
        conversationId: effectiveConversationId,
        prompt,
        provider: provider ?? "openai",
        model: getModel(
          provider ?? "openai",
          model as AllModelsUnion | undefined
        ),
        hasProviderConfigured: hasProviderConfigured ?? false,
        isDefaultProvider: isDefaultProvider ?? false,
        maxTokens: undefined,
        systemPrompt: undefined,
        temperature: undefined,
        topP: undefined
      });
    },
    [sendEvent, userId, streamedText, isWaitingForRealId, liveConversationId]
  );

  // 3️⃣ Add a method to manually update the conversation ID (useful for navigation)
  const updateConversationId = useCallback((newConversationId: string) => {
    conversationIdRef.current = newConversationId;
    setLiveConversationId(newConversationId);
  }, []);

  return {
    isConnected,
    conversationId: liveConversationId,
    title,
    streamedText,
    messages,
    error,
    isComplete,
    sendChat,
    updateConversationId,
    isWaitingForRealId
  };
}

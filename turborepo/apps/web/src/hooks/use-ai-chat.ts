"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MessageHandler
} from "@/types/chat-ws";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import { getModel } from "@/lib/get-model";
import { AllModelsUnion, Provider } from "@t3-chat-clone/types";
const activeUserStreams = new Set<string>();
export function useAiChat(userId?: string) {
  const { client, isConnected, sendEvent } = useChatWebSocketContext();
  const [streamedText, setStreamedText] = useState<string>("");
  const [title, setTitle] = useState<string | null>(null);

  const [messages, setMessages] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);

  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [liveConversationId, setLiveConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (isComplete && userId) {
      activeUserStreams.delete(userId);
    }
  }, [isComplete, userId]);
  useEffect(() => {
    const onChunk: MessageHandler<"ai_chat_chunk"> = evt => {
          if (evt.conversationId && conversationIdRef.current !== evt.conversationId) {
        conversationIdRef.current = evt.conversationId;
        setLiveConversationId(evt.conversationId);
      }
      setTitle(prev => prev ?? evt.title ?? null);
      setIsComplete(false);
      setStreamedText(txt => txt + evt.chunk);
    };

    const onInline: MessageHandler<"ai_chat_inline_data"> = evt => {
      console.info("inline data:", evt.data);
    };

    const onError: MessageHandler<"ai_chat_error"> = evt => {
      setError(evt.message);
      setIsComplete(true);
    };

    const onResponse: MessageHandler<"ai_chat_response"> = evt => {
      // you might push the fully-streamedText into history…
      setMessages(ms => [...ms, evt.chunk]);
      setIsComplete(evt.done);
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

  const sendChat = useCallback(
    (
      prompt: string,
      provider?: Provider,
      model?: AllModelsUnion,
      hasProviderConfigured?: boolean,
      isDefaultProvider?: boolean
    ) => {
            if (!userId) {
        console.warn("sendChat called without a userId.");
        return;
      }
      if (activeUserStreams.has(userId)) {
        console.warn(`Request ignored: User ${userId} already has an active stream.`);
        return; // Omit the request entirely
      }

      try {
        activeUserStreams.add(userId);
        setStreamedText("");
        setError(null);
        setIsComplete(false);
      } catch (err) {
        console.warn(`error in the sendChat useCallback`, err);
      } finally {
        if (conversationIdRef.current ==null || conversationIdRef.current === "new-chat") {
          conversationIdRef.current = "new-chat";
        }
        conversationIdRef.current;
        sendEvent("ai_chat_request", {
          type: "ai_chat_request",
          conversationId: conversationIdRef.current,
          prompt,
          provider: provider ?? "openai",
          model: getModel(provider ?? "openai", model as AllModelsUnion | undefined),
          hasProviderConfigured: hasProviderConfigured ?? false,
          isDefaultProvider: isDefaultProvider ?? false,
          maxTokens: undefined,
          systemPrompt: undefined,
          temperature: undefined,
          topP: undefined
        });
      }
    },
    [sendEvent, userId]
  );

  return {
    isConnected,
    conversationId: liveConversationId,
    title,
    streamedText,
    messages,
    error,
    isComplete,
    sendChat
  };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  MessageHandler,
  ModelProvider,
  SelectedProvider
} from "@/types/chat-ws";
import { useChatWebSocketContext } from "@/context/chat-ws-context";

export function useAiChat() {
  const { client, isConnected, sendEvent } = useChatWebSocketContext();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState<string>("");

  const [messages, setMessages] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);

  const [isComplete, setIsComplete] = useState<boolean>(false);

  useEffect(() => {
    const onChunk: MessageHandler<"ai_chat_chunk"> = evt => {
      setConversationId(id => id ?? evt.conversationId);
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

    const onResponse: MessageHandler<"ai_chat_response"> = _evt => {
      // you might push the fully-streamedText into history…
      setMessages(ms => [...ms, streamedText]);
      setIsComplete(true);
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
  }, [client, streamedText]);

  const sendChat = useCallback(
    (
      prompt: string,
      provider?: ModelProvider,
      model?: SelectedProvider<typeof provider>,
      apiKey?: string
    ) => {
      try {
        setStreamedText("");
        setError(null);
        setIsComplete(false);
      } catch (err) {
        console.warn(`error in the sendChat useCallback`, err);
      } finally {
        sendEvent("ai_chat_request", {
          type: "ai_chat_request",
          conversationId: conversationId ?? "new-chat",
          prompt,
          provider,
          model,
          apiKey
        });
      }
    },
    [conversationId, sendEvent]
  );

  return {
    isConnected,
    streamedText,
    messages,
    error,
    isComplete,
    sendChat
  };
}

"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathnameContext } from "@/context/pathname-context";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import type { EventTypeMap } from "@slipstream/types";

interface ConversationIdContextValue {
  conversationId: string | null;
  isWaitingForRealId: boolean;
}

const ConversationIdContext = createContext<ConversationIdContextValue | null>(
  null
);

export function ConversationIdProvider({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const { conversationId: pathConvId } = usePathnameContext();
  const { client } = useChatWebSocketContext();

  // Overrides pathConvId during streaming when the real ID is known
  const [overrideConvId, setOverrideConvId] = useState<string | null>(null);
  const [isWaitingForRealId, setIsWaitingForRealId] = useState(false);

  useEffect(() => {
    const handleRequest = (evt: EventTypeMap["ai_chat_request"]) => {
      if (evt.conversationId === "new-chat") {
        setIsWaitingForRealId(true);
        // clear any prior override when starting a new chat
        setOverrideConvId(null);
      } else {
        // existing chat send; ensure we reflect that id
        setOverrideConvId(null);
        setIsWaitingForRealId(false);
      }
    };

    const handleChunk = (evt: EventTypeMap["ai_chat_chunk"]) => {
      if (
        isWaitingForRealId &&
        evt.conversationId &&
        evt.conversationId !== "new-chat"
      ) {
        setOverrideConvId(evt.conversationId);
        // keep router dark: we do not touch next/router here
      }
    };

    const handleResponse = (evt: EventTypeMap["ai_chat_response"]) => {
      if (evt.done) {
        setIsWaitingForRealId(false);
        // Allow router to catch up via PathnameSync; no change needed here.
      }
    };

    const handleError = (_evt: EventTypeMap["ai_chat_error"]) => {
      setIsWaitingForRealId(false);
      // Keep any override if it was already set
    };

    client.on("ai_chat_request", handleRequest);
    client.on("ai_chat_chunk", handleChunk);
    client.on("ai_chat_response", handleResponse);
    client.on("ai_chat_error", handleError);

    return () => {
      client.off("ai_chat_request");
      client.off("ai_chat_chunk");
      client.off("ai_chat_response");
      client.off("ai_chat_error");
    };
  }, [client, isWaitingForRealId]);

  // Prefer the override (real ID mid-stream), otherwise router-driven path
  const conversationId = useMemo(
    () => overrideConvId ?? pathConvId ?? "new-chat",
    [overrideConvId, pathConvId]
  );

  const value = useMemo(
    () => ({ conversationId, isWaitingForRealId }) satisfies ConversationIdContextValue,
    [conversationId, isWaitingForRealId]
  );

  return (
    <ConversationIdContext.Provider value={value}>
      {children}
    </ConversationIdContext.Provider>
  );
}

export function useConversationIdContext() {
  const ctx = useContext(ConversationIdContext);
  if (!ctx) {
    throw new Error(
      "useConversationIdContext must be used within ConversationIdProvider"
    );
  }
  return ctx;
}

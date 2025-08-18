// src/ui/chat/dynamic/index.tsx
"use client";

import type { UIMessage } from "@/types/shared";
import type { User } from "next-auth";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAIChatContext } from "@/context/ai-chat-context";
import { useModelSelection } from "@/context/model-selection-context";
import {
  createAIMessage,
  createUserMessage,
  finalizeStreamingMessage
} from "@/lib/ui-message-helpers";
import { ChatFeed } from "../chat-feed";
import { ChatInput } from "../chat-input";

interface ChatInterfaceProps {
  initialMessages?: UIMessage[] | null;
  conversationTitle?: string | null;
  conversationId: string; // From the dynamic route param - not used, context drives everything
  user: User;
}

export function ChatInterface({
  initialMessages,
  conversationId, // From route - not used, we rely on context
  user
}: ChatInterfaceProps) {
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt");

  const {
    activeConversationId,
    streamedText,
    isStreaming,
    isComplete,
    sendChat,
    isConnected,
    isWaitingForRealId,
    resetStreamingState,
    thinkingText,
    isThinking,
    thinkingDuration
  } = useAIChatContext();

  const { selectedModel } = useModelSelection();

  const [messages, setMessages] = useState<UIMessage[]>(initialMessages ?? []);
  const processedRef = useRef(false);
  const [isAwaitingFirstChunk, setIsAwaitingFirstChunk] = useState(false);
  const lastUserMessageRef = useRef<string>("");

  // Handle initial prompt for new chats
  useEffect(() => {
    if (
      activeConversationId === "new-chat" &&
      initialPrompt &&
      !processedRef.current &&
      !isWaitingForRealId
    ) {
      processedRef.current = true;
      setIsAwaitingFirstChunk(true);

      // Add optimistic user message
      const userMsg = createUserMessage({
        id: `new-chat-user-${Date.now()}`,
        content: initialPrompt,
        userId: user.id,
        provider: selectedModel.provider,
        model: selectedModel.modelId,
        conversationId: activeConversationId
      });

      setMessages([userMsg]);
      lastUserMessageRef.current = initialPrompt;

      // Send to AI
      sendChat(initialPrompt);
    }
  }, [
    activeConversationId,
    initialPrompt,
    selectedModel,
    sendChat,
    user,
    isWaitingForRealId
  ]);

  // Update messages with streaming content
  useEffect(() => {
    if (!activeConversationId) return;

    if (!streamedText && !thinkingText && !isThinking) return;

    setIsAwaitingFirstChunk(false);

    setMessages(prev => {
      // Check if we already have a streaming message
      const existingStreamIndex = prev.findIndex(m =>
        m.id.startsWith("streaming-")
      );

      const streamingMsg = createAIMessage({
        id: `streaming-${activeConversationId}`,
        content: streamedText,
        userId: user.id,
        provider: selectedModel.provider,
        model: selectedModel.modelId,
        conversationId: activeConversationId,
        thinkingText: isThinking
          ? thinkingText
          : thinkingDuration
            ? thinkingText
            : undefined,
        thinkingDuration: thinkingDuration ?? undefined
      });

      if (existingStreamIndex >= 0) {
        // Update existing streaming message
        const updated = [...prev];
        updated[existingStreamIndex] = streamingMsg;
        return updated;
      } else {
        // Add new streaming message
        return [...prev, streamingMsg];
      }
    });
  }, [
    streamedText,
    activeConversationId,
    selectedModel,
    user,
    isThinking,
    thinkingText,
    thinkingDuration
  ]);

  // Handle completion
  useEffect(() => {
    if (isComplete && streamedText) {
      // Convert streaming message to final message
      setMessages(prev => {
        const streamingIndex = prev.findIndex(m =>
          m.id.startsWith("streaming-")
        );
        if (streamingIndex >= 0) {
          const updated = [...prev];
          const streamingMsg = updated[streamingIndex];
          if (streamingMsg) {
            updated[streamingIndex] = finalizeStreamingMessage(
              streamingMsg,
              streamedText,
              {
                thinkingText: thinkingText ?? undefined,
                thinkingDuration: thinkingDuration ?? undefined
              }
            );
          }
          return updated;
        }
        return prev;
      });

      // Reset streaming state after completion
      setTimeout(() => {
        resetStreamingState();
      }, 100);
    }
  }, [
    isComplete,
    streamedText,
    resetStreamingState,
    thinkingText,
    thinkingDuration
  ]);

  // Reset processed flag when navigating away from new-chat
  useEffect(() => {
    if (activeConversationId !== "new-chat") {
      processedRef.current = false;
    }
  }, [activeConversationId]);

  // Callback to handle new user messages from the input component
  const handleUserMessage = useCallback(
    (content: string) => {
      if (!activeConversationId || !content.trim()) return;

      // Add optimistic user message immediately
      const userMsg = createUserMessage({
        id: `user-${Date.now()}-${Math.random()}`,
        content: content.trim(),
        userId: user.id,
        provider: selectedModel.provider,
        model: selectedModel.modelId,
        conversationId: activeConversationId
      });

      setMessages(prev => [...prev, userMsg]);
      lastUserMessageRef.current = content.trim();
      setIsAwaitingFirstChunk(true);

      // Send to AI - ensure content is trimmed
      sendChat(content.trim());
    },
    [activeConversationId, selectedModel, sendChat, user]
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <ChatFeed
        messages={messages}
        streamedText={isStreaming ? streamedText : ""}
        isAwaitingFirstChunk={isAwaitingFirstChunk}
        isStreaming={isStreaming}
        isThinking={isThinking}
        thinkingText={thinkingText}
        thinkingDuration={thinkingDuration ?? undefined}
        user={user}
      />
      <ChatInput
        onUserMessage={handleUserMessage}
        user={user}
        isConnected={isConnected}
        activeConversationId={activeConversationId}
        conversationId={activeConversationId ?? conversationId}
      />
    </div>
  );
}

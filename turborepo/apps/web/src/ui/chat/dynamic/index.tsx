// src/ui/chat/dynamic/index.tsx
"use client";

import type { UIMessage } from "@/types/shared";
import type { User } from "next-auth";
import type { ReactNode } from "react";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAIChatContext } from "@/context/ai-chat-context";
import { useModelSelection } from "@/context/model-selection-context";
import { createUserMessage, createAIMessage, finalizeStreamingMessage } from "@/lib/ui-message-helpers";
import { ChatArea } from "@/ui/chat/chat-area";

interface ChatInterfaceProps {
  children: ReactNode;
  initialMessages?: UIMessage[] | null;
  conversationTitle?: string | null;
  conversationId: string; // From the dynamic route param - not used, context drives everything
  user: User;
}

export function ChatInterface({
  children,
  initialMessages,
  conversationId: _conversationId, // From route - not used, we rely on context
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
    isWaitingForRealId,
    resetStreamingState
  } = useAIChatContext();

  const { selectedModel } = useModelSelection();

  const [messages, setMessages] = useState<UIMessage[]>(initialMessages ?? []);
  const processedRef = useRef(false);
  const [isAwaitingFirstChunk, setIsAwaitingFirstChunk] = useState(false);
  const lastUserMessageRef = useRef<string>("");

  // Handle initial prompt for new chats
  useEffect(() => {
    if (activeConversationId === 'new-chat' &&
        initialPrompt &&
        !processedRef.current &&
        !isWaitingForRealId) {

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
    if (!streamedText || !activeConversationId) return;

    setIsAwaitingFirstChunk(false);

    setMessages(prev => {
      // Check if we already have a streaming message
      const existingStreamIndex = prev.findIndex(m => m.id.startsWith('streaming-'));

      const streamingMsg = createAIMessage({
        id: `streaming-${activeConversationId}`,
        content: streamedText,
        userId: user.id,
        provider: selectedModel.provider,
        model: selectedModel.modelId,
        conversationId: activeConversationId
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
  }, [streamedText, activeConversationId, selectedModel, user]);

  // Handle completion
  useEffect(() => {
    if (isComplete && streamedText) {
      // Convert streaming message to final message
      setMessages(prev => {
        const streamingIndex = prev.findIndex(m => m.id.startsWith('streaming-'));
        if (streamingIndex >= 0) {
          const updated = [...prev];
          const streamingMsg = updated[streamingIndex];
          if (streamingMsg) {
            updated[streamingIndex] = finalizeStreamingMessage(streamingMsg, streamedText);
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
  }, [isComplete, streamedText, resetStreamingState]);

  // Reset processed flag when navigating away from new-chat
  useEffect(() => {
    if (activeConversationId !== 'new-chat') {
      processedRef.current = false;
    }
  }, [activeConversationId]);

  // Callback to handle new user messages from the input component
  const handleUserMessage = useCallback((content: string) => {
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

    // Send to AI
    sendChat(content);
  }, [activeConversationId, selectedModel, sendChat, user]);

  // Clone children and pass the message handler
  const childrenWithProps = React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child as React.ReactElement<any>, {
        onUserMessage: handleUserMessage
      });
    }
    return child;
  });

  return (
    <div className="flex h-full flex-col">
      <ChatArea
        messages={messages}
        streamedText={isStreaming ? streamedText : ""}
        isAwaitingFirstChunk={isAwaitingFirstChunk}
        isStreaming={isStreaming}
        model={selectedModel.modelId}
        provider={selectedModel.provider}
        conversationId={activeConversationId ?? 'new-chat'}
        user={user}
      />
      {childrenWithProps}
    </div>
  );
}

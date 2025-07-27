// src/ui/chat/dynamic/index.tsx
"use client";

import type { UIMessage } from "@/types/shared";
import type { User } from "next-auth";
import type { ReactNode } from "react";
import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAIChatContext } from "@/context/ai-chat-context";
import { useModelSelection } from "@/context/model-selection-context";
import { createUserMessage, createAIMessage, finalizeStreamingMessage } from "@/lib/ui-message-helpers";
import { ChatArea } from "@/ui/chat/chat-area";

interface ChatInterfaceProps {
  children: ReactNode;
  initialMessages?: UIMessage[] | null;
  conversationTitle?: string | null;
  conversationId: string; // From the dynamic route param
  user: User;
}

export function ChatInterface({
  children,
  initialMessages,
  conversationId: routeConversationId, // This comes from the [conversationId] param
  user
}: ChatInterfaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt");

  const {
    activeConversationId,
    streamedText,
    isStreaming,
    isComplete,
    sendChat,
    setActiveConversation,
    isWaitingForRealId,
    resetStreamingState
  } = useAIChatContext();

  const { selectedModel } = useModelSelection();

  const [messages, setMessages] = useState<UIMessage[]>(initialMessages ?? []);
  const processedRef = useRef(false);
  const [isAwaitingFirstChunk, setIsAwaitingFirstChunk] = useState(false);

  // CRITICAL: Set the active conversation when component mounts or route changes
  useEffect(() => {
    console.log(`[ChatInterface] Route conversation ID: ${routeConversationId}`);
    setActiveConversation(routeConversationId);
  }, [routeConversationId, setActiveConversation]);

  // Handle URL updates ONLY for new-chat → real ID transition
  useEffect(() => {
    // Only update URL when we receive a real ID for a new-chat
    if (routeConversationId === 'new-chat' &&
        activeConversationId &&
        activeConversationId !== 'new-chat') {
      console.log(`[ChatInterface] Updating URL from new-chat to real ID: ${activeConversationId}`);
      // router.replace(`/chat/${activeConversationId}`);
      window.history.replaceState(null, "", `/chat/${activeConversationId}`);
    }
  }, [activeConversationId, routeConversationId, router]);

  // Handle initial prompt for new chats
  useEffect(() => {
    if (routeConversationId === 'new-chat' &&
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
        conversationId: 'new-chat'
      });

      setMessages([userMsg]);

      // Send to AI
      sendChat(initialPrompt);
    }
  }, [
    routeConversationId,
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
    if (routeConversationId !== 'new-chat') {
      processedRef.current = false;
    }
  }, [routeConversationId]);

  return (
    <div className="flex h-full flex-col">
      <ChatArea
        messages={messages}
        streamedText={isStreaming ? streamedText : ""}
        isAwaitingFirstChunk={isAwaitingFirstChunk}
        isStreaming={isStreaming}
        model={selectedModel.modelId}
        provider={selectedModel.provider}
        conversationId={activeConversationId ?? routeConversationId}
        user={user}
      />
      {children}
    </div>
  );
}

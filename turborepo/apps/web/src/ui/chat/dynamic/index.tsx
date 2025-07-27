// src/ui/chat/dynamic/experimental.tsx
"use client";

import type { UIMessage } from "@/types/shared";
import type { User } from "next-auth";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useModelSelection } from "@/context/model-selection-context";
import { useAiChat } from "@/hooks/use-ai-chat";
import { ChatArea } from "@/ui/chat/chat-area";
import type { AllModelsUnion } from "@t3-chat-clone/types";
import { toPrismaFormat } from "@t3-chat-clone/types";
import { useApiKeys } from "@/context/api-keys-context";

interface ChatInterfaceProps {
  children: ReactNode;
  initialMessages?: UIMessage[] | null;
  conversationTitle?: string | null;
  conversationId: string; // Make this required
  user: User;
}

export function ChatInterface({
  children,
  initialMessages,
  conversationTitle: _conversationTitle,
  conversationId: initialConversationId,
  user
}: ChatInterfaceProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialPrompt = searchParams.get("prompt");
  const { selectedModel } = useModelSelection();
  const {
    streamedText,
    isComplete,
    sendChat,
    isConnected,
    conversationId: liveConvId,
    updateConversationId,
    isWaitingForRealId
  } = useAiChat(user.id, initialConversationId);
  const { apiKeys } = useApiKeys();

  const [convId, setConvId] = useState(initialConversationId);
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages ?? []);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingRef = useRef<string | null>(null);
  const processedRef = useRef(false);
  const [isAwaitingFirstChunk, setIsAwaitingFirstChunk] = useState(false);

  // Update messages when navigating between conversations
  useEffect(() => {
    const currentConvId = pathname.replace('/chat/', '') || 'new-chat';

    // CRITICAL: Don't update if we're in the middle of transitioning from new-chat to real ID
    if (currentConvId === 'new-chat' && (liveConvId && liveConvId !== 'new-chat' || isWaitingForRealId)) {
      console.log('[ChatInterface] Ignoring navigation update during new-chat transition');
      return;
    }

    if (currentConvId !== convId) {
      setConvId(currentConvId);
      updateConversationId(currentConvId); // Update the hook's conversation ID
      // Messages will be updated by the server on navigation
    }
  }, [pathname, convId, updateConversationId, liveConvId, isWaitingForRealId]);

  // Handle initial prompt for new chats
  useEffect(() => {
    if (initialConversationId === 'new-chat' && initialPrompt && !processedRef.current && isConnected) {
      // Mark as processed IMMEDIATELY to prevent any duplicate sends
      processedRef.current = true;

      // Set a flag to prevent any other sends until we get the real ID
      setIsAwaitingFirstChunk(true);

      // Add optimistic user message
      const userMsg: UIMessage = {
        id: `new-chat-${Date.now()}`,
        senderType: "USER",
        provider: toPrismaFormat(selectedModel.provider),
        model: selectedModel.modelId,
        content: initialPrompt,
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: user.id,
        userKeyId: null,
        conversationId: 'new-chat'
      };

      setMessages([userMsg]);
      setIsStreaming(true);

      // Send to AI with the conversation ID - THIS ONLY HAPPENS ONCE
      const hasConfigured = apiKeys.isSet[selectedModel.provider];
      const isDefault = apiKeys.isDefault[selectedModel.provider];

      console.log('[ChatInterface] Sending initial prompt with new-chat ID');
      sendChat(
        initialPrompt,
        selectedModel.provider,
        selectedModel.modelId as AllModelsUnion,
        hasConfigured,
        isDefault,
        'new-chat' // Explicitly pass the conversation ID
      );
    }
  }, [
    initialConversationId,
    initialPrompt,
    selectedModel,
    sendChat,
    apiKeys,
    user,
    isConnected
  ]);

  // Update URL using native history API when we get real conversation ID
  useEffect(() => {
    if (liveConvId && liveConvId !== 'new-chat' && liveConvId !== convId) {
      console.log('[ChatInterface] Received real conversation ID:', liveConvId);

      // Use native history API to avoid navigation and React Router re-renders
      // This is critical to prevent the stream from being interrupted
      window.history.replaceState(
        null,
        '',
        `/chat/${liveConvId}`
      );

      // Update local state to match
      setConvId(liveConvId);
      updateConversationId(liveConvId); // Keep the hook in sync

      // Clear the awaiting flag since we now have the real ID
      setIsAwaitingFirstChunk(false);

      // Clear the processed ref to allow future new chats
      // But NOT immediately - wait a bit to ensure no race conditions
      setTimeout(() => {
        processedRef.current = false;
      }, 1000);
    }
  }, [liveConvId, convId, updateConversationId]);

  // Handle streaming text
  useEffect(() => {
    // Don't process streaming text until we have chunks coming in (not just waiting)
    if (!streamedText || isAwaitingFirstChunk) return;

    setIsStreaming(true);
    setIsAwaitingFirstChunk(false); // Clear this flag once streaming starts

    setMessages(prev => {
      if (!streamingRef.current) {
        const id = `streaming-${convId}`;
        streamingRef.current = id;
        return [
          ...prev,
          {
            id,
            senderType: "AI",
            provider: toPrismaFormat(selectedModel.provider),
            model: selectedModel.modelId,
            content: streamedText,
            createdAt: new Date(),
            updatedAt: new Date(),
            userId: user.id,
            userKeyId: null,
            conversationId: convId
          }
        ];
      }
      return prev.map(m =>
        m.id === streamingRef.current
          ? { ...m, content: streamedText, updatedAt: new Date() }
          : m
      );
    });
  }, [streamedText, convId, selectedModel, user, isAwaitingFirstChunk]);

  // Handle completion
  useEffect(() => {
    if (isComplete) {
      setIsStreaming(false);
      streamingRef.current = null;
    }
  }, [isComplete]);

  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).valueOf() - new Date(b.createdAt).valueOf()
  );

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col items-center justify-center">
      <ChatArea
        messages={sorted}
        streamedText={streamedText}
        isAwaitingFirstChunk={isAwaitingFirstChunk}
        isStreaming={isStreaming}
        model={selectedModel.modelId}
        provider={selectedModel.provider}
        conversationId={convId}
        user={user}
      />
      {children}
    </div>
  );
}

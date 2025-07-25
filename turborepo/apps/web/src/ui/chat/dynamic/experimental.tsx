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
  conversationId: string;
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
    conversationId: liveConvId
  } = useAiChat(user.id);
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
    if (currentConvId !== convId) {
      setConvId(currentConvId);
      // Messages will be updated by the server on navigation
    }
  }, [pathname, convId]);

  // Handle initial prompt for new chats
  useEffect(() => {
    if (initialConversationId === 'new-chat' && initialPrompt && !processedRef.current && isConnected) {
      processedRef.current = true;
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

      // Send to AI
      const hasConfigured = apiKeys.isSet[selectedModel.provider];
      const isDefault = apiKeys.isDefault[selectedModel.provider];
      sendChat(
        initialPrompt,
        selectedModel.provider,
        selectedModel.modelId as AllModelsUnion,
        hasConfigured,
        isDefault
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
      // Use native history API to avoid navigation
      window.history.replaceState(
        null,
        '',
        `/chat/${liveConvId}`
      );
      setConvId(liveConvId);
      setIsAwaitingFirstChunk(false);
    }
  }, [liveConvId, convId]);

  // Handle streaming text
  useEffect(() => {
    if (!streamedText || isAwaitingFirstChunk) return;
    setIsStreaming(true);

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
    <div className="flex h-full flex-col">
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

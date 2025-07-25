// src/ui/chat/dynamic/ChatInterface.tsx
"use client";

import type { UIMessage } from "@/types/shared";
import type { User } from "next-auth";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useModelSelection } from "@/context/model-selection-context";
import { useAiChat } from "@/hooks/use-ai-chat";
import { ChatArea } from "@/ui/chat/chat-area";
import type {
  AllModelsUnion
} from "@t3-chat-clone/types";
import { toPrismaFormat } from "@t3-chat-clone/types";
import { useApiKeys } from "@/context/api-keys-context";
interface ChatInterfaceProps {
  conversationId: string;
  isNewChat: boolean;
  user?: User;
  conversationTitle?: string;
  initialMessages?: UIMessage[];
  children: ReactNode;
}

export function ChatInterface({
  conversationId: initialConvId,
  isNewChat,
  user,
  initialMessages,
  children
}: ChatInterfaceProps) {
  const router = useRouter();
    const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt");
  const { selectedModel } = useModelSelection();
  const {
    streamedText,
    isComplete,
    sendChat,
    isConnected,
    conversationId: liveConvId
  } = useAiChat(user?.id);
const {apiKeys}= useApiKeys();
  const [convId, setConvId] = useState(initialConvId);
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages ?? []);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingRef = useRef<string | null>(null);
  const processedRef = useRef(false);
  const [isAwaitingFirstChunk, setIsAwaitingFirstChunk] = useState(false);

  // Initialize with server messages
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  // Handle initial prompt for new chats
  useEffect(() => {
    if (isNewChat && initialPrompt && !processedRef.current && isConnected) {
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
        userId: user?.id ?? null,
        userKeyId: null,
        conversationId: initialConvId
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
    isNewChat,
    initialPrompt,
    selectedModel,
    sendChat,
    apiKeys,
    user,
    isConnected,
    initialConvId
  ]);

  // Update URL when we get real conversation ID
  useEffect(() => {
    if (liveConvId && liveConvId !== convId) {
      setConvId(liveConvId);
      setIsAwaitingFirstChunk(false);
      router.replace(`/chat/${liveConvId}`, { scroll: false });
    }
  }, [liveConvId, convId, router]);

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
            userId: user?.id ?? null,
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

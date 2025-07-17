// src/components/ChatConversationView.tsx
"use client";

import type { Message } from "@prisma/client";
import type { User } from "next-auth";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useModelSelection } from "@/context/model-selection-context";
import { useAiChat } from "@/hooks/use-ai-chat";
import { ChatArea } from "@/ui/chat-area";
import { MessageInputBar } from "@/ui/chat/message-input-bar";
import { MobileModelSelectorDrawer } from "@/ui/mobile-model-select";
import type {
  AllModelsUnion,
  ClientContextWorkupProps,
  Provider
} from "@t3-chat-clone/types";
import { toPrismaFormat } from "@t3-chat-clone/types";
import { UIMessage } from "@/types/shared";

interface ChatConversationViewProps {
  conversationId: string;
  initialMessages?: UIMessage[];
  user?: User;
  conversationTitle?: string;
  apiKeys: ClientContextWorkupProps;
}

export function ChatConversationView({
  conversationId: convoId,
  user,
  initialMessages,
  conversationTitle,
  apiKeys
}: ChatConversationViewProps) {
  const { selectedModel } = useModelSelection();
  const {
    title = conversationTitle,
    streamedText,
    isConnected,
    conversationId = convoId,
    isComplete,
    sendChat
  } = useAiChat();
  console.log(title);
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages ?? []);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );
  const [isMobileModelSelectorOpen, setIsMobileModelSelectorOpen] =
    useState(false);

  // Reset messages when initialMessages prop changes
  useEffect(() => {
    if (initialMessages) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  // Handle new-chat initial prompt from URL
  useEffect(() => {
    if (conversationId === "new-chat") {
      const initial = searchParams.get("message");
      if (initial && messages.length === 0) {
        const userMsg: UIMessage = {
          id: `temp-user-${Date.now()}`,
          senderType: "USER",
          provider: toPrismaFormat(selectedModel.provider),
          model: selectedModel.modelId,
          content: initial,
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: user?.id ?? null,
          userKeyId: null
        };
        setMessages([userMsg]);
      }
    }
  }, [
    conversationId,
    searchParams,
    messages.length,
    selectedModel.provider,
    selectedModel.modelId,
    user?.id
  ]);

  // Stream incoming chunks into a single AI message
  useEffect(() => {
    if (!streamedText) return;

    setIsStreaming(true);

    setMessages(prev => {
      // first token: create one streaming message
      if (streamingMessageId === null) {
        const id = `streaming-${conversationId}-${Date.now()}`;
        setStreamingMessageId(id);

        const aiMsg: UIMessage = {
          id,
          senderType: "AI",
          provider: selectedModel.provider.toUpperCase() as Message["provider"],
          model: selectedModel.modelId,
          content: streamedText,
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: user?.id ?? null,
          userKeyId: null
        };
        return [...prev, aiMsg];
      }

      // subsequent tokens: patch that same message
      return prev.map(msg =>
        msg.id === streamingMessageId
          ? { ...msg, content: streamedText, updatedAt: new Date() }
          : msg
      );
    });
  }, [
    streamedText,
    conversationId,
    selectedModel.provider,
    selectedModel.modelId,
    user?.id,
    streamingMessageId
  ]);

  // Cleanup when done
  useEffect(() => {
    if (isComplete) {
      setIsStreaming(false);
      setStreamingMessageId(null);
    }
  }, [isComplete]);

  // Send a new user message
  const handleSendMessage = (text: string, isEditSubmit = false) => {
    if (!isConnected) {
      console.error("Cannot send message: WebSocket not connected");
      return;
    }

    if (!isEditSubmit) {
      const optimistic: UIMessage = {
        id: `temp-user-${Date.now()}`,
        senderType: "USER",
        provider: selectedModel.provider.toUpperCase() as Message["provider"],
        model: selectedModel.modelId,
        content: text,
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: user?.id ?? null,
        userKeyId: null
      };
      setMessages(prev => [...prev, optimistic]);
      setIsStreaming(true);
    }

    const hasConfigured = apiKeys.isSet[selectedModel.provider];
    const isDefault = apiKeys.isDefault[selectedModel.provider];
    sendChat(
      text,
      selectedModel.provider as Provider,
      selectedModel.modelId as AllModelsUnion,
      hasConfigured,
      isDefault
    );
  };

  const handleUpdateMessage = (id: string, newText: string) => {
    setMessages(prev =>
      prev.map(msg =>
        msg.id === id
          ? { ...msg, content: newText, updatedAt: new Date() }
          : msg
      )
    );
  };

  return (
    <div className="flex min-h-full flex-col overflow-y-auto">
      <ChatArea
        messages={messages}
        streamedText={streamedText}
        isStreaming={isStreaming}
        model={selectedModel.modelId}
        provider={selectedModel.provider}
        user={user}
        conversationId={conversationId}
        onUpdateMessage={handleUpdateMessage}
      />

      <MessageInputBar
        onSendMessageAction={handleSendMessage}
        disabled={isStreaming}
        placeholder={
          isStreaming
            ? "AI is responding..."
            : `Message ${selectedModel.displayName}...`
        }
      />

      <MobileModelSelectorDrawer
        isOpen={isMobileModelSelectorOpen}
        onOpenChangeAction={setIsMobileModelSelectorOpen}
      />
    </div>
  );
}

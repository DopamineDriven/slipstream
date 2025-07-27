// src/ui/chat/chat-input/index.tsx
"use client";

import { MessageInputBar } from "@/ui/chat/message-input-bar";
import { useAiChat } from "@/hooks/use-ai-chat";
import { useCallback } from "react";
import type { AllModelsUnion } from "@t3-chat-clone/types";
import type { User } from "next-auth";
import { useModelSelection } from "@/context/model-selection-context";
import { useApiKeys } from "@/context/api-keys-context";

interface ChatContentProps {
  user: User;
  conversationId?: string; // Add this prop
}

export function ChatContent({ user, conversationId }: ChatContentProps) {
  const { sendChat, isConnected } = useAiChat(
    user.id,
    conversationId
  );
  const { selectedModel } = useModelSelection();
  const { apiKeys } = useApiKeys();

  const handleSend = useCallback(
    (text: string) => {
      if (!isConnected || !text.trim()) return;

      const hasConfigured = apiKeys.isSet[selectedModel.provider];
      const isDefault = apiKeys.isDefault[selectedModel.provider];

      sendChat(
        text,
        selectedModel.provider,
        selectedModel.modelId as AllModelsUnion,
        hasConfigured,
        isDefault,
        conversationId // Pass the conversation ID
      );
    },
    [apiKeys, selectedModel, isConnected, sendChat, conversationId]
  );

  return (
    <MessageInputBar
      onSendMessageAction={handleSend}
      placeholder={`Message ${selectedModel.displayName}…`}
    />
  );
}

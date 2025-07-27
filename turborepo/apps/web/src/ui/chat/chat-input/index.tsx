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
  conversationId: string;
}

export function ChatContent({ user, conversationId }: ChatContentProps) {
  const { sendChat, isConnected } = useAiChat(
    user.id,
    conversationId
  );
  const { selectedModel } = useModelSelection();
  const { apiKeys } = useApiKeys();

  const handleSend = useCallback(
    (text: string, _isEditSubmit?: boolean) => {
      if (!isConnected || !text.trim()) return;

      const hasConfigured = apiKeys.isSet[selectedModel.provider];
      const isDefault = apiKeys.isDefault[selectedModel.provider];

      console.log(`[ChatContent] Sending message in conversation: ${conversationId}`);

      sendChat(
        text,
        selectedModel.provider,
        selectedModel.modelId as AllModelsUnion,
        hasConfigured,
        isDefault,
        conversationId // Always explicitly pass the conversation ID
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

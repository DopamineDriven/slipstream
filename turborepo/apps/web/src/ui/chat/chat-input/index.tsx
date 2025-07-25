"use client";

import { MessageInputBar } from "@/ui/chat/message-input-bar";
import { useAiChat } from "@/hooks/use-ai-chat";
import { useCallback, useMemo } from "react";
import type { AllModelsUnion } from "@t3-chat-clone/types";
import type { User } from "next-auth";
import { useModelSelection } from "@/context/model-selection-context";
import { useApiKeys } from "@/context/api-keys-context";


interface ChatContentProps {
  user?: User;
}


export function ChatContent({user}: ChatContentProps) {
  const {
    sendChat,
    isConnected,
    isComplete
  } = useAiChat(user?.id);
  const { selectedModel } = useModelSelection();
  const {apiKeys} = useApiKeys()
  const isStreaming = useMemo(() => !isComplete, [isComplete]);

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
        isDefault
      );
    },
    [apiKeys, selectedModel, isConnected, sendChat]
  );

  return (
    <MessageInputBar
      onSendMessageAction={handleSend}
      disabled={isStreaming}
      placeholder={
        isStreaming
          ? "AI is responding…"
          : `Message ${selectedModel.displayName}…`
      }
    />
  );
}

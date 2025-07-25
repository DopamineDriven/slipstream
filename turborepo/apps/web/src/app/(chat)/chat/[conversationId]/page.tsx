// src/app/(chat)/chat/[conversationId]/page.tsx
"use client";

import { useCallback, useMemo } from "react";
import { MessageInputBar } from "@/ui/chat/message-input-bar";
import { useModelSelection } from "@/context/model-selection-context";
import { useApiKeys } from "@/context/api-keys-context";
import { useAiChat } from "@/hooks/use-ai-chat";
import { useSession } from "next-auth/react";
import type { AllModelsUnion } from "@t3-chat-clone/types";

export default function ChatPage() {
  const { data: session } = useSession();
  const { selectedModel } = useModelSelection();
  const { apiKeys } = useApiKeys();
  const {
    sendChat,
    isConnected,
    isComplete
  } = useAiChat(session?.user?.id);

  // Memoize streaming state
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

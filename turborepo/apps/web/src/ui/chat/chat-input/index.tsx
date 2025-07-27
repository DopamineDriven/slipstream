"use client";

import type { User } from "next-auth";
import { useCallback } from "react";
import { useAIChatContext } from "@/context/ai-chat-context";
import { useModelSelection } from "@/context/model-selection-context";
import { MessageInputBar } from "@/ui/chat/message-input-bar";

interface ChatContentProps {
  user: User;
  conversationId: string;
  onUserMessage?: (content: string) => void; // New prop
}

export function ChatContent({ user: _user, conversationId, onUserMessage }: ChatContentProps) {
  const {
    isConnected,
    activeConversationId
  } = useAIChatContext();

  const { selectedModel } = useModelSelection();

  const handleSend = useCallback(
    (text: string, _isEditSubmit?: boolean) => {
      if (!isConnected || !text.trim()) return;

      console.log(
        `[ChatContent] Sending message in active conversation: ${activeConversationId ?? conversationId}`
      );

      // Call the callback to add user message to UI
      if (onUserMessage) {
        onUserMessage(text);
      }
    },
    [isConnected, onUserMessage, activeConversationId, conversationId]
  );

  return (
    <MessageInputBar
      onSendMessageAction={handleSend}
      placeholder={`Message ${selectedModel.displayName}…`}
    />
  );
}

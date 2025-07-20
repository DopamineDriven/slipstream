// app/chat/[conversationId]/ChatInterface.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useModelSelection } from "@/context/model-selection-context";
import { useAiChat } from "@/hooks/use-ai-chat";
import { UIMessage } from "@/types/shared";
import { ChatArea } from "@/ui/chat-area";
import { MessageInputBar } from "@/ui/chat/message-input-bar";
import { MobileModelSelectorDrawer } from "@/ui/mobile-model-select";
import { User } from "next-auth";
import {
  AllModelsUnion,
  ClientContextWorkupProps,
  toPrismaFormat
} from "@t3-chat-clone/types";

interface ChatInterfaceProps {
  conversationId: string;
  initialPrompt?: string;
  isNewChat: boolean;
  user?: User;
  conversationTitle?: string;
  initialMessages?: UIMessage[];
  apiKeys: ClientContextWorkupProps;
}

export function ChatInterface({
  conversationId: initialConvId,
  initialPrompt,
  isNewChat,
  apiKeys,
  user,
  initialMessages
}: ChatInterfaceProps) {
  const { selectedModel } = useModelSelection();
  const {
    streamedText,
    isComplete,
    sendChat,
    isConnected,
    conversationId: liveConvId
  } = useAiChat(user?.id);

  const [convId, setConvId] = useState(initialConvId);
  const streamingIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingRef = useRef<string | null>(null);
  const processedRef = useRef(false);
  const [isAwaitingFirstChunk, setIsAwaitingFirstChunk] = useState(false);
  useEffect(() => {
    if (!initialMessages) return;
    setMessages(initialMessages);
  }, [initialMessages]);

  // 1️⃣ On first mount, if new‐chat + prompt, enqueue it exactly once

  useEffect(() => {
    if (isNewChat && initialPrompt && !processedRef.current) {
      processedRef.current = true;
      setIsAwaitingFirstChunk(true);
      // 1a) Optimistic user message
      const userMsg: UIMessage = {
        id: `new-chat-${Date.now()}`,
        senderType: "USER",
        provider: toPrismaFormat(selectedModel.provider),
        model: selectedModel.modelId,
        content: initialPrompt,
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: user?.id ?? null,
        userKeyId: null
      };
      setMessages([userMsg]);
      setIsStreaming(true);

      // 1d) Fire off to your AI
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
  }, [isNewChat, initialPrompt, selectedModel, sendChat, apiKeys, user]);

  useEffect(() => {
    if (liveConvId && liveConvId !== convId) {
      setConvId(liveConvId);
      setIsAwaitingFirstChunk(false);
      window.history.replaceState(null, "", `/chat/${liveConvId}`);
    }
  }, [liveConvId, convId]);

  useEffect(() => {
    if (!streamedText || isAwaitingFirstChunk) return;
    setIsStreaming(true);
    if (streamingIdRef.current === null) {
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
              userKeyId: null
            }
          ];
        }
        return prev.map(m =>
          m.id === streamingRef.current
            ? { ...m, content: streamedText, updatedAt: new Date() }
            : m
        );
      });
    }
  }, [streamedText, convId, selectedModel, user, isAwaitingFirstChunk]);

  useEffect(() => {
    if (isComplete) {
      setIsStreaming(false);
      streamingRef.current = null;
    }
  }, [isComplete]);

  // regular message handler
  const handleSend = useCallback(
    (text: string) => {
      if (!isConnected) return;
      // optimistic user bubble
      const um: UIMessage = {
        id: `new-chat-${Date.now()}`,
        senderType: "USER",
        provider: toPrismaFormat(selectedModel.provider),
        model: selectedModel.modelId,
        content: text,
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: user?.id ?? "",
        userKeyId: null
      };
      setMessages(p => [...p, um]);
      setIsStreaming(true);
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
    [
      apiKeys,
      user,
      selectedModel.modelId,
      selectedModel.provider,
      isConnected,
      sendChat
    ]
  );
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
      <MessageInputBar
        onSendMessageAction={handleSend}
        disabled={isStreaming}
        placeholder={
          isStreaming || isAwaitingFirstChunk
            ? "AI is responding…"
            : `Message ${selectedModel.displayName}…`
        }
      />

      <MobileModelSelectorDrawer isOpen={false} onOpenChangeAction={() => {}} />
    </div>
  );
}

// src/ui/chat/dynamic/index.tsx
"use client";

import type { AttachmentSingleton, UIMessage } from "@/types/shared";
import type { User } from "next-auth";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { redirect, useRouter } from "next/navigation";
import { useAIChatContext } from "@/context/ai-chat-context";
import { useAssetUpload } from "@/context/asset-context";
import { useCookiesCtx } from "@/context/cookie-context";
import { useModelSelection } from "@/context/model-selection-context";
import { usePathnameContext } from "@/context/pathname-context";
import {
  createAIMessage,
  createUserMessage,
  finalizeStreamingMessage
} from "@/lib/ui-message-helpers";
import { cn } from "@/lib/utils";
import { ChatFeed } from "@/ui/chat/chat-feed";
import { ChatHero } from "@/ui/chat/chat-hero";
import { ChatInput } from "@/ui/chat/chat-input";
import { buildOptimisticAttachment } from "@/lib/attachment-mapper";

interface ChatInterfaceProps {
  initialMessages?: UIMessage[] | null;
  conversationTitle?: string | null;
  conversationId: string; // From the dynamic route param - not used, context drives everything
  user: User;
}

export function ChatInterface({
  initialMessages,
  conversationId, // From route - not used, we rely on context
  user
}: ChatInterfaceProps) {
  const [queuedPrompt, setQueuedPrompt] = useState<string | null>(null);

  const {
    activeConversationId,
    streamedText,
    isStreaming,
    isComplete,
    sendChat,
    isConnected,
    isWaitingForRealId,
    resetStreamingState,
    thinkingText,
    isThinking,
    thinkingDuration
  } = useAIChatContext();
  const router = useRouter();
  const { selectedModel } = useModelSelection();
  const assetUpload = useAssetUpload();
  const { isHome } = usePathnameContext();
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages ?? []);
  const processedRef = useRef(false);
  const [isAwaitingFirstChunk, setIsAwaitingFirstChunk] = useState(false);
  const lastUserMessageRef = useRef<string>("");
  const { get } = useCookiesCtx();
  const tz = get("tz");

  const handlePromptClick = useCallback(
    (prompt: string) => {
      if (isHome) {
        try {
          sessionStorage.setItem("chat.initialPrompt", prompt.trim());
        } catch (err){
          console.log(err);
        } finally {
        router.push("/chat/new-chat", { scroll: false });
      }
    }
      setQueuedPrompt(prompt.trim());
    },
    [router, isHome]
  );
  const handlePromptConsumed = useCallback(() => setQueuedPrompt(null), []);
  // Handle initial prompt for new chats
  useEffect(() => {
    if (
      activeConversationId === "new-chat" &&
      queuedPrompt &&
      !processedRef.current &&
      !isWaitingForRealId
    ) {
      processedRef.current = true;
      setIsAwaitingFirstChunk(true);
      redirect

      // Add optimistic user message
      const userMsg = createUserMessage({
        id: `new-chat-user-${Date.now()}`,
        content: queuedPrompt,
        userId: user.id,
        provider: selectedModel.provider,
        model: selectedModel.modelId,
        conversationId: activeConversationId
      });

      setMessages([userMsg]);
      lastUserMessageRef.current = queuedPrompt;

      // Send to AI
      sendChat(queuedPrompt);
    }
  }, [
    activeConversationId,
    queuedPrompt,
    selectedModel,
    sendChat,
    user,
    isWaitingForRealId
  ]);

  // Update messages with streaming content
  useEffect(() => {
    if (!activeConversationId) return;

    if (!streamedText && !thinkingText && !isThinking) return;

    setIsAwaitingFirstChunk(false);

    setMessages(prev => {
      // Check if we already have a streaming message
      const existingStreamIndex = prev.findIndex(m =>
        m.id.startsWith("streaming-")
      );

      const streamingMsg = createAIMessage({
        id: `streaming-${activeConversationId}`,
        content: streamedText,
        userId: user.id,
        provider: selectedModel.provider,
        model: selectedModel.modelId,
        conversationId: activeConversationId,
        thinkingText: isThinking
          ? thinkingText
          : thinkingDuration
            ? thinkingText
            : undefined,
        thinkingDuration: thinkingDuration ?? undefined
      });

      if (existingStreamIndex >= 0) {
        // Update existing streaming message
        const updated = [...prev];
        updated[existingStreamIndex] = streamingMsg;
        return updated;
      } else {
        // Add new streaming message
        return [...prev, streamingMsg];
      }
    });
  }, [
    streamedText,
    activeConversationId,
    selectedModel,
    user,
    isThinking,
    thinkingText,
    thinkingDuration
  ]);

  // Handle completion
  useEffect(() => {
    if (isComplete && streamedText) {
      // Convert streaming message to final message
      setMessages(prev => {
        const streamingIndex = prev.findIndex(m =>
          m.id.startsWith("streaming-")
        );
        if (streamingIndex >= 0) {
          const updated = [...prev];
          const streamingMsg = updated[streamingIndex];
          if (streamingMsg) {
            updated[streamingIndex] = finalizeStreamingMessage(
              streamingMsg,
              streamedText,
              {
                thinkingText: thinkingText ?? undefined,
                thinkingDuration: thinkingDuration ?? undefined
              }
            );
          }
          return updated;
        }
        return prev;
      });

      // Reset streaming state after completion
      setTimeout(() => {
        resetStreamingState();
      }, 100);
    }
  }, [
    isComplete,
    streamedText,
    resetStreamingState,
    thinkingText,
    thinkingDuration
  ]);

  // Reset processed flag when navigating away from new-chat
  useEffect(() => {
    if (activeConversationId !== "new-chat") {
      processedRef.current = false;
    }
  }, [activeConversationId]);

  // Derive the payload type from ChatInput prop to ensure consistency
  type OnUserMessagePayload = Parameters<NonNullable<React.ComponentProps<typeof ChatInput>["onUserMessage"]>>[0];

  // Callback to handle new user messages from the input component
  const handleUserMessage = useCallback((payload: OnUserMessagePayload) => {
      const content = payload.content;
      if (!activeConversationId || !content.trim()) return;

      // Build optimistic attachments for the bubble if provided
      const optimisticAttachments = (payload.attachments ?? []).map(a => {
        const info = assetUpload.getByPreviewId(a.id);
        return buildOptimisticAttachment(a, activeConversationId ?? "new-chat", {
          draftId: info?.draftId ?? undefined,
          cdnUrl: info?.cdnUrl ?? undefined,
          publicUrl: info?.publicUrl ?? undefined,
          filename: info?.filename ?? undefined,
          mime: info?.mime ?? undefined,
          size: info?.size ?? undefined
        });
      }) as AttachmentSingleton[];

      // Add optimistic user message with optional attachments
      const userMsg = createUserMessage({
        id: `user-${Date.now()}-${Math.random()}`,
        content: content.trim(),
        userId: user.id,
        provider: selectedModel.provider,
        model: selectedModel.modelId,
        conversationId: activeConversationId
      });

      const userMsgWithAttachments = {
        ...userMsg,
        attachments: optimisticAttachments.length
          ? optimisticAttachments
          : undefined
      } satisfies UIMessage;

      setMessages(prev => [...prev, userMsgWithAttachments]);
      lastUserMessageRef.current = content.trim();
      setIsAwaitingFirstChunk(true);

      // Send to AI - pass through the batchId from the input so the
      // server associates the correct attachments to this message
      sendChat(content.trim(), payload.batchId);
    }, [activeConversationId, selectedModel, sendChat, user, assetUpload]);

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isHome
          ? "mx-auto items-center justify-center p-4"
          : "overflow-y-auto"
      )}>
      <ChatFeed
        messages={messages}
        streamedText={isStreaming ? streamedText : ""}
        isAwaitingFirstChunk={isAwaitingFirstChunk}
        isStreaming={isStreaming}
        isThinking={isThinking}
        isHome={isHome}
        thinkingText={thinkingText}
        thinkingDuration={thinkingDuration ?? undefined}
        user={user}>
        <ChatHero
          user={user}
          selectedModel={selectedModel}
          tz={tz}
          onPromptClickAction={handlePromptClick}
        />
      </ChatFeed>
      <ChatInput
        handlePromptConsumed={handlePromptConsumed}
        initialPrompt={queuedPrompt}
        autoSubmitInitialPrompt
        onUserMessage={handleUserMessage}
        user={user}
        isConnected={isConnected}
        activeConversationId={activeConversationId}
        conversationId={activeConversationId ?? conversationId}
      />
    </div>
  );
}

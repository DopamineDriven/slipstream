// src/ui/chat/dynamic/experimental.tsx
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
  conversationId: string; // Make this required
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
    conversationId: liveConvId,
    updateConversationId,
    isWaitingForRealId
  } = useAiChat(user.id, initialConversationId);
  const { apiKeys } = useApiKeys();

  const [convId, setConvId] = useState(initialConversationId);
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages ?? []);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingRef = useRef<string | null>(null);
  const processedRef = useRef(false);
  const [isAwaitingFirstChunk, setIsAwaitingFirstChunk] = useState(false);

  // Update messages when navigating between conversations
  useEffect(() => {
     const workup = pathname.replace("/chat/", "");
    const currentPathConvId = !workup.startsWith("new-chat") ? workup : 'new-chat';

    // If the conversation ID in the URL matches our current state, do nothing
    if (currentPathConvId === convId) {
      return;
    }

    // If we're waiting for a real ID and the path still shows new-chat, don't update
    if (currentPathConvId === 'new-chat' && isWaitingForRealId) {
      console.log('[ChatInterface] Skipping update while waiting for real conversation ID');
      return;
    }

    // Only update if there's an actual mismatch that needs to be resolved
    console.log(`[ChatInterface] Navigation detected: ${convId} -> ${currentPathConvId}`);
    setConvId(currentPathConvId);
    updateConversationId(currentPathConvId);

    // Reset flags when navigating to a different conversation
    setIsAwaitingFirstChunk(false);
    setIsStreaming(false);
    processedRef.current = false;
  }, [pathname, convId, updateConversationId, isWaitingForRealId]);

  // Handle initial prompt for new chats
  useEffect(() => {
    // Only process if all conditions are met
    if (
      initialConversationId === 'new-chat' &&
      initialPrompt &&
      !processedRef.current &&
      isConnected &&
      !isWaitingForRealId // Add this check to prevent duplicate processing
    ) {
      // Mark as processed IMMEDIATELY to prevent any duplicate sends
      processedRef.current = true;

      // Set a flag to prevent any other sends until we get the real ID
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

      // Send to AI with the conversation ID - THIS ONLY HAPPENS ONCE
      const hasConfigured = apiKeys.isSet[selectedModel.provider];
      const isDefault = apiKeys.isDefault[selectedModel.provider];

      console.log('[ChatInterface] Sending initial prompt with new-chat ID');
      sendChat(
        initialPrompt,
        selectedModel.provider,
        selectedModel.modelId as AllModelsUnion,
        hasConfigured,
        isDefault,
        'new-chat' // Explicitly pass the conversation ID
      );
    }
  }, [
    initialConversationId,
    initialPrompt,
    selectedModel,
    sendChat,
    apiKeys,
    user,
    isConnected,
    isWaitingForRealId
  ]);

  // Update URL using native history API when we get real conversation ID
  useEffect(() => {
    if (liveConvId && liveConvId !== 'new-chat') {
      // Check if URL already has the correct conversation ID
      const currentPathConvId = pathname.split('/chat/')[1];

      if (currentPathConvId === liveConvId) {
        // URL is already correct, no need to update
        console.log(`[ChatInterface] URL already has correct conversation ID: ${liveConvId}`);
        return;
      }

      console.log(`[ChatInterface] Updating URL from ${currentPathConvId} to ${liveConvId}`);

      // Use setTimeout to ensure we're not in a render cycle
      setTimeout(() => {
        window.history.replaceState(
          null,
          '',
          `/chat/${liveConvId}`
        );
      }, 0);

      // Update local state to match
      setConvId(liveConvId);
      updateConversationId(liveConvId);

      // Clear the awaiting flag since we now have the real ID
      setIsAwaitingFirstChunk(false);

      // Clear the processed ref to allow future new chats
      setTimeout(() => {
        processedRef.current = false;
      }, 1000);
    }
  }, [liveConvId, pathname, updateConversationId]);

  // Handle streaming text
  useEffect(() => {
    // Don't process streaming text until we have chunks coming in
    if (!streamedText) return;

    // Once we have streaming text, we're no longer awaiting the first chunk
    if (isAwaitingFirstChunk) {
      setIsAwaitingFirstChunk(false);
    }

    setIsStreaming(true);

    setMessages(prev => {
      // Ensure we have a valid conversation ID
      const currentConvId = convId || 'new-chat';

      if (!streamingRef.current) {
        const id = `streaming-${currentConvId}`;
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
            conversationId: currentConvId
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
/**
     const workup = pathname.replace("/chat/", "");
    const currentConvId = !workup.startsWith("new-chat") ? workup : 'new-chat';
 */

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
import { buildOptimisticAttachment } from "@/lib/attachment-mapper";
import {
  createAIMessage,
  createUserMessage,
  finalizeStreamingMessage
} from "@/lib/ui-message-helpers";
import { cn } from "@/lib/utils";
import { ChatFeed } from "@/ui/chat/chat-feed";
import { ChatHero } from "@/ui/chat/chat-hero";
import { ChatInput } from "@/ui/chat/chat-input";

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
        } catch (err) {
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
  // Read any persisted attachments/batch from sessionStorage for first send
  const [initialPersistedAttachments, setInitialPersistedAttachments] =
    useState<
      | null
      | {
          id: string;
          filename: string;
          mime: string;
          size: number;
          width?: number;
          height?: number;
          draftId?: string | null;
          cdnUrl?: string | null;
          publicUrl?: string | null;
        }[]
    >(null);
  const initialBatchIdRef = useRef<string | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("chat.initialAttachments");
      const bid = sessionStorage.getItem("chat.initialAttachmentsBatchId");
      if (raw)
        setInitialPersistedAttachments(
          JSON.parse(raw) as
            | {
                id: string;
                filename: string;
                mime: string;
                size: number;
                width?: number;
                height?: number;
                draftId?: string | null;
                cdnUrl?: string | null;
                publicUrl?: string | null;
              }[]
            | null
        );
      if (bid) initialBatchIdRef.current = bid;
    } catch (err) {
      console.log(err);
    }
  }, []);
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
      redirect;

      // Build optimistic attachments from any persisted previews
      const optimisticAttachments = (initialPersistedAttachments ?? []).map(
        a => {
          const current = assetUpload.getByPreviewId(a.id) ?? undefined;
          return buildOptimisticAttachment(
            {
              // minimal fields used by builder
              id: a.id,
              file: new File([new Blob()], a.filename || "file"), // placeholder, not used downstream
              filename: a.filename,
              mime: a.mime,
              size: a.size,
              status: "pending"
            },
            activeConversationId ?? "new-chat",
            {
              draftId: current?.draftId ?? a.draftId ?? null,
              cdnUrl: current?.cdnUrl ?? a.cdnUrl ?? null,
              publicUrl: current?.publicUrl ?? a.publicUrl ?? null,
              filename: a.filename,
              mime: a.mime,
              size: a.size
            }
          );
        }
      );

      // Add optimistic user message
      const userMsg = createUserMessage({
        id: `new-chat-user-${Date.now()}`,
        content: queuedPrompt,
        userId: user.id,
        provider: selectedModel.provider,
        model: selectedModel.modelId,
        conversationId: activeConversationId
      });

      const withAttachments = {
        ...userMsg,
        attachments: optimisticAttachments.length
          ? optimisticAttachments
          : undefined
      } as typeof userMsg & {
        attachments?: ReturnType<typeof buildOptimisticAttachment>[];
      };

      setMessages([withAttachments]);
      lastUserMessageRef.current = queuedPrompt;

      // Send to AI
      const explicitBatchId = initialBatchIdRef.current ?? undefined;
      sendChat(queuedPrompt, explicitBatchId);

      // Clear persisted attachments after consuming
      try {
        sessionStorage.removeItem("chat.initialAttachments");
        sessionStorage.removeItem("chat.initialAttachmentsBatchId");
      } catch (err) {
        console.log(err);
      }
    }
  }, [
    activeConversationId,
    queuedPrompt,
    selectedModel,
    sendChat,
    user,
    isWaitingForRealId,
    assetUpload,
    initialPersistedAttachments
  ]);

  // While streaming, update optimistic attachments with latest cdnUrl/publicUrl
  useEffect(() => {
    const bId = initialBatchIdRef.current;
    if (!bId) return;
    const uploads = assetUpload.getUploadsByBatchId(bId) ?? [];
    if (uploads.length === 0) return;

    setMessages(prev => {
      if (prev.length === 0) return prev;
      // update only the latest user message with attachments
      const idx = [...prev]
        .reverse()
        .findIndex(
          m => m.senderType === "USER" && (m.attachments?.length ?? 0) > 0
        );
      if (idx === -1) return prev;
      const realIndex = prev.length - 1 - idx;
      const msg = prev[realIndex];
      if (!msg || !msg.attachments || msg.attachments.length === 0) return prev;

      const byDraft = new Map(uploads.map(u => [u.draftId, u] as const));
      const updatedAttachments = msg.attachments.map(att => {
        const draft = att?.draftId ?? null;
        if (!draft) return att;
        const u = byDraft.get(draft);
        if (!u) return att;
        // Only update if we have new URLs
        const nextCdn = u.cdnUrl ?? null;
        const nextPub = u.publicUrl ?? null;
        if (
          (att.cdnUrl ?? null) === nextCdn &&
          (att.publicUrl ?? null) === nextPub
        )
          return att;
        return { ...att, cdnUrl: nextCdn, publicUrl: nextPub } as typeof att;
      });

      // if nothing changed, avoid re-render
      const changed = updatedAttachments.some(
        (a, i) => a !== msg.attachments?.[i]
      );
      if (!changed) return prev;
      const next = [...prev];
      next[realIndex] = { ...msg, attachments: updatedAttachments };
      return next;
    });
  }, [assetUpload, assetUpload.uploadProgress, assetUpload.isUploading]);

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
  type OnUserMessagePayload = Parameters<
    NonNullable<React.ComponentProps<typeof ChatInput>["onUserMessage"]>
  >[0];

  // Callback to handle new user messages from the input component
  const handleUserMessage = useCallback(
    (payload: OnUserMessagePayload) => {
      const content = payload.content;
      if (!activeConversationId || !content.trim()) return;

      // Build optimistic attachments for the bubble if provided
      const optimisticAttachments = (payload.attachments ?? []).map(a => {
        const info = assetUpload.getByPreviewId(a.id);
        return buildOptimisticAttachment(
          a,
          activeConversationId ?? "new-chat",
          {
            draftId: info?.draftId ?? undefined,
            cdnUrl: info?.cdnUrl ?? undefined,
            publicUrl: info?.publicUrl ?? undefined,
            filename: info?.filename ?? undefined,
            mime: info?.mime ?? undefined,
            size: info?.size ?? undefined
          }
        );
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
    },
    [activeConversationId, selectedModel, sendChat, user, assetUpload]
  );

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isHome ? "mx-auto items-center justify-center p-4" : "overflow-y-auto"
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

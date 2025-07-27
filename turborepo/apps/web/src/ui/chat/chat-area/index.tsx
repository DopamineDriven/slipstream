"use client";

import type { UIMessage } from "@/types/shared";
import type { User } from "next-auth";
import { memo, useEffect, useMemo, useRef } from "react";
import { ScrollArea } from "@/ui/atoms/scroll-area";
import { ChatMessage } from "@/ui/chat/chat-message";
import { motion } from "motion/react";
import type { Provider } from "@t3-chat-clone/types";
import { toPrismaFormat } from "@t3-chat-clone/types";

interface ChatAreaProps {
  messages?: UIMessage[];
  streamedText?: string;
  isStreaming?: boolean;
  model: string | null;
  provider: Provider;
  conversationId: string;
  onUpdateMessage?: (messageId: string, newText: string) => void;
  user: User;
  className?: string;
  isAwaitingFirstChunk?: boolean;
}

export const ChatArea = memo(function ChatArea({
  messages = [],
  streamedText = "",
  isStreaming = false,
  onUpdateMessage,
  model,
  user,
  conversationId,
  provider,
  className = "",
  isAwaitingFirstChunk = false
}: ChatAreaProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const lastMessageCountRef = useRef(messages.length);
  const shouldAutoScrollRef = useRef(true);

  // Track if user has scrolled away from bottom
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const checkIfAtBottom = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollArea;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      shouldAutoScrollRef.current = isAtBottom;
    };

    scrollArea.addEventListener("scroll", checkIfAtBottom);
    return () => scrollArea.removeEventListener("scroll", checkIfAtBottom);
  }, []);

  // Auto-scroll to bottom when new messages arrive or streaming updates
  useEffect(() => {
    // Only auto-scroll if user is at bottom
    if (!shouldAutoScrollRef.current) return;

    // Use smooth scrolling for new messages, instant for streaming
    const behavior =
      messages.length > lastMessageCountRef.current ? "smooth" : "auto";
    lastMessageCountRef.current = messages.length;

    endRef.current?.scrollIntoView({ behavior });
  }, [messages.length, streamedText]);

  // Create streaming message only when we have streaming text
  const streamingMessage = useMemo(() => {
    if (!streamedText || isAwaitingFirstChunk) return null;

    return {
      id: `streaming-${conversationId}`,
      senderType: "AI" as const,
      content: streamedText,
      createdAt: new Date(),
      updatedAt: new Date(),
      conversationId: conversationId ?? "new-chat",
      model: model ?? "unknown",
      provider: toPrismaFormat(provider),
      userId: user?.id ?? null,
      userKeyId: null
    } satisfies UIMessage;
  }, [
    streamedText,
    isAwaitingFirstChunk,
    conversationId,
    model,
    provider,
    user?.id
  ]);

  return (
    <ScrollArea
      ref={scrollAreaRef}
      className={`flex-grow p-2 sm:p-4 md:p-6 ${className}`}>
      <motion.div
        className="space-y-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ staggerChildren: 0.1 }}>
        {/* Render all persisted messages */}
        {messages.map(msg => (
          <ChatMessage
            key={msg.id}
            message={msg}
            user={user}
            onUpdateMessage={onUpdateMessage}
          />
        ))}

        {/* Render streaming message if exists */}
        {streamingMessage && (
          <ChatMessage
            key="streaming"
            message={streamingMessage}
            user={user}
            isStreaming={isStreaming}
          />
        )}

        {/* Loading indicator when awaiting first chunk */}
        {isAwaitingFirstChunk && !streamedText && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 py-3">
            <div className="bg-brand-component/10 flex size-8 items-center justify-center rounded-full">
              <div className="border-brand-component/20 border-t-brand-component/40 size-4 animate-spin rounded-full border-2" />
            </div>
            <div className="bg-brand-component rounded-lg px-4 py-2">
              <div className="flex gap-1">
                <span className="bg-brand-component/70 size-2 animate-bounce rounded-full" />
                <span
                  className="bg-brand-component/60 size-2 animate-bounce rounded-full"
                  style={{ animationDelay: "0.1s" }}
                />
                <span
                  className="bg-brand-component/50 size-2 animate-bounce rounded-full"
                  style={{ animationDelay: "0.2s" }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* Auto-scroll anchor */}
        <div ref={endRef} />
      </motion.div>
    </ScrollArea>
  );
});

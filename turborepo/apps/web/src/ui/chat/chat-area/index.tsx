// src/ui/chat/chat-area/index.tsx
"use client";

import type { UIMessage } from "@/types/shared";
import type { User } from "next-auth";
import { memo, useEffect, useRef } from "react";
import { ScrollArea } from "@/ui/atoms/scroll-area";
import { ChatMessage } from "@/ui/chat/chat-message";
import { motion } from "motion/react";

interface ChatAreaProps {
  messages: UIMessage[];
  streamedText?: string;
  isStreaming?: boolean;
  isAwaitingFirstChunk?: boolean;
  model: string;
  provider: string;
  conversationId: string;
  user: User;
  onUpdateMessage?: (messageId: string, newText: string) => void;
  className?: string;
}

export const ChatArea = memo(function ChatArea({
  messages = [],
  streamedText = "",
  isStreaming = false,
  isAwaitingFirstChunk = false,
  onUpdateMessage,
  user,
  className = ""
}: ChatAreaProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const lastMessageCountRef = useRef(messages.length);
  const shouldAutoScrollRef = useRef(true);
  const lastScrollTimeRef = useRef(0);

  // Track if user has scrolled away from bottom
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const checkIfAtBottom = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollArea;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      shouldAutoScrollRef.current = isAtBottom;
    };

    const throttledCheck = () => {
      const now = Date.now();
      if (now - lastScrollTimeRef.current > 50) {
        lastScrollTimeRef.current = now;
        checkIfAtBottom();
      }
    };

    scrollArea.addEventListener("scroll", throttledCheck, { passive: true });
    return () => scrollArea.removeEventListener("scroll", throttledCheck);
  }, []);

  // Auto-scroll to bottom when new messages arrive or streaming updates
  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;

    // Determine scroll behavior based on whether we have new messages
    const hasNewMessages = messages.length > lastMessageCountRef.current;
    const behavior = hasNewMessages ? "smooth" : "auto";
    lastMessageCountRef.current = messages.length;

    // Small delay to ensure DOM is updated
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior, block: "end" });
    });
  }, [messages.length, streamedText]);

  // Force scroll when awaiting first chunk changes
  useEffect(() => {
    if (isAwaitingFirstChunk) {
      requestAnimationFrame(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  }, [isAwaitingFirstChunk]);

  return (
    <ScrollArea
      ref={scrollAreaRef}
      className={`flex-grow p-2 sm:p-4 md:p-6 ${className}`}>
      <motion.div
        className="space-y-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, staggerChildren: 0.05 }}>

        {/* Render all messages */}
        {messages.map((msg, index) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              delay: index === messages.length - 1 ? 0 : 0
            }}>
            <ChatMessage
              message={msg}
              user={user}
              onUpdateMessage={onUpdateMessage}
              isStreaming={isStreaming && msg.id.startsWith('streaming-')}
            />
          </motion.div>
        ))}

        {/* Loading indicator when awaiting first chunk */}
        {isAwaitingFirstChunk && !streamedText && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-3 py-3">
            <div className="bg-brand-component/10 flex size-8 items-center justify-center rounded-full">
              <div className="border-brand-component/20 border-t-brand-component/40 size-4 animate-spin rounded-full border-2" />
            </div>
            <div className="bg-brand-component rounded-lg px-4 py-2">
              <div className="flex gap-1">
                <span
                  className="bg-brand-component/70 size-2 animate-bounce rounded-full"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="bg-brand-component/60 size-2 animate-bounce rounded-full"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="bg-brand-component/50 size-2 animate-bounce rounded-full"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </motion.div>
        )}
        {/* Auto-scroll anchor */}
        <div ref={endRef} aria-hidden="true" />
      </motion.div>
    </ScrollArea>
  );
});

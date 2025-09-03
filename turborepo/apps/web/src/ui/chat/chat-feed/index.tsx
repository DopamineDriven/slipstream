"use client";

import type { UIMessage } from "@/types/shared";
import type { User } from "next-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { useScrollObserver } from "@/hooks/use-scroll-observer";
import { useSelectionQuote } from "@/hooks/use-selection-quote";
import { smoothScrollToBottom } from "@/lib/helpers";
import { SelectionToolbar } from "@/ui/chat/chat-selection";
import { MessageBubble } from "@/ui/chat/message-bubble";
import { motion } from "motion/react";

interface ChatFeedProps {
  messages: UIMessage[];
  user?: User;
  className?: string;
  onUpdateMessage?: (messageId: string, newText: string) => void;
  isAwaitingFirstChunk?: boolean;
  thinkingText?: string;
  isThinking?: boolean;
  thinkingDuration?: number;
  streamedText?: string;
  isStreaming?: boolean;
}

export function ChatFeed({
  messages,
  className,
  onUpdateMessage,
  user,
  isAwaitingFirstChunk,
  isStreaming,
  streamedText,
  thinkingText,
  isThinking,
  thinkingDuration
}: ChatFeedProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const { rect, quote, clear } = useSelectionQuote("[data-chat-feed]");
  // Use the scroll observer hook
  const { isNearBottom } = useScrollObserver(scrollRef, {
    nearBottomThreshold: 200,
    scrollButtonThreshold: 100,
    debounceMs: 50
  });

  // Notify parent about scroll button state
  const handleQuote = useCallback(async () => {
    if (!quote) return;
    // Prefer Clipboard API for a “Copy & Quote” smoothness if you want
    // await navigator.clipboard.writeText(quote.excerpt); // optional
    window.dispatchEvent(new CustomEvent("chat:quote", { detail: quote }));
    clear();
    // Dismiss the OS selection
    window.getSelection?.()?.removeAllRanges();
  }, [quote, clear]);

  const handleCopy = useCallback(async () => {
    if (!quote) return;
    try {
      await navigator.clipboard.writeText(quote.excerpt);
      clear();
      window.getSelection()?.removeAllRanges();
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [quote, clear]);
  // Smooth scroll to bottom with velocity based on distance
  const scrollToBottom = useCallback(() => {
    if (!scrollRef.current || isScrolling) return;

    setIsScrolling(true);
    const container = scrollRef.current;
    const startScrollTop = container.scrollTop;
    const targetScrollTop = container.scrollHeight - container.clientHeight;
    const distance = targetScrollTop - startScrollTop;

    const duration = smoothScrollToBottom(distance);

    const startTime = performance.now();

    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // easeOutQuart easing function for natural deceleration
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);

      const currentScrollTop = startScrollTop + distance * easeOutQuart;
      container.scrollTop = currentScrollTop;

      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      } else {
        setIsScrolling(false);
      }
    };

    requestAnimationFrame(animateScroll);
  }, [isScrolling]);

  // Assign to global window for access from other components
  useEffect(() => {
    window.chatScrollToBottom = scrollToBottom;

    return () => {
      // Cleanup on unmount
      delete window.chatScrollToBottom;
    };
  }, [scrollToBottom]);

  useEffect(() => {
    const scrollToBottom = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };
    requestAnimationFrame(scrollToBottom);

    const fallbackTimer = setTimeout(() => {
      requestAnimationFrame(scrollToBottom);
    }, 100);

    return () => clearTimeout(fallbackTimer);
  }, []);

  // Auto-scroll when messages change or streaming updates occur (only if near bottom)
  useEffect(() => {
    if (!scrollRef.current || !isNearBottom) return;

    // Use requestAnimationFrame for smooth scrolling
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [
    messages.length,
    streamedText,
    thinkingText,
    isAwaitingFirstChunk,
    isNearBottom
  ]);

  return (
    <>
      <div
        ref={scrollRef}
        data-chat-feed
        className={`flex-1 space-y-6 overflow-y-auto px-4 py-6 ${className}`}>
        {messages?.map(message => (
          <MessageBubble
            key={message.id}
            message={message}
            user={user}
            onUpdateMessage={onUpdateMessage}
            isStreaming={isStreaming && message.id.startsWith("streaming-")}
            // Pass live thinking data for the currently streaming message
            liveThinkingText={
              isStreaming && message.id.startsWith("streaming-")
                ? thinkingText
                : undefined
            }
            liveIsThinking={
              isStreaming && message.id.startsWith("streaming-")
                ? isThinking
                : undefined
            }
            liveThinkingDuration={
              isStreaming && message.id.startsWith("streaming-")
                ? thinkingDuration
                : undefined
            }
          />
        ))}
        {isStreaming && isAwaitingFirstChunk === true && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="mx-auto flex w-full max-w-[100dvw] justify-start gap-3 sm:max-w-3xl md:max-w-4xl">
            <div className="flex items-center gap-3">
              {/* AI Avatar */}
              <div className="mt-1 shrink-0">
                <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-full sm:size-8">
                  <div className="border-primary-foreground/20 border-t-primary-foreground/40 size-4 animate-spin rounded-full border-2" />
                </div>
              </div>
              <div className="bg-muted rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <span
                    className="bg-muted-foreground/70 size-2 animate-bounce rounded-full"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="bg-muted-foreground/60 size-2 animate-bounce rounded-full"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="bg-muted-foreground/50 size-2 animate-bounce rounded-full"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
      {rect && quote && (
        <SelectionToolbar
          rect={rect}
          onQuoteAction={handleQuote}
          onCopyAction={handleCopy}
          onCloseAction={clear}
        />
      )}
    </>
  );
}

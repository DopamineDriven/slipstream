"use client";

import type { User } from "@/utils/auth-client";
import type { ReactNode } from "react";
import { useCallback, useEffect } from "react";
import { useChatScroll } from "@/context/chat-scroll-context";
import { useScrollObserver } from "@/hooks/use-scroll-observer";
import { useSelectionQuote } from "@/hooks/use-selection-quote";
import { cn } from "@/lib/utils";
import { SelectionToolbar } from "@/ui/chat/chat-selection";
import { MessageBubble } from "@/ui/chat/message-bubble";
import { motion } from "motion/react";
import type {
  AIChatResponseImgGenFieldsFinal,
  MessageSingleton
} from "@slipstream/types";

interface ChatFeedProps {
  messages: MessageSingleton<true>[];
  isHome: boolean;
  user?: User;
  className?: string;
  onUpdateMessage?: (messageId: string, newText: string) => void;
  isAwaitingFirstChunk?: boolean;
  thinkingText?: string;
  isThinking?: boolean;
  thinkingDuration?: number;
  streamedText?: string;
  isStreaming?: boolean;
  children?: ReactNode;
  isNewChat: boolean;
  activeConversationId?: string;
  imgGenEnabled?: boolean;
  imgGenFields?: AIChatResponseImgGenFieldsFinal;
  imgGenAttachmentId?: string;
  currentAiMsgId?: string;
}

export function ChatFeed({
  messages,
  className,
  onUpdateMessage,
  user,
  isAwaitingFirstChunk,
  isStreaming,
  streamedText,
  activeConversationId,
  thinkingText,
  isNewChat,
  isThinking,
  isHome,
  thinkingDuration,
  imgGenEnabled,
  imgGenFields,
  imgGenAttachmentId,
  currentAiMsgId,
  children
}: ChatFeedProps) {
  const { scrollRef, setScrollState } = useChatScroll();

  useEffect(() => {
    console.log({
      ["chat-feed-has-image-gen-fields-data"]: JSON.stringify(
        imgGenFields,
        null,
        2
      )
    });
  }, [imgGenFields]);

  const { rect, quote, clear } = useSelectionQuote("[data-chat-feed]");

  const { isNearBottom, showScrollButton: hookShowScrollButton } =
    useScrollObserver(scrollRef, {
      nearBottomThreshold: 200,
      scrollButtonThreshold: 100,
      debounceMs: 50
    });

  // Sync scroll state to context whenever it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    setScrollState(isNearBottom, hookShowScrollButton);
  }, [isNearBottom, hookShowScrollButton, setScrollState]);

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

  useEffect(() => {
    const initialScroll = () => {
      if (isNewChat) return;
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };

    // Use multiple attempts to ensure scroll happens after DOM is fully rendered
    requestAnimationFrame(initialScroll);

    const fallbackTimer = setTimeout(() => {
      requestAnimationFrame(initialScroll);
    }, 50);

    return () => clearTimeout(fallbackTimer);
  }, [activeConversationId, scrollRef, isNewChat]);

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
    isNearBottom,
    scrollRef
  ]);

  return (
    <>
      {isHome ? (
        children
      ) : (
        <div
          ref={scrollRef}
          data-chat-feed
          className={cn(
            `flex-1 space-y-6 overflow-y-auto px-4 py-6`,
            className
          )}>
          {messages?.map(message => {
            // Check if this is a streaming message or matches the current aiMsgId
            const isStreamingMessage =
              isStreaming && message.id.startsWith("streaming-");

            // For completed messages, check if it's an image gen message with the current aiMsgId
            const isCurrentImgGenMessage =
              message.senderType === "AI" &&
              message.messageType === "IMAGE_GEN" &&
              message.id === currentAiMsgId;

            const shouldReceiveAttachmentId =
              isCurrentImgGenMessage ||
              typeof imgGenFields !== "undefined" ||
              isStreamingMessage;

            return (
              <MessageBubble
                key={message.id}
                message={message}
                user={user}
                onUpdateMessage={onUpdateMessage}
                isStreaming={isStreamingMessage}
                liveThinkingText={isStreamingMessage ? thinkingText : undefined}
                liveIsThinking={isStreamingMessage ? isThinking : undefined}
                liveThinkingDuration={
                  isStreamingMessage ? thinkingDuration : undefined
                }
                // Progressive image-gen data for streaming message
                liveImgGenEnabled={
                  isStreamingMessage ? imgGenEnabled : undefined
                }
                liveImgGenFields={
                  isStreamingMessage ? (imgGenFields ?? undefined) : undefined
                }
                liveImgGenAttachmentId={
                  // Pass attachment ID for streaming messages and the specific AI message with matching ID
                  shouldReceiveAttachmentId ? imgGenAttachmentId : undefined
                }
              />
            );
          })}
          {isStreaming &&
            isAwaitingFirstChunk &&
            (!imgGenFields?.partialImages ||
              imgGenFields.partialImages.length === 0) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="mx-auto flex w-full max-w-dvw justify-start gap-3 sm:max-w-3xl md:max-w-4xl">
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
      )}
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

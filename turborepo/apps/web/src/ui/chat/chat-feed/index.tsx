"use client";

import type { User } from "@/utils/auth-client";
import type { ReactNode } from "react";
import { useCallback, useEffect } from "react";
import { useChatScroll } from "@/context/chat-scroll-context";
import { useScrollObserver } from "@/hooks/use-scroll-observer";
import { useSelectionQuote } from "@/hooks/use-selection-quote";
import { SelectionToolbar } from "@/ui/chat/chat-selection";
import { MessageBubble } from "@/ui/chat/message-bubble";
import { motion } from "motion/react";
import type {
  AIChatResponseImgGenFieldsFinal,
  MessageSingleton
} from "@slipstream/types";
import { Button, ChevronDown } from "@slipstream/ui";
import { cn } from "@/lib/utils";
// import { useFallingEdgeTimer } from "@/hooks/use-falling-edge-timer";

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
  thinkingText,
  isThinking,
  isHome,
  thinkingDuration,
  imgGenEnabled,
  imgGenFields,
  imgGenAttachmentId,
  currentAiMsgId,
  children
}: ChatFeedProps) {
  const { scrollRef, setScrollState, showScrollButton, scrollToBottom } =
    useChatScroll();

  //const isTransitionState = useFallingEdgeTimer(isStreaming, 3000);

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

  // Use the scroll observer hook and sync state to context
  const { isNearBottom, showScrollButton: hookShowScrollButton } =
    useScrollObserver(scrollRef, {
      nearBottomThreshold: 200,
      scrollButtonThreshold: 100,
      debounceMs: 50
    });

  // Sync scroll state to context whenever it changes
  useEffect(() => {
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

  // Initial scroll to bottom on mount - ensures we always start at the bottom
  useEffect(() => {
    const initialScroll = () => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only on mount - component remounts on true navigation

  // Auto-scroll when messages change or streaming updates occur (only if near bottom)
  useEffect(() => {
    if (!scrollRef.current || !isNearBottom) return;

    // Use requestAnimationFrame for smooth scrolling
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [messages.length, streamedText, thinkingText, isAwaitingFirstChunk, isNearBottom]);

  return (
    <>
      {isHome ? (
        children
      ) : (
        <div className="relative flex flex-1 flex-col">
          <div
            ref={scrollRef}
            data-chat-feed
            className={`flex-1 space-y-6 overflow-y-auto px-4 py-6 ${className}`}>
            {messages?.map(message => {
              // Check if this is a streaming message or matches the current aiMsgId
              const isStreamingMessage = isStreaming && message.id.startsWith("streaming-");

              // For completed messages, check if it's an image gen message with the current aiMsgId
              const isCurrentImgGenMessage =
                message.senderType === "AI" &&
                message.messageType === "IMAGE_GEN" &&
                message.id === currentAiMsgId;

              const shouldReceiveAttachmentId = isCurrentImgGenMessage || typeof imgGenFields !== "undefined" || isStreamingMessage;

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  user={user}
                  onUpdateMessage={onUpdateMessage}
                  isStreaming={isStreamingMessage}
                  liveThinkingText={
                    isStreamingMessage
                      ? thinkingText
                      : undefined
                  }
                  liveIsThinking={
                    isStreamingMessage
                      ? isThinking
                      : undefined
                  }
                  liveThinkingDuration={
                    isStreamingMessage
                      ? thinkingDuration
                      : undefined
                  }
                  // Progressive image-gen data for streaming message
                  liveImgGenEnabled={
                    isStreamingMessage
                      ? imgGenEnabled
                      : undefined
                  }
                  liveImgGenFields={
                    isStreamingMessage
                      ? (imgGenFields ?? undefined)
                      : undefined
                  }
                  liveImgGenAttachmentId={
                    // Pass attachment ID for streaming messages and the specific AI message with matching ID
                    shouldReceiveAttachmentId
                      ? imgGenAttachmentId
                      : undefined
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
          {/* Floating scroll to bottom button */}
          <div className="pointer-events-none absolute bottom-6 left-0 right-0 flex justify-center px-4">
            <Button
              variant="secondary"
              size="icon"
              onClick={scrollToBottom}
              className={cn(
                "bg-background border-border pointer-events-auto h-8 w-8 rounded-full border shadow-lg transition-all duration-200 ease-[cubic-bezier(0.31,0.1,0.08,0.96)] hover:opacity-75 hover:shadow-xl",
                showScrollButton
                  ? "animate-floating-bob pointer-events-auto translate-y-0 opacity-50"
                  : "pointer-events-none translate-y-2 opacity-0"
              )}
              style={{ "--bob-multiplier": 0.7 } as React.CSSProperties}
              aria-label="Scroll to bottom">
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
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

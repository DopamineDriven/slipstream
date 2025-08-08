"use client";

import type { User } from "next-auth";
import type { Properties } from "csstype";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAIChatContext } from "@/context/ai-chat-context";
import { useModelSelection } from "@/context/model-selection-context";
import { providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import { AttachmentPopover } from "@/ui/chat/attachment-popover";
import { FullscreenTextInputDialog } from "@/ui/chat/fullscreen-text-input-dialog";
import { MobileModelSelectorDrawer } from "@/ui/chat/mobile-model-selector-drawer";
import { motion } from "motion/react";
import {
  Button,
  ChevronDown,
  Expand,
  Loader,
  Mic,
  SendMessage,
  Textarea,
  Tools
} from "@t3-chat-clone/ui";

const MAX_TEXTAREA_HEIGHT_PX = 120;
const INITIAL_TEXTAREA_HEIGHT_PX = 48;

interface UnifiedChatInputProps {
  user?: User;
  conversationId?: string;
  onUserMessage?: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function ChatInput({
  user: _user,
  conversationId,
  onUserMessage,
  disabled = false,
  placeholder,
  className
}: UnifiedChatInputProps) {
  const { isConnected, activeConversationId } = useAIChatContext();
  const { selectedModel, openDrawer } = useModelSelection();

  // Local state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExpandButton, setShowExpandButton] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFullScreenInputOpen, setIsFullScreenInputOpen] = useState(false);
  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const CurrentIcon = providerMetadata[selectedModel.provider].icon;

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }
    };
  }, []);

  // Monitor scroll state
  useEffect(() => {
    const checkScrollState = () => {
      const chatFeed = document.querySelector("[data-chat-feed]") as HTMLDivElement | null;
      if (!chatFeed) return;

      const distanceFromBottom = chatFeed.scrollHeight - (chatFeed.scrollTop + chatFeed.clientHeight);
      setShowScrollButton(distanceFromBottom > 100);
    };

    const chatFeed = document.querySelector("[data-chat-feed]");
    if (chatFeed) {
      chatFeed.addEventListener("scroll", checkScrollState, { passive: true });
      checkScrollState(); // Initial check
    }

    return () => {
      if (chatFeed) {
        chatFeed.removeEventListener("scroll", checkScrollState);
      }
    };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    ta.style.height = "auto";
    const h = Math.min(ta.scrollHeight, MAX_TEXTAREA_HEIGHT_PX);
    ta.style.height = `${h}px`;
    setShowExpandButton(ta.scrollHeight >= 90);
  }, [message]);

  const handleSend = useCallback(
    async (e?: React.FormEvent) => {
      if (e) {
        e.preventDefault();
      }

      const trimmedMessage = message.trim();
      if (!trimmedMessage || disabled || isSubmitting || !isConnected) return;

      setIsSubmitting(true);

      try {
        console.log(
          `[ChatInput] Sending message in conversation: ${activeConversationId ?? conversationId}`
        );

        // Call parent's handler if provided
        if (onUserMessage) {
          onUserMessage(trimmedMessage);
        }

        // Clear message immediately for better UX
        setMessage("");

        // Reset textarea height
        if (textareaRef.current) {
          textareaRef.current.style.height = `${INITIAL_TEXTAREA_HEIGHT_PX}px`;
        }
        setShowExpandButton(false);

        // Reset submitting state after a short delay
        submitTimeoutRef.current = setTimeout(() => {
          setIsSubmitting(false);
        }, 300);
      } catch (error) {
        console.error("Failed to send message:", error);
        setIsSubmitting(false);
      }
    },
    [message, onUserMessage, disabled, isSubmitting, isConnected, activeConversationId, conversationId]
  );

  const handleFullscreenSubmit = useCallback((fullText: string) => {
    setMessage(fullText);
    setIsFullScreenInputOpen(false);
    // Don't auto-send, let user review and send manually
  }, []);

  const handleAttachmentSelect = useCallback(
    (type: "file" | "camera" | "photo") => {
      console.log("Selected attachment type:", type);
      // TODO: Implement attachment logic
    },
    []
  );

  const handleScrollToBottom = () => {
    window.chatScrollToBottom?.();
  };

  const effectivePlaceholder = placeholder ?? `Message ${selectedModel.displayName}...`;
  const isDisabled = !isConnected || isSubmitting || disabled;

  return (
    <>
      <div className={cn("border-t bg-background px-4", className)}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mx-auto w-full max-w-3xl">
          {/* Scroll to bottom button */}
          <div className="relative">
            <div className="absolute w-full flex justify-center items-center top-[-40px] pointer-events-none">
              <Button
                variant="secondary"
                size="icon"
                onClick={handleScrollToBottom}
                className={cn(
                  "h-7 w-7 rounded-full shadow-lg hover:shadow-xl bg-background border border-border hover:opacity-50 pointer-events-auto",
                  "transition-all duration-200 ease-[cubic-bezier(0.31,0.1,0.08,0.96)]",
                  showScrollButton
                    ? "opacity-100 translate-y-0 pointer-events-auto animate-floating-bob"
                    : "opacity-0 translate-y-2 pointer-events-none"
                )}
                style={{ "--bob-multiplier": 0.7 }}
                aria-label="Scroll to bottom">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={handleSend}>
              {/* Unified Input Container - matching empty-chat-shell */}
              <div className="group bg-background focus-within:ring-ring/20 rounded-lg border transition-colors focus-within:ring-1 focus-within:ring-offset-0">
                {/* Main Text Input Area */}
                <div className="p-3 pb-2">
                  <Textarea
                    ref={textareaRef}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={effectivePlaceholder}
                    disabled={isDisabled}
                    className={cn(
                      "min-h-[60px] w-full resize-none border-none bg-transparent p-0 text-base leading-6 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
                      isDisabled ? "cursor-not-allowed" : ""
                    )}
                    rows={3}
                    style={{
                      maxHeight: `${MAX_TEXTAREA_HEIGHT_PX}px`
                    }}
                  />
                  {showExpandButton && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      title="Expand to fullscreen"
                      onClick={() => setIsFullScreenInputOpen(true)}
                      className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                      disabled={isSubmitting}>
                      <Expand className="size-4" />
                      <span className="sr-only">Expand to fullscreen</span>
                    </Button>
                  )}
                </div>

                {/* Controls Row - matching empty-chat-shell exactly */}
                <div className="bg-muted/20 flex items-center justify-between border-t px-3 py-2">
                  <div className="flex items-center space-x-2">
                    <AttachmentPopover
                      onSelectAttachment={handleAttachmentSelect}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Tools and settings"
                      className="text-muted-foreground hover:text-foreground hover:bg-accent h-8">
                      <Tools className="size-4" />
                      <span className="sr-only">Tools</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Voice to text"
                      className="text-muted-foreground hover:text-foreground hover:bg-accent h-8">
                      <Mic className="size-4" />
                      <span className="sr-only">Voice input</span>
                    </Button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isSubmitting}
                      onClick={openDrawer}
                      title={`Select model`}
                      className="text-muted-foreground hover:text-foreground hover:bg-accent h-8">
                      <CurrentIcon className="size-5" />
                      <span className="sr-only">{`Select model (current: ${selectedModel.displayName})`}</span>
                    </Button>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      title="Submit prompt"
                      className="text-muted-foreground hover:text-foreground hover:bg-accent h-8"
                      onClick={e => {
                        e.preventDefault();
                        handleSend();
                      }}
                      disabled={!message.trim() || isDisabled}>
                      {isSubmitting ? (
                        <Loader className="h-5 w-5 animate-spin" />
                      ) : (
                        <SendMessage className="size-5" />
                      )}
                      <span className="sr-only">{`Submit Prompt`}</span>
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </motion.div>
      </div>

      <FullscreenTextInputDialog
        isOpen={isFullScreenInputOpen}
        onOpenChange={setIsFullScreenInputOpen}
        initialValue={message}
        onSubmit={handleFullscreenSubmit}
      />
      <MobileModelSelectorDrawer />
    </>
  );
}

declare module "react" {
  export interface CSSProperties extends Properties<string | number> {
    "--bob-multiplier"?: number;
  }
}

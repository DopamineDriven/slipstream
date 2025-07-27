// src/ui/chat/message-input-bar/index.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAIChatContext } from "@/context/ai-chat-context";
import { useModelSelection } from "@/context/model-selection-context";
import { providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import { AttachmentPopover } from "@/ui/chat/attachment-popover";
import { FullscreenTextInputDialog } from "@/ui/chat/fullscreen-text-input-dialog";
import { MobileModelSelectorDrawer } from "@/ui/chat/mobile-model-selector-drawer";
import { motion } from "motion/react";
import { Button, Expand, Loader, Send, Textarea } from "@t3-chat-clone/ui";

const MAX_TEXTAREA_HEIGHT_PX = 120;
const INITIAL_TEXTAREA_HEIGHT_PX = 24;

export function MessageInputBar({
  onSendMessageAction: onSendMessage,
  disabled = false,
  placeholder
}: {
  onSendMessageAction: (message: string, isEditSubmit?: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { selectedModel, openDrawer } = useModelSelection();
  const { isConnected } = useAIChatContext();

  // Local state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExpandButton, setShowExpandButton] = useState(false);
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFullScreenInputOpen, setIsFullScreenInputOpen] = useState(false);
  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
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
    setShowExpandButton(ta.scrollHeight > 48);
  }, [message]);

  const handleSend = useCallback(
    async (e?: React.FormEvent) => {
      // Prevent default form submission if called from form submit
      if (e) {
        e.preventDefault();
      }

      const trimmedMessage = message.trim();
      if (!trimmedMessage || disabled || isSubmitting || !isConnected) return;

      setIsSubmitting(true);

      try {
        // Call parent's send handler
        onSendMessage(trimmedMessage);

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
    [message, onSendMessage, disabled, isSubmitting, isConnected]
  );

  const handleFullscreenSubmit = useCallback((fullText: string) => {
    setMessage(fullText);
    setIsFullScreenInputOpen(false);
    // Don't auto-send, let user review and send manually
  }, []);

  const handleAttachmentSelect = useCallback(
    (type: "file" | "camera" | "photo") => {
      console.log("Selected attachment type:", type);
      // TODO: Implement attachment logic here
    },
    []
  );

  const CurrentIcon = providerMetadata[selectedModel.provider].icon;

  const effectivePlaceholder =
    placeholder ?? `Message ${selectedModel.displayName}...`;

  const isDisabled = !isConnected || isSubmitting || disabled;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mx-auto w-full max-w-2xl">
        <form
          onSubmit={handleSend}
          className="bg-brand-component border-brand-border rounded-lg border-t p-2 sm:p-4">
          <div className="bg-brand-background border-brand-border relative flex min-h-[40px] items-center space-x-1 rounded-lg border p-2">
            <AttachmentPopover onSelectAttachment={handleAttachmentSelect} />
            <div className="relative flex min-h-[24px] flex-grow items-center">
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
                  "text-brand-text placeholder:text-brand-text-muted min-h-[24px] w-full resize-none border-none bg-transparent px-0 py-2 leading-6 focus-visible:outline-none",
                  isDisabled ? "cursor-not-allowed opacity-50" : ""
                )}
                rows={1}
                style={{
                  maxHeight: `${MAX_TEXTAREA_HEIGHT_PX}px`,
                  lineHeight: 1.5
                }}
              />
              {showExpandButton && !isSubmitting && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsFullScreenInputOpen(true)}
                  className="text-brand-text-muted hover:text-brand-text absolute top-1/2 right-2 -translate-y-1/2"
                  disabled={isDisabled}>
                  <Expand className="size-4" />
                  <span className="sr-only">Expand to fullscreen</span>
                </Button>
              )}
            </div>

            <div className="flex h-full items-center justify-center space-x-1">
              {/* Model selector button */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={isSubmitting || disabled}
                onClick={openDrawer}
                title={`Current model: ${selectedModel.displayName}`}
                className="text-brand-text-muted hover:text-brand-text hover:bg-brand-sidebar h-8 w-8">
                <CurrentIcon />
                <span className="sr-only">Select AI model</span>
              </Button>
              <Button
                type="submit"
                size="icon"
                className="bg-brand-primary text-brand-primary-foreground hover:bg-brand-primary/90 h-8 w-8"
                disabled={!message.trim() || isDisabled}>
                {isSubmitting ? (
                  <Loader className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
                <span className="sr-only">Send message</span>
              </Button>
            </div>
          </div>
        </form>
        <p className="text-brand-text-muted text-sxs mt-2 text-center sm:text-xs">
          AI can make mistakes. Consider checking important information.
        </p>
      </motion.div>
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

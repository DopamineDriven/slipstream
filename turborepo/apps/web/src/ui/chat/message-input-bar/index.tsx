"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useModelSelection } from "@/context/model-selection-context";
import { useAiChat } from "@/hooks/use-ai-chat";
import { providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import { AttachmentPopover } from "@/ui/attachment-popover";
import { FullscreenTextInputDialog } from "@/ui/fullscreen-text-input-dialog";
import { MobileModelSelectorDrawer } from "@/ui/mobile-model-select";
import { motion } from "motion/react";
import { useSession } from "next-auth/react";
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
  const { data: session } = useSession();
  const { isConnected } = useAiChat(session?.user?.id);
  // Local state for the input
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showExpandButton, setShowExpandButton] = useState(false);

  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [isFullScreenInputOpen, setIsFullScreenInputOpen] = useState(false);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const h = Math.min(ta.scrollHeight, MAX_TEXTAREA_HEIGHT_PX);
    ta.style.height = `${h}px`;
    setShowExpandButton(ta.scrollHeight > 48);
  }, [message]);

  const handleSend = useCallback(
    (e?: React.FormEvent) => {
      // Prevent default form submission if called from form submit
      if (e) {
        e.preventDefault();
      }

      if (!message.trim() || disabled || isSubmitting) return;

      setIsSubmitting(true);
      onSendMessage(message);
      setMessage("");
      setIsSubmitting(false);

      if (textareaRef.current) {
        textareaRef.current.style.height = `${INITIAL_TEXTAREA_HEIGHT_PX}px`;
      }
      setShowExpandButton(false);
    },
    [message, onSendMessage, disabled, isSubmitting]
  );

  const handleFullscreenSubmit = useCallback((full: string) => {
    setMessage(full);
    setIsFullScreenInputOpen(false);
    // Don't auto-send, let user review and send manually
  }, []);

  const handleAttachmentSelect = useCallback(
    (type: "file" | "camera" | "photo") => {
      console.log("Selected attachment type:", type);
      // TODO Implement attachment logic here
    },
    []
  );

  const CurrentIcon = providerMetadata[selectedModel.provider].icon;

  const effectivePlaceholder =
    placeholder ?? `Message ${selectedModel.displayName}...`;

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
                disabled={!isConnected || isSubmitting}
                className={cn(
                  "text-brand-text placeholder:text-brand-text-muted min-h-[24px] w-full resize-none border-none bg-transparent px-0 py-2 leading-6 focus-visible:outline-none",
                  !isConnected || isSubmitting
                    ? "cursor-not-allowed opacity-50"
                    : ""
                )}
                rows={1}
                style={{
                  maxHeight: `${MAX_TEXTAREA_HEIGHT_PX}px`,
                  lineHeight: 1.5
                }}
              />
              {showExpandButton && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsFullScreenInputOpen(true)}
                  className="text-brand-text-muted hover:text-brand-text absolute top-1/2 right-2 -translate-y-1/2"
                  disabled={isSubmitting || disabled}>
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
                disabled={
                  !message.trim() || !isConnected || isSubmitting || disabled
                }>
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

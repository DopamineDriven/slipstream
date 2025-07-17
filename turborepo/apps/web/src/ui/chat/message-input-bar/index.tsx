"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useModelSelection } from "@/context/model-selection-context";
import { providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import { AttachmentPopover } from "@/ui/attachment-popover";
import { FullscreenTextInputDialog } from "@/ui/fullscreen-text-input-dialog";
import { MobileModelSelectorDrawer } from "@/ui/mobile-model-select";
import { motion } from "motion/react";
import { Button, Loader, Send, Textarea } from "@t3-chat-clone/ui";

const MAX_TEXTAREA_HEIGHT_PX = 120;
const INITIAL_TEXTAREA_HEIGHT_PX = 24;

export function MessageInputBar({
  onSendMessageAction: onSendMessage,
  disabled = false,
  placeholder,
  className = ""
}: {
  onSendMessageAction: (message: string, isEditSubmit?: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { selectedModel } = useModelSelection();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [message, setMessage] = useState("");
  const [_showExpandButton, setShowExpandButton] = useState(false);
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

  const handleSend = useCallback(() => {
    if (!message.trim() || disabled) return;
    onSendMessage(message);
    setMessage("");
    if (textareaRef.current) {
      textareaRef.current.style.height = `${INITIAL_TEXTAREA_HEIGHT_PX}px`;
    }
    setShowExpandButton(false);
  }, [message, onSendMessage, disabled]);

  const handleFullscreenSubmit = useCallback((full: string) => {
    setMessage(full);
  }, []);

  const handleAttachmentSelect = useCallback(
    (type: "file" | "camera" | "photo") => {
      console.log("Selected attachment type:", type);
      // TODO Implement attachment logic here
    },
    []
  );

  const CurrentIcon = providerMetadata[selectedModel.provider].icon;

  const effectivePlaceholder = placeholder ?? `Message ${selectedModel.displayName}...`

  return (
    <>
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
        className={`bg-brand-component border-brand-border border-t p-2 sm:p-4 ${className}`}>
        <div className="bg-brand-background border-brand-border relative flex min-h-[40px] items-center space-x-1 rounded-lg border p-2">
          <AttachmentPopover onSelectAttachment={handleAttachmentSelect} />

          <div className="relative flex min-h-[24px] flex-grow items-center">
            <Textarea
              ref={textareaRef}
              name="inputbar"
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={effectivePlaceholder}
              disabled={disabled}
              className={cn(
                "text-brand-text placeholder:text-brand-text-muted min-h-[24px] w-full resize-none border-none bg-transparent px-0 py-2 leading-6 focus-visible:outline-none",
                disabled && "cursor-not-allowed opacity-50"
              )}
              rows={1}
              style={{
                maxHeight: `${MAX_TEXTAREA_HEIGHT_PX}px`,
                lineHeight: 1.5
              }}
            />
          </div>

          <div className="flex h-full items-center justify-center space-x-1">
            {/* 3️⃣ icon button now toggles our local drawer */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsDrawerOpen(true)}
              disabled={disabled}
              title={`Current model: ${selectedModel.displayName}`}
              className="text-brand-text-muted hover:text-brand-text hover:bg-brand-sidebar h-8 w-8">
              <CurrentIcon className="h-5 w-5" />
              <span className="sr-only">Select AI model</span>
            </Button>

            <Button
              size="icon"
              onClick={handleSend}
              className="bg-brand-primary text-brand-primaryForeground hover:bg-brand-primary/90 h-8 w-8"
              disabled={!message.trim() || disabled}>
              {disabled ? (
                <Loader className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
              <span className="sr-only">Send message</span>
            </Button>
          </div>
        </div>

        <p className="text-brand-text-muted mt-2 text-center text-[10px] sm:text-xs">
          AI can make mistakes. Consider checking important information.
        </p>
      </motion.div>

      <FullscreenTextInputDialog
        isOpen={isFullScreenInputOpen}
        onOpenChange={setIsFullScreenInputOpen}
        initialValue={message}
        onSubmit={handleFullscreenSubmit}
      />
      <MobileModelSelectorDrawer
        isOpen={isDrawerOpen}
        onOpenChangeAction={setIsDrawerOpen}
      />
    </>
  );
}

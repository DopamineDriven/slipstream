"use client";

import { Button, Icon, Textarea } from "@t3-chat-clone/ui";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { AttachmentPopover } from "@/ui/attachment-popover";
import { FullscreenTextInputDialog } from "@/ui/fullscreen-text-input-dialog";

interface MessageInputBarProps {
  onSendMessage: (message: string, modelId: string) => void;
  currentModelId: string;
  className?: string;
}

const MAX_TEXTAREA_HEIGHT_PX = 120;
const INITIAL_TEXTAREA_HEIGHT_PX = 24;

export function MessageInputBar({
  onSendMessage,
  currentModelId,
  className = ""
}: MessageInputBarProps) {
  const [message, setMessage] = useState("");
  const [showExpandButton, setShowExpandButton] = useState(false);
  const [isFullScreenInputOpen, setIsFullScreenInputOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSend = () => {
    if (message.trim()) {
      onSendMessage(message, currentModelId);
      setMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = `${INITIAL_TEXTAREA_HEIGHT_PX}px`;
      }
      setShowExpandButton(false);
    }
  };

  const handleAttachmentSelect = (type: "file" | "camera" | "photo") => {
    console.log("Selected attachment type:", type);
    // Implement attachment logic here
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;

      if (scrollHeight > 48 || scrollHeight >= MAX_TEXTAREA_HEIGHT_PX) {
        setShowExpandButton(true);
      } else {
        setShowExpandButton(false);
      }
    }
  }, [message]);

  const handleFullscreenSubmit = (fullScreenMessage: string) => {
    setMessage(fullScreenMessage);
  };

  return (
    <>
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
        className={`bg-brand-component border-brand-border border-t p-2 sm:p-4 ${className}`}>
        <div className="bg-brand-background border-brand-border relative flex items-end space-x-1 rounded-lg border p-2">
          <AttachmentPopover onSelectAttachment={handleAttachmentSelect} />

          <div className="relative flex-grow">
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
              placeholder="Type your message here..."
              className="text-brand-text placeholder:text-brand-text-muted min-h-[24px] w-full resize-none border-none bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
              rows={1}
              style={{ maxHeight: `${MAX_TEXTAREA_HEIGHT_PX}px` }}
            />
            {showExpandButton && (
              <Button
                variant="ghost"
                size="icon"
                className="text-brand-text-muted hover:text-brand-text absolute top-0 right-0 h-7 w-7 sm:hidden"
                onClick={() => setIsFullScreenInputOpen(true)}>
                <Icon.Expand className="h-4 w-4" />
                <span className="sr-only">Expand input</span>
              </Button>
            )}
          </div>

          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="icon"
              className="text-brand-text-muted hover:text-brand-text hover:bg-brand-sidebar hidden h-8 w-8 sm:inline-flex sm:h-auto sm:w-auto">
              <Icon.Search className="h-5 w-5" />
              <span className="sr-only">Search</span>
            </Button>
            <Button
              size="icon"
              onClick={handleSend}
              className="bg-brand-primary text-brand-primaryForeground hover:bg-brand-primary/90 h-8 w-8 sm:h-auto sm:w-auto"
              disabled={!message.trim()}>
              <Icon.Send className="h-5 w-5" />
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
    </>
  );
}

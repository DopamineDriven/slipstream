"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTTSContext } from "@/context/tts-context";
import { cn } from "@/lib/utils";
import { AnimatedCopyButtonWithText } from "@/ui/atoms/animated-copy-button-with-text";
import type { $Enums } from "@slipstream/db/node/generated/client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EllipsisHorizontal,
  ReadAloud as ReadAloudIcon
} from "@slipstream/ui";

interface MessageActionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageContent: string;
  messageId: string;
  conversationId: string;
  senderType: $Enums.SenderType;
}

export function MessageActionsDialog({
  open,
  onOpenChange,
  messageContent,
  messageId,
  conversationId,
  senderType
}: MessageActionsDialogProps) {
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const tts = useTTSContext();

  const isTTSActive =
    tts.currentPlaybackMessageId === messageId ||
    (tts.isGenerating && tts.activeMessageId === messageId);

  const handleReadAloud = useCallback(() => {
    if (isTTSActive) {
      tts.stop();
    } else {
      tts.requestTTS(messageId, conversationId);
    }
    onOpenChange(false);
  }, [isTTSActive, tts, messageId, conversationId, onOpenChange]);

  const handleCopyComplete = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = setTimeout(() => {
      onOpenChange(false);
      closeTimerRef.current = null;
    }, 1500);
  };

  const handleMoreOptions = () => {
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open && closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [open]);

  const isReadAloudDisabled = useMemo(
    () => tts.isGenerating && !isTTSActive,
    [tts.isGenerating, isTTSActive]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="mx-0.5 sm:max-w-md"
        aria-description="copy, read aloud, or more opts">
        <DialogHeader>
          <DialogTitle className="text-center">Message Actions</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-center gap-8 py-6">
          {/* Copy Action */}
          <div className="flex w-full flex-col items-center gap-2">
            <AnimatedCopyButtonWithText
              textToCopy={messageContent}
              variant="ghost"
              className="flex h-auto w-full items-center justify-start gap-3 rounded-none px-6 py-4 text-left text-base font-normal"
              copiedDuration={1500}
              onCopyComplete={handleCopyComplete}>
              Copy
            </AnimatedCopyButtonWithText>
          </div>

          {/* Read Aloud Action (AI messages only) */}
          {senderType === "AI" && (
            <div className="flex flex-col items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                disabled={isReadAloudDisabled}
                className={cn(
                  "h-12 w-12 rounded-full bg-transparent",
                  isTTSActive && "text-foreground drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]",
                  tts.isGenerating && tts.activeMessageId === messageId && "animate-pulse"
                )}
                onClick={handleReadAloud}>
                <ReadAloudIcon className="h-9 w-9" />
              </Button>
              <span className="sr-only">Read Aloud</span>
            </div>
          )}

          {/* More Options Action */}
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-12 w-12 rounded-full bg-transparent"
              onClick={handleMoreOptions}>
              <EllipsisHorizontal className="h-9 w-9" />
            </Button>
            <span className="sr-only">More</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

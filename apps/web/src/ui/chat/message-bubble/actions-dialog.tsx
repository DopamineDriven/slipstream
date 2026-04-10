"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTTSContext } from "@/context/tts-context";
import { cn } from "@/lib/utils";
import { AnimatedCopyButtonWithText } from "@/ui/atoms/animated-copy-button-with-text";
import type { MessageSingleton } from "@slipstream/types";
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
  msg: MessageSingleton<true>;
}

export function msgContentHelper(msg: MessageSingleton<true>) {
  const textBlocks = Array.of<string>();

  if (msg.messageBlocks) {
    for (const v of msg.messageBlocks.toSorted(
      (a, b) => a.ordinal - b.ordinal
    )) {
      if (v.type === "TEXT") {
        textBlocks.push(v.content);
      }
    }
  }

  return textBlocks.length > 0 ? textBlocks.join(`\n`) : msg.content;
}

export function MessageActionsDialog({
  open,
  onOpenChange,
  msg
}: MessageActionsDialogProps) {
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const {
    currentPlaybackMessageId,
    activeMessageId,
    requestTTS,
    isGenerating,
    stop
  } = useTTSContext();

  const primerRef = useRef<HTMLAudioElement | null>(null);

  const hasPlayedPrimer = useRef(false);

  useEffect(() => {
      if (!open) return;
  if (primerRef.current) return; 
    const el = new Audio("/cassette-shortened.mp3");
    el.volume = 0.1;
    el.preload = "auto";
    el.onended = () => {
      hasPlayedPrimer.current = true;
    };
    primerRef.current = el;

    return () => {
      el.onended = null;
      el.pause();
      primerRef.current = null;
    };
  }, [open]);

  const isTTSActive =
    currentPlaybackMessageId === msg.id ||
    (isGenerating && activeMessageId === msg.id);

  const handleReadAloud = useCallback(() => {
    if (isTTSActive) {
      stop();
    } else {
      if (primerRef.current && !hasPlayedPrimer.current) {
        void primerRef.current.play().catch(() => {});
      }
      requestTTS(msg.id, msg.conversationId);
    }
    onOpenChange(false);
  }, [isTTSActive, stop, requestTTS, msg.id, msg.conversationId, onOpenChange]);

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
    () => isGenerating && !isTTSActive,
    [isGenerating, isTTSActive]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="mx-0.5 sm:max-w-md"
        aria-description="copy, read aloud, or more opts">
        <DialogHeader>
          <DialogTitle className="sr-only">Message Actions</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center gap-8 py-6">
          <div className="flex w-full flex-col items-center gap-2">
            <AnimatedCopyButtonWithText
              textToCopy={msgContentHelper(msg)}
              variant="ghost"
              className="flex h-auto w-full items-center justify-start gap-3 rounded-none px-6 py-4 text-left text-base font-normal"
              copiedDuration={1500}
              onCopyComplete={handleCopyComplete}>
              Copy
            </AnimatedCopyButtonWithText>
          </div>
          {msg.senderType === "AI" && (
            <div className="flex flex-col items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                disabled={isReadAloudDisabled}
                className={cn(
                  "h-12 w-12 rounded-full bg-transparent",
                  isTTSActive &&
                    "text-foreground drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]",
                  isGenerating && activeMessageId === msg.id
                    ? "animate-pulse"
                    : ""
                )}
                onClick={handleReadAloud}>
                <ReadAloudIcon className="h-9 w-9" />
              </Button>
              <span className="sr-only">Read Aloud</span>
            </div>
          )}
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

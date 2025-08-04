"use client";

import { useEffect, useRef } from "react";
import { AnimatedCopyButtonWithText } from "@/ui/atoms/animated-copy-button-with-text";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EllipsisHorizontal,
  ShareIcon as Share
} from "@t3-chat-clone/ui";

interface MessageActionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageContent: string;
}

export function MessageActionsDialog({
  open,
  onOpenChange,
  messageContent
}: MessageActionsDialogProps) {
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handleShare = () => {
    onOpenChange(false);
  };

  const handleCopyComplete = () => {
    // Clear any existing timer
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    // Set new timer to close dialog
    closeTimerRef.current = setTimeout(() => {
      onOpenChange(false);
      closeTimerRef.current = null;
    }, 1500);
  };

  const handleMoreOptions = () => {
    console.log("More options clicked");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="mx-0.5 sm:max-w-md"
        aria-description="copy, share, or more opts">
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

          {/* Share Action */}
          {
            <div className="flex flex-col items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12 rounded-full bg-transparent"
                onClick={handleShare}>
                <Share className="h-9 w-9" />
              </Button>
              <span className="sr-only">Share</span>
            </div>
          }

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

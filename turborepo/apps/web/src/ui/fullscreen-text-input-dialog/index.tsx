"use client";

import { Button, Icon, Textarea } from "@t3-chat-clone/ui";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/ui/atoms/dialog";

interface FullscreenTextInputDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  initialValue: string;
  onSubmit: (value: string) => void;
}

export function FullscreenTextInputDialog({
  isOpen,
  onOpenChange,
  initialValue,
  onSubmit
}: FullscreenTextInputDialogProps) {
  const [text, setText] = useState(initialValue);

  useEffect(() => {
    if (isOpen) {
      setText(initialValue);
    }
  }, [isOpen, initialValue]);

  const handleSubmit = () => {
    onSubmit(text);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="bg-brand-component border-brand-border text-brand-text flex h-[90vh] w-[95vw] flex-col p-0 sm:h-[80vh] sm:max-w-2xl">
        <DialogHeader className="border-brand-border flex flex-row items-center justify-between border-b p-4">
          <DialogTitle className="text-brand-text-emphasis">
            Compose Message
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="text-brand-text-muted hover:text-brand-text">
            <Icon.X className="h-5 w-5" />
          </Button>
        </DialogHeader>
        <div className="flex-grow overflow-hidden p-4">
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Type your detailed message here..."
            className="bg-brand-background border-brand-border text-brand-text placeholder:text-brand-text-muted h-full w-full resize-none text-base focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
          />
        </div>
        <DialogFooter className="border-brand-border border-t p-4">
          <Button
            onClick={handleSubmit}
            className="bg-brand-primary text-brand-primaryForeground hover:bg-brand-primary/90">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/ui/atoms/popover";
import { Button, Camera, FileText, ImageIcon, Plus } from "@t3-chat-clone/ui";

interface AttachmentPopoverProps {
  onSelectAttachment: (type: "file" | "camera" | "photo") => void;
}

const attachmentOptions = [
  { id: "file", label: "Files", icon: FileText },
  { id: "camera", label: "Camera", icon: Camera },
  { id: "photo", label: "Photos", icon: ImageIcon }
];

export function AttachmentPopover({
  onSelectAttachment
}: AttachmentPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-brand-text-muted hover:text-brand-text hover:bg-brand-sidebar h-8 w-8 sm:h-auto sm:w-auto">
          <Plus className="size-5" />
          <span className="sr-only">Attach</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="bg-brand-sidebar border-brand-border text-brand-text w-48 p-2"
        side="top"
        align="center">
        <div className="space-y-1">
          {attachmentOptions.map(opt => {
            const IconOpt = opt.icon;
            return (
              <Button
                key={opt.id}
                variant="ghost"
                className="hover:bg-brand-component w-full justify-start"
                onClick={() =>
                  onSelectAttachment(opt.id as "file" | "camera" | "photo")
                }>
                <IconOpt className="mr-2 h-4 w-4" />
                {opt.label}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import {
  Button,
  Camera,
  FileText,
  ImageIcon,
  Plus,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@t3-chat-clone/ui";

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
          title="Attach"
          className="text-muted-foreground hover:text-foreground hover:bg-accent h-8 sm:h-auto sm:w-auto">
          <Plus className="size-4" />
          <span className="sr-only">Attach</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" side="top" align="center">
        <div className="space-y-1">
          {attachmentOptions.map(opt => {
            const IconOpt = opt.icon;
            return (
              <Button
                key={opt.id}
                variant="ghost"
                className="hover:bg-accent w-full justify-start"
                onClick={() =>
                  onSelectAttachment(opt.id as "file" | "camera" | "photo")
                }>
                <IconOpt className="mr-2 size-4" />
                {opt.label}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { useCallback, useRef } from "react";
import {
  Button,
  Camera,
  FileText,
  ImageIcon,
  Plus,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@slipstream/ui";

interface AttachmentPopoverProps {
  onFilesSelected?: (files: File[]) => void;
}

const attachmentOptions = [
  { id: "file", label: "Files", icon: FileText },
  { id: "camera", label: "Camera", icon: Camera },
  { id: "photo", label: "Photos", icon: ImageIcon }
] as const;

export function AttachmentPopover({ onFilesSelected }: AttachmentPopoverProps) {
  // Create refs for hidden file inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection from inputs
  const handleFileSelection = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);
      onFilesSelected?.(fileArray);
    },
    [onFilesSelected]
  );

  // Handle attachment button clicks
  const handleAttachmentClick = useCallback(
    (type: "file" | "camera" | "photo") => {
      // Trigger appropriate file input
      switch (type) {
        case "file":
          fileInputRef.current?.click();
          break;
        case "photo":
          photoInputRef.current?.click();
          break;
        case "camera":
          cameraInputRef.current?.click();
          break;
      }
    },
    []
  );

  return (
    <>
      {/* Hidden file inputs */}
      {/* General file input - documents, PDFs, etc */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => handleFileSelection(e.target.files)}
        accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.zip,application/*,text/*"
      />
      {/* Photo/Video gallery input */}
      <input
        ref={photoInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => handleFileSelection(e.target.files)}
        accept="image/*,video/*"
      />
      {/* Camera input - opens camera on mobile */}
      <input
        ref={cameraInputRef}
        type="file"
        className="hidden"
        onChange={e => handleFileSelection(e.target.files)}
        accept="image/*"
        capture="environment"
      />
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
            {attachmentOptions.map(opt => (
              <Button
                key={opt.id}
                variant="ghost"
                className="hover:bg-accent w-full justify-start"
                onClick={() => handleAttachmentClick(opt.id)}>
                <opt.icon className="mr-2 size-4" />
                {opt.label}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

"use client";

import { cn } from "@/lib/utils";
import { UIMessage } from "@/types/shared";
import { AttachmentDisplay } from "@/ui/chat/attachment-display/index";

interface MessageAttachmentsProps {
  attachments?: UIMessage["attachments"];
  className?: string;
  isUser?: boolean;
}

export function MessageAttachments({
  attachments,
  className,
  isUser = false
}: MessageAttachmentsProps) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div className={cn("mt-3", className)}>
      <div
        className={cn(
          "mb-2 text-xs font-medium",
          isUser ? "text-foreground/80" : "text-muted-foreground"
        )}>
        {attachments.length === 1
          ? "Attachment"
          : `${attachments.length} Attachments`}
      </div>
      <AttachmentDisplay attachments={attachments} />
    </div>
  );
}

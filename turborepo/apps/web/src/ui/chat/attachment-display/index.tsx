"use client";

import type { UIMessage } from "@/types/shared";
import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Unenumerate } from "@t3-chat-clone/types";
import {
  Button,
  Card,
  ArrowDownCircle as Download,
  Eye,
  FileText,
  ImageIcon,
  X
} from "@t3-chat-clone/ui";

// Define attachment types based on the Prisma schema
export type MessageAttachment = Unenumerate<UIMessage["attachments"]>;

interface AttachmentDisplayProps {
  attachments: UIMessage["attachments"];
  className?: string;
  compact?: boolean;
}

export function AttachmentDisplay({
  attachments,
  className,
  compact = false
}: AttachmentDisplayProps) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  if (!attachments || attachments.length === 0) {
    return null;
  }

  const formatFileSize = (bytes?: bigint): string => {
    if (!bytes) return "Unknown size";
    const size = Number(bytes);
    const units = ["B", "KB", "MB", "GB"];
    let unitIndex = 0;
    let fileSize = size;

    while (fileSize >= 1024 && unitIndex < units.length - 1) {
      fileSize /= 1024;
      unitIndex++;
    }

    return `${fileSize.toFixed(1)} ${units[unitIndex]}`;
  };

  const getFileIcon = (attachment: MessageAttachment) => {
    switch (attachment.assetType) {
      case "IMAGE":
        return <ImageIcon className="h-4 w-4" />;
      case "DOCUMENT":
        return <FileText className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getDisplayUrl = (attachment: MessageAttachment): string | null => {
    return attachment.cdnUrl ?? null;
  };

  const handleImageClick = (url: string) => {
    setExpandedImage(url);
  };

  const handleDownload = (attachment: MessageAttachment) => {
    const url = getDisplayUrl(attachment);
    if (url) {
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.filename ?? "download";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <>
      <div className={cn("mt-2 space-y-2", className)}>
        {attachments.map(attachment => {
          const displayUrl = getDisplayUrl(attachment);
          const isImage = attachment.assetType === "IMAGE" && displayUrl;

          if (isImage && !compact) {
            return (
              <div key={attachment.id} className="relative">
                <Image
                  src={
                    displayUrl ??
                    "/placeholder.svg?height=200&width=300&query=attachment"
                  }
                  alt={attachment.filename ?? "Attachment"}
                  className="max-h-64 max-w-sm cursor-pointer rounded-lg border transition-opacity hover:opacity-90"
                  onClick={() => handleImageClick(displayUrl)}
                />
                <div className="absolute top-2 right-2 flex gap-1">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-6 w-6 border-none bg-black/50 text-white hover:bg-black/70"
                    onClick={() => handleImageClick(displayUrl)}>
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-6 w-6 border-none bg-black/50 text-white hover:bg-black/70"
                    onClick={() => handleDownload(attachment)}>
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          }

          return (
            <Card key={attachment.id} className="p-3">
              <div className="flex items-center gap-3">
                <div className="text-muted-foreground flex-shrink-0">
                  {getFileIcon(attachment)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {attachment.filename ?? "Untitled"}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {formatFileSize(attachment.size)}
                    {attachment.ext && ` • ${attachment.ext.toUpperCase()}`}
                  </div>
                </div>
                <div className="flex gap-1">
                  {isImage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleImageClick(displayUrl)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDownload(attachment)}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Image modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setExpandedImage(null)}>
          <div className="relative max-h-screen max-w-full overflow-auto">
            <Image
              src={
                expandedImage ||
                "/placeholder.svg?height=400&width=600&query=expanded attachment"
              }
              alt="Expanded attachment"
              className="max-h-full max-w-full object-contain"
              onClick={e => e.stopPropagation()}
            />
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-4 right-4 border-none bg-black/50 text-white hover:bg-black/70"
              onClick={() => setExpandedImage(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

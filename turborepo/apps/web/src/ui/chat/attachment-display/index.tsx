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
  const [expanded, setExpanded] = useState<
    | { url: string; kind: "image" | "pdf" }
    | null
  >(null);

  if (!attachments || attachments.length === 0) {
    return null;
  }

  const formatFileSize = (bytes?: bigint | number): string => {
    if (!bytes) return "Unknown size";
    const size = typeof bytes === "bigint" ? Number(bytes) : bytes;
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
    switch (attachment?.assetType) {
      case "IMAGE":
        return <ImageIcon className="h-4 w-4" />;
      case "DOCUMENT":
        return <FileText className="h-4 w-4" />;
      case "AUDIO":
      case "UNKNOWN":
      case "VIDEO":
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  // Only use CDN URLs; S3 buckets are private and publicUrl may not be usable
  const getDisplayUrl = (attachment: MessageAttachment): string | null => {
    return attachment?.cdnUrl ?? null;
  };

  const handlePreview = (url: string, kind: "image" | "pdf") => {
    setExpanded({ url, kind });
  };

  const handleDownload = (attachment: MessageAttachment) => {
    const url = getDisplayUrl(attachment);
    if (url) {
      const link = document.createElement("a");
      link.href = url;
      link.target ="_blank";
      link.rel ="noreferrer noopener"
      link.download = attachment?.filename ?? "download";
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
          const isImage =
            (attachment.mime?.startsWith("image/") ??
              attachment.assetType === "IMAGE") && Boolean(displayUrl);
          const isPdf =
            (attachment.mime?.toLowerCase().includes("application/pdf") ??
              attachment.ext?.toLowerCase() === "pdf") && Boolean(displayUrl);

          // Full image preview only when we have a real URL
          if (isImage && !compact && displayUrl) {
            return (
              <div
                key={attachment.id}
                className="relative inline-block h-64 w-full max-w-[90dvw] cursor-pointer rounded-lg border md:max-w-sm"
                onClick={() => handlePreview(displayUrl, "image")}>
                <Image
                  src={displayUrl}
                  alt={attachment.filename ?? "Attachment"}
                  fill
                  sizes="(max-width: 768px) 90dvw, 24rem"
                  className="rounded-lg object-contain transition-opacity hover:opacity-90"
                />
                <div className="absolute top-2 right-2 flex gap-1">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-6 w-6 border-none bg-black/50 text-white hover:bg-black/70"
                    onClick={e => {
                      e.stopPropagation();
                      handlePreview(displayUrl, "image");
                    }}>
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-6 w-6 border-none bg-black/50 text-white hover:bg-black/70"
                    onClick={e => {
                      e.stopPropagation();
                      handleDownload(attachment);
                    }}>
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
                    {formatFileSize(attachment?.size ?? undefined)}
                    {attachment.ext && ` • ${attachment.ext.toUpperCase()}`}
                  </div>
                </div>
                <div className="flex gap-1">
                  {(isImage || isPdf) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        displayUrl &&
                        handlePreview(displayUrl, isPdf ? "pdf" : "image")
                      }
                      disabled={!displayUrl}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDownload(attachment)}
                    disabled={!displayUrl}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Modal (image/pdf) */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 sm:p-6"
          onClick={() => setExpanded(null)}
          style={{
            // Improve safe-area tap targets on iOS
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            paddingLeft: "max(1rem, env(safe-area-inset-left))",
            paddingRight: "max(1rem, env(safe-area-inset-right))"
          }}>
          {/* Close button anchored to viewport so it stays accessible */}
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-4 top-4 border-none bg-black/60 text-white hover:bg-black/70"
            onClick={e => {
              e.stopPropagation();
              setExpanded(null);
            }}
            aria-label="Close preview">
            <X className="h-4 w-4" />
          </Button>

          {/* Content container */}
          <div className="relative flex h-[92dvh] w-[96dvw] items-center justify-center">
            {expanded.kind === "image" ? (
              <div className="pointer-events-auto relative h-full w-full select-none" onClick={e => e.stopPropagation()}>
                <Image
                  src={
                    expanded.url ||
                    "/placeholder.svg?height=400&width=600&query=expanded attachment"
                  }
                  alt="Expanded attachment"
                  fill
                  sizes="96dvw"
                  className="rounded-md object-contain"
                />
              </div>
            ) : (
              <div
                className="pointer-events-auto relative h-[92dvh] w-[96dvw]"
                onClick={e => e.stopPropagation()}>
                <iframe
                  src={`${expanded.url}#toolbar=1&navpanes=0&statusbar=0&view=FitH`}
                  className="h-full w-full rounded-md bg-white"
                  title="PDF preview"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

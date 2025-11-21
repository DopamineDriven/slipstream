"use client";

import type { ExpandedImgSpecs } from "@d0paminedriven/metadata";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { imgSrcMapper } from "@/lib/img-helper";
import { cn } from "@/lib/utils";
import type { AttachmentSingleton } from "@slipstream/types";
import {
  Button,
  Card,
  Download,
  Eye,
  FileText,
  ImageIcon,
  X
} from "@slipstream/ui";

interface AttachmentDisplayProps {
  attachments: AttachmentSingleton<true>[];
  className?: string;
  compact?: boolean;
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

function isNextImageCompat(props: ExpandedImgSpecs["format"]) {
  return /^(png|jpeg|jpg|webp|avif|svg)$/gm.test(props);
}

const getFileIcon = (attachment: AttachmentSingleton<true>) => {
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
const getDisplayUrl = (
  attachment: AttachmentSingleton<true>
): string | null => {
  return attachment?.cdnUrl ?? null;
};

const handleDownload = (attachment: AttachmentSingleton<true>) => {
  const url = getDisplayUrl(attachment);
  if (url) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.download = attachment?.filename ?? "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

const markdownCache = new Map<string, React.ReactNode>();

export function AttachmentDisplay({
  attachments,
  className,
  compact = false
}: AttachmentDisplayProps) {
  const [expanded, setExpanded] = useState<{
    url: string;
    kind: "image" | "pdf" | "md";
    format: string;
  } | null>(null);

  const [rendered, setRendered] = useState<React.ReactNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    if (!expanded?.url) return;
    if (!expanded.url.endsWith("md")) return;
    const cacheKey = `attachment-md:${expanded?.url}`;
    const cached = markdownCache.get(cacheKey);
    if (cached) {
      setRendered(cached);
      return;
    }

    if (processingRef.current) return;
    processingRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        // 1) fetch the raw markdown from your CDN
        const res = await fetch(expanded.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();

        // 2) process with the same helper you use in the bubble component
        const { processMarkdownToReact } = await import("@/lib/processor");
        const processed = await processMarkdownToReact(text);

        if (!cancelled) {
          markdownCache.set(cacheKey, processed);
          // evict oldest if you care
          if (markdownCache.size > 50) {
            const firstKey = markdownCache.keys().next().value;
            if (firstKey) markdownCache.delete(firstKey);
          }
          setRendered(processed);
        }
      } catch (err) {
        console.error("Markdown attachment processing error:", err);
        if (!cancelled) {
          setError("Failed to render markdown attachment.");
          setRendered(
            <div className="text-sm text-red-500">
              Error rendering markdown attachment.
            </div>
          );
        }
      } finally {
        processingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expanded?.url]);

  const handlePreview = useCallback(
    (url: string, kind: "image" | "pdf" | "md", format: string) => {
      setExpanded({ url, kind, format });
    },
    []
  );

  const clickcb = useCallback(
    (_e: React.MouseEvent<HTMLButtonElement | SVGSVGElement, MouseEvent>) => {
      setExpanded(null);
    },
    []
  );
  if (!attachments) {
    return null;
  }
  return (
    <>
      <div className={cn("mt-2 space-y-2", className)}>
        {attachments.map(attachment => {
          const displayUrl = getDisplayUrl(attachment);
          const isImage = attachment.assetType === "IMAGE";

          const isPdf =
            attachment.assetType === "DOCUMENT" && attachment.ext === "pdf";
          const isMd =
            attachment.assetType === "DOCUMENT" && attachment.ext === "md";
          // Full image preview only when we have a real URL
          if (
            attachment.assetType === "IMAGE" &&
            attachment.ext &&
            !compact &&
            attachment.cdnUrl !== null
          ) {
            return (
              <div
                key={attachment.id}
                className="relative inline-block h-64 w-full max-w-[90dvw] cursor-pointer rounded-lg border md:max-w-sm"
                onClick={() =>
                  attachment.cdnUrl
                    ? handlePreview(
                        attachment.cdnUrl,
                        "image",
                        attachment.ext ?? "jpeg"
                      )
                    : () => {}
                }>
                <Image
                  src={attachment.cdnUrl}
                  unoptimized={
                    !isNextImageCompat(
                      attachment.ext as ExpandedImgSpecs["format"]
                    ) || imgSrcMapper.includes(attachment.ext)
                      ? false
                      : true
                  }
                  fill
                  alt={attachment.filename ?? "Attachment"}
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
                      attachment.cdnUrl
                        ? handlePreview(
                            attachment.cdnUrl,
                            "image",
                            attachment.ext ?? "jpeg"
                          )
                        : null;
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
                <div className="text-muted-foreground shrink-0">
                  {getFileIcon(attachment)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {`${attachment.filename ?? "Untitled"} | ${attachment.size ? formatFileSize(attachment.size) : ""}`}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {attachment.assetType === "IMAGE"
                      ? attachment.image?.colorSpace
                      : attachment.document?.pageCount
                          ?.toString(10)
                          .concat(" pages")}
                    {attachment.ext && ` • ${attachment.ext.toUpperCase()}`}
                  </div>
                </div>
                <div className="flex gap-1">
                  {(isImage || isPdf || isMd) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        attachment.cdnUrl
                          ? handlePreview(
                              attachment.cdnUrl,
                              isPdf ? "pdf" : isMd ? "md" : "image",
                              !isPdf
                                ? !isMd
                                  ? attachment.ext
                                    ? (attachment.ext as ExpandedImgSpecs["format"])
                                    : "jpeg"
                                  : "md"
                                : "pdf"
                            )
                          : () => {}
                      }
                      disabled={!displayUrl}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDownload(attachment)}
                    disabled={!displayUrl}>
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
            className="absolute top-4 right-4 border-none bg-black/60 text-white hover:bg-black/70"
            onClick={clickcb}
            aria-label="Close preview">
            <X onClick={clickcb} className="h-4 w-4" />
          </Button>

          {/* Content container */}
          <div className="relative flex h-[92dvh] w-[96dvw] items-center justify-center">
            {expanded.kind === "image" ? (
              <div
                className="pointer-events-auto relative h-full w-full select-none"
                onClick={e => e.stopPropagation()}>
                <Image
                  src={expanded.url ?? "/doge-404.jpg"}
                  alt="Expanded attachment"
                  fill
                  sizes="96dvw"
                  className="rounded-md object-contain"
                  unoptimized={
                    !isNextImageCompat(
                      expanded.format as ExpandedImgSpecs["format"]
                    ) || imgSrcMapper.includes(expanded.url)
                      ? false
                      : true
                  }
                />
              </div>
            ) : expanded.kind === "pdf" ? (
              <div
                className="pointer-events-auto relative h-[92dvh] w-[96dvw]"
                onClick={e => e.stopPropagation()}>
                <iframe
                  src={`${expanded.url}#toolbar=1&navpanes=0&statusbar=0&view=Fit&zoom=80`}
                  className="h-full w-full rounded-md bg-white"
                  title="PDF preview"
                  allowFullScreen
                  aria-readonly="false"
                  suppressContentEditableWarning
                  suppressHydrationWarning
                  allow="fullscreen; display-capture;"
                />
              </div>
            ) : (
              <div
                className="pointer-events-auto relative h-[92dvh] w-[96dvw]"
                onClick={e => e.stopPropagation()}>
                <div className="leading-relaxed text-pretty whitespace-pre-wrap">
                  {rendered ?? error}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

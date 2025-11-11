```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useAIChatContext } from "@/context/ai-chat-context";
import { Button, Download, Eye } from "@slipstream/ui";

interface ImageGenerationCanvasProps {
  isGenerating: boolean;
  images: string[];
  currentImageIndex: number;
  width: number;
  height: number;
  prompt?: string;
  attachmentId?: string;
}

export function ImageGenerationCanvasTest({
  isGenerating,
  images,
  height,
  width,
  currentImageIndex,
  prompt,
  attachmentId
}: ImageGenerationCanvasProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [effectiveAttachmentId, setEffectiveAttachmentId] = useState<string | undefined>(attachmentId);

  // Persist IDs to handle the gap between streaming end and real ID arrival
  const realAttachmentIdRef = useRef<string | null>(null);
  const lastStreamingIdRef = useRef<string | null>(null);

  // Get the real attachment ID from context if available
  const { currentImgGenAttachmentId } = useAIChatContext();

  // Watch for attachment ID changes from context
  useEffect(() => {
    // Track streaming IDs
    if (attachmentId?.startsWith('streaming-')) {
      lastStreamingIdRef.current = attachmentId;
    }

    // If we get a real attachment ID from context, persist and use it
    if (currentImgGenAttachmentId?.length === 24) {
      realAttachmentIdRef.current = currentImgGenAttachmentId;
      setEffectiveAttachmentId(currentImgGenAttachmentId);
    } else if (realAttachmentIdRef.current) {
      // Once we have a real ID, always use it
      setEffectiveAttachmentId(realAttachmentIdRef.current);
    } else if (attachmentId) {
      // Use the current prop if available
      setEffectiveAttachmentId(attachmentId);
    } else if (lastStreamingIdRef.current) {
      // Fall back to last known streaming ID during the gap
      setEffectiveAttachmentId(lastStreamingIdRef.current);
    }
    // We intentionally never set to undefined - maintain stable IDs
  }, [currentImgGenAttachmentId, attachmentId]);

  const currentImageUrl = images[currentImageIndex] ?? null;
  const isPartialImage =
    currentImageUrl && currentImageIndex < images.length - 1;
  const isFinalImage =
    currentImageUrl && currentImageIndex === images.length - 1;

  return (
    <div
      id={effectiveAttachmentId ? `attachment-${effectiveAttachmentId}` : undefined}
      data-attachment-id={effectiveAttachmentId ?? undefined}
      className="bg-muted group relative mx-auto aspect-square w-full max-w-3xl overflow-hidden rounded-2xl">
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-500",
          isGenerating && !currentImageUrl ? "opacity-100" : "opacity-0"
        )}>
        <div className="ripple-container" />
      </div>

      {currentImageUrl && (
        <div
          className={cn(
            "absolute inset-0 transition-all duration-700 ease-out",
            imageLoaded || isPartialImage
              ? "scale-100 opacity-100"
              : "scale-95 opacity-0"
          )}>
          <Image
            src={currentImageUrl ?? "/placeholder.svg"}
            alt={"/placeholder.svg"}
            width={width}
            height={height}
            className="h-full w-full flex-1 object-cover"
            onLoad={() => setImageLoaded(true)}
            onLoadStart={() => setImageLoaded(false)}
            priority
          />

          {isPartialImage && (
            <>
              <div className="scanning-line" />
              <div className="border-primary/30 animate-pulse-glow absolute inset-0 border-2" />
              <div className="border-primary animate-pulse-glow absolute top-2 left-2 h-8 w-8 border-t-2 border-l-2" />
              <div className="border-primary animate-pulse-glow absolute top-2 right-2 h-8 w-8 border-t-2 border-r-2" />
              <div className="border-primary animate-pulse-glow absolute bottom-2 left-2 h-8 w-8 border-b-2 border-l-2" />
              <div className="border-primary animate-pulse-glow absolute right-2 bottom-2 h-8 w-8 border-r-2 border-b-2" />
            </>
          )}
        </div>
      )}

      <div
        className={cn(
          "absolute inset-0 bg-black/0 transition-colors duration-300 hover:bg-black/20",
          (isGenerating || !isFinalImage) && "pointer-events-none"
        )}>
        <div
          className={cn(
            "absolute top-4 right-4 flex gap-2 opacity-30 transition-opacity duration-300",
            !isGenerating &&
              isFinalImage &&
              "group-hover:opacity-100 focus:opacity-100"
          )}>
          <Button
            size="icon"
            variant="ghost"
            className="bg-foreground/90 text-background hover:foreground backdrop-blur-sm">
            <Eye className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="bg-foreground/90 text-background hover:foreground backdrop-blur-sm"
            onClick={() => {
              if (!currentImageUrl) return;
              const link = document.createElement("a");
              link.href = currentImageUrl;
              link.target = "_blank";
              link.rel = "noreferrer noopener";
              const ext = currentImageUrl.split(/\./g).at(-1) ?? "png";
              link.download = `generated-${Date.now()}.${ext}`;
              link.click();
            }}>
            <Download className="size-4" />
          </Button>
        </div>
      </div>

      {isGenerating && !currentImageUrl && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-fade-in space-y-4 text-center">
            <div className="bg-background/80 border-border inline-flex items-center gap-2 rounded-full border px-4 py-2 backdrop-blur-sm">
              <div className="bg-primary h-2 w-2 animate-pulse rounded-full" />
              <span className="text-sm font-medium">Generating image...</span>
            </div>
            {prompt && (
              <p className="text-muted-foreground mx-auto max-w-md px-4 text-sm text-balance">
                {prompt}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

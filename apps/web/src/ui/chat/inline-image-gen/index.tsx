"use client";

import type { ProviderAR, Ratio } from "@/lib/image-aspect";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { parseAspect } from "@/lib/image-aspect";
import { cn } from "@/lib/utils";
import type { $Enums } from "@slipstream/db/node/generated/client";
import { BaseButton as Button, Download, Eye, shimmer } from "@slipstream/ui";

interface InlineImageGenProps {
  isGenerating: boolean;
  images: string[];
  currentImageIndex: number;
  width: number;
  height: number;
  /**
   * Requested ratio for providers that take a ratio instead of a size (xAI,
   * Google). Only consulted while `width`/`height` are still 0; once pixels
   * land the frame snaps to the image's natural dimensions.
   */
  ar?: ProviderAR;
  prompt?: string;
  attachmentId?: string;
  kind?: $Enums.ImageGenOutputKind;
}

/**
 * What the frame knows about its shape. `intrinsic` means `w`/`h` are real
 * pixels and the frame may render at that size; otherwise they only carry the
 * ratio and the frame fills the column until the image reports its own size.
 */
type Box = { w: number; h: number; intrinsic: boolean };

function resolveBox(w: number | null, h: number | null, ratio: Ratio | null) {
  if (w !== null && h !== null) return { w, h, intrinsic: true } satisfies Box;
  if (ratio) return { w: ratio.w, h: ratio.h, intrinsic: false } satisfies Box;
  return null;
}

/**
 * Renders the image at its real size: width is the intrinsic pixel width,
 * capped only by the column (`max-w-3xl`), and height follows from
 * `aspect-ratio` so the ratio is never violated by a clamp.
 */
function frameStyle(box: Box | null) {
  if (!box)
    return { aspectRatio: "1 / 1", width: "100%" } satisfies CSSProperties;
  return {
    aspectRatio: `${box.w} / ${box.h}`,
    width: box.intrinsic ? `min(100%, ${box.w}px)` : "100%"
  } satisfies CSSProperties;
}

export function InlineImageGen({
  isGenerating,
  images,
  height,
  width,
  ar,
  currentImageIndex,
  prompt,
  attachmentId,
  kind
}: InlineImageGenProps) {
  const imageUrlRef = useRef<string | null>(null);

  const kindRef = useRef<"FINAL" | "PARTIAL" | null>(null);

  const attachmentIdRef = useRef<string | null>(null);

  const widthRef = useRef<number | null>(null);

  const heightRef = useRef<number | null>(null);

  const [w, setW] = useState<number | null>(null);

  const [h, setH] = useState<number | null>(null);

  const [displayImageUrl, setDisplayImageUrl] = useState<string | null>(null);

  const [displayAttachmentId, setDisplayAttachmentId] = useState<
    string | undefined
  >(undefined);

  const [displayKind, setDisplayKind] = useState<"FINAL" | "PARTIAL" | null>(
    null
  );

  useEffect(() => {
    if (height !== 0 && heightRef.current !== height) {
      heightRef.current = height;
      (() => setH(height))();
    }
  }, [height]);

  useEffect(() => {
    if (width !== 0 && widthRef.current !== width) {
      widthRef.current = width;
      (() => setW(width))();
    }
  }, [width]);

  useEffect(() => {
    const currentImageUrl = images[currentImageIndex] ?? undefined;
    if (currentImageUrl && imageUrlRef.current !== currentImageUrl) {
      imageUrlRef.current = currentImageUrl;
      (() => setDisplayImageUrl(currentImageUrl))();
    }
  }, [images, currentImageIndex]);

  useEffect(() => {
    if (attachmentId && attachmentIdRef.current !== attachmentId) {
      attachmentIdRef.current = attachmentId;
      (() => setDisplayAttachmentId(attachmentId))();
    }
  }, [attachmentId]);

  useEffect(() => {
    if (kind && kindRef.current !== kind) {
      kindRef.current = kind;
      (() => setDisplayKind(kind))();
    }
  }, [kind]);

  // The frame has to reserve its final footprint on the very first paint so the
  // text streaming in beneath it never reflows. The latched `w`/`h` only land
  // after the first effect pass, so fall back to the raw props until then.
  const frameW = w ?? (width || null);
  const frameH = h ?? (height || null);
  const box = resolveBox(frameW, frameH, ar ? parseAspect(ar) : null);

  return (
    <div
      id={displayAttachmentId ? `attachment-${displayAttachmentId}` : undefined}
      data-attachment-id={displayAttachmentId ?? undefined}
      className="bg-muted group relative mx-auto max-w-3xl overflow-hidden rounded-2xl"
      style={frameStyle(box)}>
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-500",
          isGenerating && !displayImageUrl ? "opacity-100" : "opacity-0"
        )}>
        <div className="ripple-container" />
      </div>

      {displayImageUrl && (
        <div
          className={cn(
            "absolute inset-0 scale-100 opacity-100 transition-all duration-700 ease-out"
          )}>
          <Image
            src={displayImageUrl ?? "/placeholder.svg"}
            alt={"Image Gen"}
            fill
            sizes="(min-width: 48rem) 48rem, 100vw"
            className="object-cover"
            priority
            placeholder="blur"
            blurDataURL={shimmer(box ? [box.w, box.h] : [1024, 1024])}
            onLoad={e => {
              // Ratio-only providers never supply pixels up front; the first
              // decoded frame is the earliest the real size can be known.
              if (widthRef.current !== null || heightRef.current !== null)
                return;
              const { naturalWidth, naturalHeight } = e.currentTarget;
              if (!naturalWidth || !naturalHeight) return;
              widthRef.current = naturalWidth;
              heightRef.current = naturalHeight;
              setW(naturalWidth);
              setH(naturalHeight);
            }}
          />

          {displayKind === "PARTIAL" && (
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
          displayKind !== "FINAL" && "pointer-events-none"
        )}>
        <div
          className={cn(
            "absolute top-4 right-4 flex gap-2 opacity-30 transition-opacity duration-300",
            displayKind === "FINAL" &&
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
              if (!displayImageUrl) return;
              const link = document.createElement("a");
              link.href = displayImageUrl;
              link.target = "_blank";
              link.rel = "noreferrer noopener";
              const ext = displayImageUrl.split(/\./g).at(-1) ?? "png";
              link.download = `generated-${Date.now()}.${ext}`;
              link.click();
            }}>
            <Download className="size-4" />
          </Button>
        </div>
      </div>

      {isGenerating && !displayImageUrl && (
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

"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button, Download, X } from "@slipstream/ui";

interface ImageGenerationCanvasProps {
  isGenerating: boolean;
  cdnUrl: string | null;
  width: number;
  height: number;
  mime: string;
  cdnUrlPartial?: string | null;
  prompt: string;
  // Add optional unique identifier for proper keying
  generationId?: string;
}

// Helper function to extract series info from CDN URL
function extractSeriesInfo(
  url: string | null
): { seriesId: string; seriesIndex: number; timestamp: number } | null {
  if (!url) return null;

  try {
    const filename = url.split("/").pop();
    if (!filename) return null;

    // Pattern: {timestamp}-{seriesId}-{seriesIndex}.png
    const parts = filename.split("-");
    if (parts.length < 3) return null;
    if (!parts[0]) return null;
    const timestamp = parseInt(parts[0]);
    const seriesId = parts[1];
    if (!seriesId) return null;
    const seriesIndexWithExt = parts[parts.length - 1]; // Use last part to handle seriesIds with hyphens
    const seriesIndex = parseInt(seriesIndexWithExt?.split(".")?.[0] ?? "0");

    if (!seriesId || isNaN(timestamp) || isNaN(seriesIndex)) return null;

    return { seriesId, seriesIndex, timestamp };
  } catch {
    return null;
  }
}

export function ImageGenerationCanvas({
  isGenerating,
  height,
  width,
  cdnUrl,
  cdnUrlPartial,
  prompt,
  generationId
}: ImageGenerationCanvasProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isClosed, setIsClosed] = useState(false);

  // Track previous URL to detect changes
  const prevUrlRef = useRef<string | null>(null);
  const prevGenerationIdRef = useRef<string | undefined>(undefined);

  // Determine what URL to display
  const displayUrl =
    cdnUrl ?? (isGenerating && cdnUrlPartial ? cdnUrlPartial : null);
  const isPartialDisplay = !cdnUrl && isGenerating && !!cdnUrlPartial;
  const shouldShowImage = !!displayUrl && !isClosed;

  // Extract series information for better keying
  const seriesInfo = extractSeriesInfo(displayUrl);
  // const imageKey = seriesInfo
  //   ? `${seriesInfo.seriesId}-${seriesInfo.seriesIndex}`
  //   : `${generationId ?? "gen"}-${displayUrl}`;
  // const imageId = seriesInfo
  //   ? `img-${seriesInfo.seriesId}-${seriesInfo.seriesIndex}`
  //   : `img-${generationId ?? "gen"}-${isPartialDisplay ? "partial" : "final"}`;

  // Reset state when generation changes
  useEffect(() => {
    if (generationId !== prevGenerationIdRef.current) {
      prevGenerationIdRef.current = generationId;
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => {
        setIsClosed(false);
        setImageLoaded(false);
      }, 0);
    }
  }, [generationId]);

  // Reset loaded state when URL changes
  useEffect(() => {
    if (displayUrl !== prevUrlRef.current) {
      prevUrlRef.current = displayUrl;
      if (displayUrl) {
        // Use setTimeout to avoid synchronous setState in effect
        setTimeout(() => setImageLoaded(false), 0);
      }
    }
  }, [displayUrl]);

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  const handleDownload = () => {
    if (!cdnUrl) return;
    const link = document.createElement("a");
    link.href = cdnUrl;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.download = seriesInfo
      ? `generated-${seriesInfo.seriesId}-final.png`
      : `generated-${Date.now()}.png`;
    link.click();
  };

  const handleClose = () => {
    setIsClosed(true);
  };

  // const nextRef = useRef<ComponentRef<typeof Image>>(null);

  return (
    <div className="bg-muted group relative mx-auto aspect-square w-full max-w-3xl overflow-hidden rounded-2xl">
      {/* Ripple animation for generating state without image */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-500",
          isGenerating && !shouldShowImage ? "opacity-100" : "opacity-0"
        )}>
        <div className="ripple-container" />
      </div>

      {/* Image display */}
      {displayUrl && (
        <div
          className={cn(
            "absolute inset-0 transition-all duration-700 ease-out",
            imageLoaded || isPartialDisplay
              ? "scale-100 opacity-100"
              : "scale-95 opacity-0"
          )}>
          <Image
            src={displayUrl}
            alt={prompt}
            height={height}
            width={width}
            className="h-full w-full object-cover"
            onLoad={handleImageLoad}
            priority={isPartialDisplay} // Prioritize loading partials
            unoptimized={isPartialDisplay} // Skip optimization for partials to load faster
          />

          {/* Partial image overlay effects */}
          {isPartialDisplay && (
            <>
              <div className="scanning-line" />
              <div className="border-primary/30 animate-pulse-glow absolute inset-0 border-2" />
              <div className="border-primary animate-pulse-glow absolute top-2 left-2 h-8 w-8 border-t-2 border-l-2" />
              <div className="border-primary animate-pulse-glow absolute top-2 right-2 h-8 w-8 border-t-2 border-r-2" />
              <div className="border-primary animate-pulse-glow absolute bottom-2 left-2 h-8 w-8 border-b-2 border-l-2" />
              <div className="border-primary animate-pulse-glow absolute right-2 bottom-2 h-8 w-8 border-r-2 border-b-2" />
            </>
          )}

          {/* Add series index indicator for debugging */}
          {seriesInfo && process.env.VERCEL_ENV === "development" && (
            <div className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-1 text-xs text-white">
              {isPartialDisplay
                ? `Partial ${seriesInfo.seriesIndex}/3`
                : "Final (4)"}
            </div>
          )}
        </div>
      )}

      {/* Action buttons overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-black/0 transition-colors duration-300 hover:bg-black/20",
          (isGenerating || !cdnUrl) && "pointer-events-none"
        )}>
        <div
          className={cn(
            "absolute top-4 right-4 flex gap-2 opacity-0 transition-opacity duration-300",
            !isGenerating && cdnUrl && "group-hover:opacity-100"
          )}>
          <Button
            size="icon"
            variant="ghost"
            className="bg-foreground/90 text-background hover:foreground backdrop-blur-sm"
            onClick={handleDownload}>
            <Download className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="bg-foreground/90 text-background hover:bg-foreground backdrop-blur-sm"
            onClick={handleClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Generating status overlay */}
      {isGenerating && !shouldShowImage && (
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

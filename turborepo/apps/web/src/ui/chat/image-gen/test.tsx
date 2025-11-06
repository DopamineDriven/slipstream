"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button, Download, Eye } from "@slipstream/ui";

interface ImageGenerationCanvasProps {
  isGenerating: boolean;
  images: string[];
  currentImageIndex: number;
  width: number;
  height: number;
  prompt?: string;
}

export function ImageGenerationCanvasTest({
  isGenerating,
  images,
  height,
  width,
  currentImageIndex,
  prompt
}: ImageGenerationCanvasProps) {
  const [imageLoaded, setImageLoaded] = useState(false);

  const currentImageUrl = images[currentImageIndex] ?? null;
  const isPartialImage =
    currentImageUrl && currentImageIndex < images.length - 1;
  const isFinalImage =
    currentImageUrl && currentImageIndex === images.length - 1;

  return (
    <div className="bg-muted group relative mx-auto aspect-square w-full max-w-3xl overflow-hidden rounded-2xl">
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
            className="h-full w-full object-cover"
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
            "absolute top-4 right-4 flex gap-2 opacity-0 transition-opacity duration-300",
            !isGenerating && isFinalImage && "group-hover:opacity-100"
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

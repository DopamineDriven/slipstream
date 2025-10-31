"use client";

import { useEffect, useState } from "react";
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
}

export function ImageGenerationCanvas({
  isGenerating,
  height,
  width,
  cdnUrl,
  cdnUrlPartial,
  prompt
}: ImageGenerationCanvasProps) {
  const [showImage, setShowImage] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showPartial, setShowPartial] = useState(false);

  useEffect(() => {
    if (cdnUrl) {
      // eslint-disable-next-line
      setShowImage(true);
      setImageLoaded(false);
      setShowPartial(false);
    }
  }, [cdnUrl]);

  useEffect(() => {
    if (cdnUrlPartial && isGenerating) {
      //eslint-disable-next-line
      setShowPartial(true);
    } else if (!isGenerating) {
      setShowPartial(false);
    }
  }, [cdnUrlPartial, isGenerating]);

  const displayImageUrl = cdnUrl ?? (showPartial ? cdnUrlPartial : null);
  const isPartialImage = showPartial && !cdnUrl;

  return (
    <div className="bg-muted group relative mx-auto aspect-square w-full max-w-3xl overflow-hidden rounded-2xl">
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-500",
          isGenerating && !showPartial ? "opacity-100" : "opacity-0"
        )}>
        <div className="ripple-container" />
      </div>

      {displayImageUrl && (
        <div
          className={cn(
            "absolute inset-0 transition-all duration-700 ease-out",
            (showImage && imageLoaded) || showPartial
              ? "scale-100 opacity-100"
              : "scale-95 opacity-0"
          )}>
          <Image
            src={displayImageUrl || "/placeholder.svg"}
            alt={prompt}
            height={height}
            width={width}
            className="h-full w-full object-cover"
            onLoad={() => setImageLoaded(true)}
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
          (isGenerating || !cdnUrl) && "pointer-events-none"
        )}>
        <div
          className={cn(
            "absolute top-4 right-4 flex gap-2 opacity-0 transition-opacity duration-300",
            !isGenerating && cdnUrl && "group-hover:opacity-100"
          )}>
          <Button
            size="icon"
            variant="secondary"
            className="bg-white/90 backdrop-blur-sm hover:bg-white"
            onClick={() => {
              if (!cdnUrl) return;
              const link = document.createElement("a");
              link.href = cdnUrl;
              link.download = `generated-${Date.now()}.png`;
              link.click();
            }}>
            <Download className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="bg-white/90 backdrop-blur-sm hover:bg-white"
            onClick={() => {
              setShowImage(false);
              setImageLoaded(false);
            }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isGenerating && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "animate-fade-in space-y-4 text-center transition-opacity duration-500",
              showPartial ? "opacity-0" : "opacity-100"
            )}>
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

      {!isGenerating && !cdnUrl && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-muted-foreground space-y-2 text-center">
            <p className="text-lg font-medium">Ready to generate</p>
            <p className="text-sm">Enter a prompt and click Generate</p>
          </div>
        </div>
      )}
    </div>
  );
}

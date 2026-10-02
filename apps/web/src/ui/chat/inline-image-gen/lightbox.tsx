"use client";

import type { CSSProperties, MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { fileDownloadName } from "@/lib/helpers";
import { cn } from "@/lib/utils";
import { BaseButton as Button, Download, X } from "@slipstream/ui";

export type LightboxImage = {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption?: string | undefined;
  format?: string | undefined;
};

/** Viewport room kept clear for the toolbar above and the caption below. */
const INSET_X = "2rem";
const INSET_Y = "9rem";

/**
 * "Fit" never upscales past the intrinsic width and only shrinks when the
 * viewport forces it; the height cap is expressed through the ratio so it can
 * never distort the frame. "100%" is the raw pixel width and lets the viewer
 * scroll to pan.
 */
function frameStyle(w: number, h: number, fit: boolean) {
  return {
    aspectRatio: `${w} / ${h}`,
    width: fit
      ? `min(${w}px, calc(100vw - ${INSET_X}), calc((100dvh - ${INSET_Y}) * ${w} / ${h}))`
      : `${w}px`
  } satisfies CSSProperties;
}

export function Lightbox({
  image,
  onClose
}: {
  image: LightboxImage;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const figureRef = useRef<HTMLElement>(null);
  const [fit, setFit] = useState(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const close = () => dialogRef.current?.close();

  const closeOnBackdrop = (e: MouseEvent<HTMLElement>) => {
    if (e.target instanceof Node && figureRef.current?.contains(e.target))
      return;
    close();
  };

  // `close` fires the instant `[open]` drops; hold the route until the exit
  // transition has actually finished so the fade isn't cut off by unmount.
  const handleClosed = () => {
    const dialog = dialogRef.current;
    if (!dialog) {
      onClose();
      return;
    }
    void getComputedStyle(dialog).opacity;
    Promise.allSettled(
      dialog.getAnimations({ subtree: true }).map(a => a.finished)
    ).then(onClose);
  };

  const dims = `${image.width} × ${image.height}`;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClosed}
      aria-label={`${image.alt} — full size`}
      className={cn(
        "text-foreground m-0 h-dvh max-h-none w-screen max-w-none flex-col bg-transparent p-0 outline-none open:flex",
        "opacity-0 transition-[opacity,display,overlay] transition-discrete duration-200 ease-out open:opacity-100 starting:open:opacity-0",
        "backdrop:bg-background/85 backdrop:opacity-0 backdrop:backdrop-blur-md backdrop:transition-[opacity,display,overlay] backdrop:transition-discrete backdrop:duration-200 open:backdrop:opacity-100 starting:open:backdrop:opacity-0"
      )}>
      <header className="flex shrink-0 items-center justify-between gap-4 px-4 py-3">
        <p className="text-muted-foreground font-mono text-xs">
          {dims}
          {image.format ? ` · ${image.format}` : null}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={!fit}
            onClick={() => setFit(f => !f)}
            className="font-mono">
            {fit ? "Fit" : "100%"}
          </Button>
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label="Download image"
            onClick={() => {
              const link = document.createElement("a");
              link.href = image.src;
              link.download = fileDownloadName(image.src);
              link.click();
            }}>
            <Download className="size-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label="Close"
            onClick={close}>
            <X className="size-4" />
          </Button>
        </div>
      </header>

      <div
        onClick={closeOnBackdrop}
        className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <div className="flex min-h-full min-w-full p-4">
          <figure
            ref={figureRef}
            className="m-auto flex scale-100 flex-col items-center gap-3 transition-[scale] duration-200 ease-out starting:scale-95">
            <button
              type="button"
              aria-label={fit ? "Zoom to 100%" : "Fit to screen"}
              onClick={() => setFit(f => !f)}
              className={cn(
                "bg-muted focus-visible:ring-ring/50 relative block overflow-hidden rounded-xl shadow-2xl outline-none focus-visible:ring-3",
                fit ? "cursor-zoom-in" : "cursor-zoom-out"
              )}
              style={frameStyle(image.width, image.height, fit)}>
              <Image
                src={image.src}
                alt={image.alt}
                fill
                sizes="100vw"
                className="object-cover"
                priority
              />
            </button>
            {image.caption ? (
              <figcaption className="text-muted-foreground max-w-3xl text-center text-sm leading-relaxed text-pretty">
                <span className="line-clamp-2">{image.caption}</span>
              </figcaption>
            ) : null}
          </figure>
        </div>
      </div>
    </dialog>
  );
}

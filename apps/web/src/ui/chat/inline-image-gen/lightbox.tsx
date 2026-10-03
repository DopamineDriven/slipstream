"use client";

import type { AssetView, AudioAsset, ImageAsset } from "@/lib/asset-view";
import type { CSSProperties, MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useCookiesCtx } from "@/context/cookie-context";
import { audioSubtitle, playbackTrack } from "@/lib/asset-view";
import { formatDate, truncateMiddle } from "@/lib/format";
import { downloadAsset } from "@/lib/helpers";
import { formatLyrics, parseLyrics } from "@/lib/lyrics";
import { cn } from "@/lib/utils";
import {
  ProvenanceGlyph,
  ProvenanceLine,
  specLine
} from "@/ui/chat/lightbox/asset-meta";
import { DocumentEmbed } from "@/ui/chat/lightbox/document-embed";
import { LyricsPanel } from "@/ui/chat/lightbox/lyrics-panel";
import { CopyLyrics } from "@/ui/chat/lightbox/lyrics-reveal";
import { AudioPlayer } from "@/ui/chat/playback/audio-player";
import { BaseButton as Button, Download, X } from "@slipstream/ui";

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

function ImageBody({
  asset,
  fit,
  onToggleFit,
  locale,
  tz
}: {
  asset: ImageAsset;
  fit: boolean;
  onToggleFit: () => void;
  locale: string;
  tz: string;
}) {
  const { series, createdAt } = asset.provenance;
  const footer = [
    series
      ? `series ${truncateMiddle(series.id, 6)}${series.ordinal === undefined ? "" : ` · #${series.ordinal}`}`
      : undefined,
    formatDate(createdAt, locale, tz)
  ].filter((part): part is string => part !== undefined);

  return (
    <>
      {asset.width !== undefined && asset.height !== undefined ? (
        <button
          type="button"
          aria-label={fit ? "Zoom to 100%" : "Fit to screen"}
          onClick={onToggleFit}
          className={cn(
            "bg-muted focus-visible:ring-ring/50 relative block overflow-hidden rounded-xl shadow-2xl outline-none focus-visible:ring-3",
            fit ? "cursor-zoom-in" : "cursor-zoom-out"
          )}
          style={frameStyle(asset.width, asset.height, fit)}>
          <Image
            src={asset.src}
            alt={asset.alt}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        </button>
      ) : (
        // no dimensions on any relation: the image sizes itself, capped to the
        // viewport; nothing to fit or zoom
        <Image
          src={asset.src}
          alt={asset.alt}
          width={0}
          height={0}
          sizes="100vw"
          className={`bg-muted h-auto max-h-[calc(100dvh-${INSET_Y})] w-auto max-w-[calc(100vw-${INSET_X})] rounded-xl shadow-2xl`}
          priority
        />
      )}
      {asset.caption || footer.length > 0 ? (
        <figcaption className="flex max-w-3xl flex-col items-center gap-1.5 text-center">
          {asset.caption ? (
            <span className="text-muted-foreground line-clamp-2 text-sm leading-relaxed text-pretty">
              {asset.caption}
            </span>
          ) : null}
          {footer.length > 0 ? (
            <span className="text-muted-foreground/70 font-mono text-[11px]">
              {footer.join(" · ")}
            </span>
          ) : null}
        </figcaption>
      ) : null}
    </>
  );
}

/** The player is pinned; the sheet scrolls beneath it so the transport never leaves view. */
function AudioBody({ asset }: { asset: AudioAsset }) {
  return (
    <div className="bg-card text-card-foreground border-border/60 flex w-[min(40rem,calc(100vw-2rem))] flex-col rounded-2xl border shadow-2xl">
      <div className="p-6">
        <AudioPlayer
          track={playbackTrack(asset)}
          peaks={asset.peaks}
          subtitle={audioSubtitle(asset)}
        />
      </div>
      {asset.content ? (
        <div className="border-border/60 flex items-start gap-3 border-t px-6 py-5">
          <LyricsPanel
            lyrics={asset.content}
            className="max-h-[calc(100dvh-20rem)] min-w-0 flex-1 overflow-y-auto overscroll-contain"
          />
          <div className="-mt-2 -mr-2 shrink-0">
            <CopyLyrics text={formatLyrics(parseLyrics(asset.content))} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Lightbox({
  asset,
  onClose
}: {
  asset: AssetView;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const figureRef = useRef<HTMLElement>(null);
  const [fit, setFit] = useState(true);
  const { getTargeted } = useCookiesCtx();
  const { locale, "client-tz": tz } = getTargeted(["client-tz", "locale"]);

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

  const canFit =
    asset.kind === "IMAGE" &&
    asset.width !== undefined &&
    asset.height !== undefined;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClosed}
      aria-label={`${asset.title} — ${asset.kind.toLowerCase()} viewer`}
      className={cn(
        "text-foreground m-0 h-dvh max-h-none w-screen max-w-none flex-col bg-transparent p-0 outline-none open:flex",
        "opacity-0 transition-[opacity,display,overlay] transition-discrete duration-200 ease-out open:opacity-100 starting:open:opacity-0",
        "backdrop:bg-background/85 backdrop:opacity-0 backdrop:backdrop-blur-md backdrop:transition-[opacity,display,overlay] backdrop:transition-discrete backdrop:duration-200 open:backdrop:opacity-100 starting:open:backdrop:opacity-0"
      )}>
      <header className="flex shrink-0 items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProvenanceGlyph provenance={asset.provenance} />
          <div className="flex min-w-0 flex-col">
            <ProvenanceLine provenance={asset.provenance} />
            <p className="text-muted-foreground truncate font-mono text-xs">
              {specLine(asset)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canFit ? (
            <Button
              variant="secondary"
              size="sm"
              aria-pressed={!fit}
              onClick={() => setFit(f => !f)}
              className="font-mono">
              {fit ? "Fit" : "100%"}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label={`Download ${asset.original.downloadName}`}
            onClick={() =>
              void downloadAsset(
                asset.original.src,
                asset.original.downloadName
              )
            }>
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
            {asset.kind === "IMAGE" ? (
              <ImageBody
                asset={asset}
                fit={fit}
                onToggleFit={() => setFit(f => !f)}
                locale={locale ?? "en-US"}
                tz={tz ?? "UTC"}
              />
            ) : asset.kind === "DOCUMENT" ? (
              <DocumentEmbed
                src={asset.src}
                title={asset.title}
                className="ring-border/60 h-[calc(100dvh-8rem)] w-[min(56rem,calc(100vw-2rem))] overflow-hidden rounded-xl shadow-2xl ring-1"
              />
            ) : (
              <AudioBody asset={asset} />
            )}
          </figure>
        </div>
      </div>
    </dialog>
  );
}

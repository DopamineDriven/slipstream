"use client";

import type { AssetView } from "@/lib/asset-view";
import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAttachment } from "@/hooks/use-attachment";
import {
  audioSubtitle,
  modelLine,
  playbackTrack,
  toAssetView
} from "@/lib/asset-view";
import { formatLyrics, parseLyrics } from "@/lib/lyrics";
import { DownloadButton } from "@/ui/chat/download-button";
import {
  eyebrow,
  ProvenanceGlyph,
  SpecSheet
} from "@/ui/chat/lightbox/asset-meta";
import { DocumentEmbed } from "@/ui/chat/lightbox/document-embed";
import { LyricsPanel } from "@/ui/chat/lightbox/lyrics-panel";
import { CopyLyrics } from "@/ui/chat/lightbox/lyrics-reveal";
import { AudioPlayer } from "@/ui/chat/playback/audio-player";
import { ArrowLeft, baseButtonVariants, ExternalLink } from "@slipstream/ui";

function description(asset: AssetView) {
  if (asset.kind === "IMAGE") return asset.caption;
  const p = asset.provenance;
  if (asset.kind === "DOCUMENT") {
    return p.compat === "ACTIVE"
      ? "Compat copy from the document pipeline. Word, Excel and PowerPoint sources are normalized to PDF so every provider reads the same bytes."
      : "Original upload, served as-is.";
  }
  const model = modelLine(p);
  return model
    ? `${model} output, served as ${asset.format.toUpperCase()} with byte-range seeking.`
    : `Served as ${asset.format.toUpperCase()} with byte-range seeking.`;
}

function Hero({ asset }: { asset: AssetView }) {
  if (asset.kind === "IMAGE") {
    return asset.width !== undefined && asset.height !== undefined ? (
      <div
        className="bg-muted ring-border/60 relative overflow-hidden rounded-2xl shadow-2xl ring-1"
        style={{
          aspectRatio: `${asset.width} / ${asset.height}`,
          width: `min(100%, ${asset.width}px)`
        }}>
        <Image
          src={asset.src}
          alt={asset.alt}
          fill
          sizes="(min-width: 72rem) 72rem, 100vw"
          className="object-cover"
          priority
        />
      </div>
    ) : (
      <Image
        src={asset.src}
        alt={asset.alt}
        width={0}
        height={0}
        sizes="(min-width: 72rem) 72rem, 100vw"
        className="bg-muted ring-border/60 h-auto max-h-[72dvh] w-auto max-w-full rounded-2xl shadow-2xl ring-1"
        priority
      />
    );
  }
  if (asset.kind === "DOCUMENT") {
    return (
      <DocumentEmbed
        src={asset.src}
        title={asset.title}
        className="ring-border/60 h-[72dvh] w-full max-w-4xl overflow-hidden rounded-2xl shadow-2xl ring-1"
      />
    );
  }
  return (
    <div className="bg-card text-card-foreground border-border/60 flex w-full max-w-2xl flex-col rounded-2xl border shadow-2xl">
      <div className="p-6">
        <AudioPlayer
          track={playbackTrack(asset)}
          peaks={asset.peaks}
          subtitle={audioSubtitle(asset)}
        />
      </div>
      {asset.content ? (
        <div className="border-border/60 flex items-start gap-3 border-t px-6 py-5">
          <LyricsPanel lyrics={asset.content} className="min-w-0 flex-1" />
          <div className="-mt-2 -mr-2 shrink-0">
            <CopyLyrics text={formatLyrics(parseLyrics(asset.content))} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Hard loads and shared links; the same asset opens as a lightbox from the chat. */
export function AttachmentPageView() {
  const { id } = useParams<{ id: string }>();
  const row = useAttachment(id);
  const asset = useMemo(() => (row ? toAssetView(row) : null), [row]);
  if (!asset) return null;
  const body = description(asset);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-8">
      <nav
        aria-label="Attachment actions"
        className="flex items-center justify-between gap-4">
        <Link
          href={asset.conversationId ? `/chat/${asset.conversationId}` : "/"}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to conversation
        </Link>
        <div className="flex items-center gap-2">
          <a
            href={asset.original.src}
            target="_blank"
            rel="noopener noreferrer"
            className={baseButtonVariants({ variant: "outline", size: "sm" })}>
            Open original
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
          {asset.compatCopy ? (
            <DownloadButton
              file={asset.compatCopy}
              label={`Compat ${asset.compatCopy.format.toUpperCase()}`}
              variant="outline"
            />
          ) : null}
          <DownloadButton file={asset.original} />
        </div>
      </nav>

      <section aria-label="Preview" className="flex justify-center">
        <Hero asset={asset} />
      </section>

      <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <ProvenanceGlyph provenance={asset.provenance} />
            <p className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
              {eyebrow(asset)}
            </p>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {asset.title}
          </h1>
          {body ? (
            <p className="text-muted-foreground max-w-2xl text-[15px] leading-7 text-pretty">
              {body}
            </p>
          ) : null}
        </div>
        <SpecSheet asset={asset} className="self-start" />
      </section>
    </main>
  );
}

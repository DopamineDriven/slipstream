"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAttachment } from "@/hooks/use-attachment";
import { toCdnUrlConstituents } from "@/lib/helpers";
import type {
  ImageGenOutputSingleton,
  InlineImageGenOutputSingleton
} from "@slipstream/types";

export function AttachmentPageView() {
  const { id } = useParams<{ id: string }>();
  const row = useAttachment(id);
  if (!row?.cdnUrl) return null;
  let d:
    ImageGenOutputSingleton<true> | InlineImageGenOutputSingleton<true> | null;
  const { type, ext: format } = toCdnUrlConstituents(row.cdnUrl);
  if (type === "ImageGenOutput") {
    d = row.imageGenOutput;
  } else {
    d = row.inlineImageGenOutput ?? null;
  }
  const src = row.cdnUrl,
    height = row.image?.height ?? d?.height,
    width = row.image?.width ?? d?.width,
    alt = row.id,
    caption = d?.revisedPrompt ?? row.filename ?? undefined;

  if (!row.cdnUrl || !width || !height) return null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <Link
        href={row.conversationId ? `/chat/${row.conversationId}` : "/"}
        className="text-muted-foreground hover:text-foreground w-fit text-sm transition-colors">
        &larr; Back to conversation
      </Link>
      <figure className="flex flex-col gap-3">
        <div
          className="bg-muted relative overflow-hidden rounded-2xl"
          style={{
            aspectRatio: `${width} / ${height}`,
            width: `min(100%, ${width}px)`
          }}>
          <Image
            src={src}
            alt={caption ?? alt}
            fill
            sizes="(min-width: 64rem) 64rem, 100vw"
            className="object-cover"
            priority
          />
        </div>
        <figcaption className="flex flex-col gap-1">
          <span className="text-muted-foreground font-mono text-xs">
            {width} × {height} · {format}
          </span>
          <span className="text-muted-foreground max-w-3xl text-sm leading-relaxed text-pretty">
            {caption}
          </span>
        </figcaption>
      </figure>
    </main>
  );
}

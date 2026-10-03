"use client";

import type { AssetView } from "@/lib/asset-view";
import Image from "next/image";
import Link from "next/link";
import { formatBytes } from "@/lib/format";
import { AudioLines, Eye, FileText } from "@slipstream/ui";

/**
 * Inherited from the display this replaces: web-native formats are served
 * straight from the CDN (the pipeline already normalised them), the odd ones
 * go through Next's optimizer.
 */
const NEXT_NATIVE = /^(png|jpeg|jpg|webp|avif|svg)$/;

function Chip({ asset }: { asset: AssetView }) {
  const href = `/attachment/${asset.id}`;

  if (asset.kind === "IMAGE") {
    return (
      <Link
        href={href}
        scroll={false}
        aria-label={`Open ${asset.title}`}
        className="group/chip bg-muted ring-border/60 focus-visible:ring-ring relative block size-20 overflow-hidden rounded-xl ring-1 outline-none focus-visible:ring-2">
        <Image
          src={asset.src}
          alt=""
          fill
          sizes="80px"
          unoptimized={NEXT_NATIVE.test(asset.format)}
          className="object-cover transition-transform duration-300 ease-out group-hover/chip:scale-105"
        />
        <span className="bg-background/80 text-foreground absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-md opacity-0 backdrop-blur-sm transition-opacity group-hover/chip:opacity-100 group-focus-visible/chip:opacity-100">
          <Eye className="size-3.5" aria-hidden="true" />
        </span>
      </Link>
    );
  }

  const Icon = asset.kind === "AUDIO" ? AudioLines : FileText;
  const meta = [asset.format.toUpperCase(), formatBytes(asset.byteSize)]
    .filter((part): part is string => part !== undefined)
    .join(" · ");

  return (
    <Link
      href={href}
      scroll={false}
      className="group/chip bg-card border-border/60 hover:bg-muted/60 focus-visible:ring-ring flex h-20 w-60 max-w-full items-center gap-3 rounded-xl border px-3 transition-colors outline-none focus-visible:ring-2">
      <span className="bg-secondary text-secondary-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{asset.title}</span>
        <span className="text-muted-foreground font-mono text-[11px]">
          {meta}
        </span>
      </span>
      <Eye
        className="text-muted-foreground size-4 shrink-0 opacity-0 transition-opacity group-hover/chip:opacity-100 group-focus-visible/chip:opacity-100"
        aria-hidden="true"
      />
    </Link>
  );
}

/**
 * Attachments on a user message; each opens the shared `/attachment/[id]`
 * lightbox. The list wraps rather than scrolling sideways: nothing is hidden
 * off-edge, and the feed's vertical scroll is the only scroll on touch.
 */
export function AttachmentChips({ assets }: { assets: readonly AssetView[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {assets.map(asset => (
        <li key={asset.id} className="max-w-full min-w-0">
          <Chip asset={asset} />
        </li>
      ))}
    </ul>
  );
}

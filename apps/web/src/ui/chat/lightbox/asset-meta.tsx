"use client";

import type { AssetView, Provenance } from "@/lib/asset-view";
import type { ReactNode } from "react";
import { useCookiesCtx } from "@/context/cookie-context";
import {
  compatLabel,
  kindLabel,
  modelLine,
  originLabel
} from "@/lib/asset-view";
import { formatBytes, formatDateTime, truncateMiddle } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Clipboard,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Upload
} from "@slipstream/ui";

export function ProvenanceGlyph({
  provenance,
  className
}: {
  provenance: Provenance;
  className?: string | undefined;
}) {
  const Icon =
    provenance.sender === "AI"
      ? Sparkles
      : provenance.origin === "PASTED"
        ? Clipboard
        : Upload;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "bg-secondary text-secondary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg",
        className
      )}>
      <Icon className="size-4" />
    </span>
  );
}

/** "Generated · Nano Banana Pro via Gemini 3 Pro" / "Pasted · compat copy" */
export function ProvenanceLine({ provenance }: { provenance: Provenance }) {
  const compat = compatLabel(provenance);
  const model = modelLine(provenance);
  return (
    <p className="truncate text-sm font-medium">
      {originLabel(provenance)}
      {compat ? (
        <span className="text-muted-foreground"> · {compat}</span>
      ) : null}
      {model ? <span className="text-muted-foreground"> · {model}</span> : null}
    </p>
  );
}

/** "1792 × 1008" when both edges are known. */
export function dimensions(asset: AssetView) {
  return asset.kind === "IMAGE" &&
    asset.width !== undefined &&
    asset.height !== undefined
    ? `${asset.width} × ${asset.height}`
    : undefined;
}

/** "1792 × 1008 · JPEG · 605 KB" / "PDF · 241 KB" / "MP3 · 4.1 MB" */
export function specLine(asset: AssetView) {
  return [
    dimensions(asset),
    asset.format.toUpperCase(),
    formatBytes(asset.byteSize)
  ]
    .filter((part): part is string => part !== undefined)
    .join(" · ");
}

/** Eyebrow for the full page: "GENERATED IMAGE", "PASTED IMAGE · COMPAT COPY". */
export function eyebrow(asset: AssetView) {
  const compat = compatLabel(asset.provenance);
  return [`${originLabel(asset.provenance)} ${kindLabel(asset)}`, compat]
    .filter((part): part is string => part !== undefined)
    .join(" · ");
}

export function CompatibilityBadge({ asset }: { asset: AssetView }) {
  if (asset.kind !== "IMAGE") return null;
  const { compatibility } = asset;
  return compatibility.ready ? (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
      Provider-ready
    </span>
  ) : (
    <span className="flex flex-col items-end gap-0.5 text-sm">
      <span className="inline-flex items-center gap-1.5">
        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        Needs compat pass
      </span>
      <span className="text-muted-foreground text-right font-mono text-[11px] leading-4">
        {compatibility.reasons.join(" · ")}
      </span>
    </span>
  );
}

type SpecRow = { term: string; value: ReactNode };

function cdnPath(src: string) {
  return URL.canParse(src) ? new URL(src).pathname : src;
}

function specRows(asset: AssetView, locale: string, tz: string) {
  const p = asset.provenance;
  const showingCompat = asset.src === asset.compatCopy?.src;
  const dims = dimensions(asset);
  const rows: (SpecRow | null)[] = [
    p.generatedBy ? { term: "Model", value: p.generatedBy } : null,
    p.facilitatedBy ? { term: "Facilitated by", value: p.facilitatedBy } : null,
    asset.kind === "IMAGE"
      ? {
          term: "Dimensions",
          value: <span className="font-mono tabular-nums">{dims ?? "—"}</span>
        }
      : null,
    {
      term: "Format",
      value: (
        <span className="font-mono">
          {asset.format.toUpperCase()}
          {showingCompat
            ? ` · from ${asset.original.format.toUpperCase()}`
            : ""}
          {asset.kind === "IMAGE" && asset.hasAlpha ? " · alpha" : ""}
        </span>
      )
    },
    asset.byteSize !== undefined
      ? {
          term: "Size",
          value: (
            <span className="font-mono tabular-nums">
              {formatBytes(asset.byteSize)}
            </span>
          )
        }
      : null,
    { term: "Created", value: formatDateTime(p.createdAt, locale, tz) },
    p.series
      ? {
          term: "Series",
          value: (
            <span className="font-mono text-xs">
              {truncateMiddle(p.series.id, 6)}
              {p.series.ordinal === undefined ? "" : ` · #${p.series.ordinal}`}
            </span>
          )
        }
      : null,
    asset.kind === "IMAGE"
      ? { term: "Compatibility", value: <CompatibilityBadge asset={asset} /> }
      : null,
    {
      term: "Showing",
      value:
        p.sender === "AI"
          ? "Model output"
          : showingCompat
            ? "Compat copy (pipeline)"
            : "Original bytes"
    },
    {
      term: "Attachment",
      value: <span className="font-mono text-xs">{asset.id}</span>
    },
    {
      term: "Original",
      value: (
        <span className="font-mono text-xs" title={asset.original.src}>
          {truncateMiddle(cdnPath(asset.original.src), 14)}
        </span>
      )
    },
    asset.compatCopy
      ? {
          term: "Compat copy",
          value: (
            <span className="font-mono text-xs" title={asset.compatCopy.src}>
              {truncateMiddle(cdnPath(asset.compatCopy.src), 14)}
            </span>
          )
        }
      : null
  ];
  return rows.filter((row): row is SpecRow => row !== null);
}

/** Dates read in the viewer's clock, from the same cookies the feed's timestamps use. */
export function SpecSheet({
  asset,
  className
}: {
  asset: AssetView;
  className?: string | undefined;
}) {
  const { getTargeted } = useCookiesCtx();
  const { locale, "client-tz": tz } = getTargeted(["client-tz", "locale"]);
  return (
    <dl
      className={cn(
        "border-border/60 bg-card/40 divide-border/60 flex flex-col divide-y rounded-2xl border",
        className
      )}>
      {specRows(asset, locale ?? "en-US", tz ?? "UTC").map(row => (
        <div
          key={row.term}
          className="flex items-baseline justify-between gap-6 px-4 py-3">
          <dt className="text-muted-foreground shrink-0 font-mono text-[11px] tracking-wider uppercase">
            {row.term}
          </dt>
          <dd className="min-w-0 text-right text-sm break-all">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

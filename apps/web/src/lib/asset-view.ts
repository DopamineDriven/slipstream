import type { PlaybackTrack } from "@/playback/store";
import { cdnUrlHandler, fromPrismaFormat } from "@/lib/helpers";
import { imgCtx } from "@/lib/img-ctx";
import { getModelDisplayName } from "@/lib/models";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { AttachmentSingleton, Rm } from "@slipstream/types";

export type SenderType = "AI" | "USER";

export type Provenance = {
  sender: SenderType;
  origin: $Enums.AssetOrigin;
  compat: $Enums.CompatStatus;
  createdAt: Date;
  /** Image series from the lineage row, or the audio job; ordinal and kind are image-only. */
  series:
    | {
        id: string;
        ordinal: number | undefined;
        kind: $Enums.ImageGenOutputKind | undefined;
      }
    | undefined;
  generatedBy: string | undefined;
  facilitatedBy: string | undefined;
};

/** One addressable object on the CDN. */
export type FileRef = {
  src: string;
  format: string;
  mime: string | undefined;
  downloadName: string;
};

/**
 * Universal provider compatibility: jpeg/png/webp, both edges ≤ 2000px.
 * Anthropic in particular fails the whole conversation once >20 images are
 * attached and any one of them exceeds 2000px on either side.
 */
export const PROVIDER_MAX_EDGE = 2000;

export type Compatibility =
  | { ready: true; via: "original" | "compat" }
  | { ready: false; reasons: readonly string[] };

type AssetBase = {
  id: string;
  conversationId: string | null;
  title: string;
  /** What the viewer renders; the compat copy when the original can't be shown inline. */
  src: string;
  format: string;
  mime: string | undefined;
  byteSize: number | undefined;
  downloadName: string;
  /** The bytes as stored; identical to `src` unless a compat copy is previewed. */
  original: FileRef;
  /** The pipeline's provider-safe copy; present only while `compatStatus` is ACTIVE. */
  compatCopy: FileRef | undefined;
  provenance: Provenance;
};

export type ImageAsset = AssetBase & {
  kind: "IMAGE";
  /** Unknown when no relation carries them (extraction failed, legacy gen row); the chip and frame fill without them. */
  width: number | undefined;
  height: number | undefined;
  alt: string;
  caption: string | undefined;
  hasAlpha: boolean | null;
  animated: boolean;
  frames: number;
  /** `#rrggbb` the extractor sampled; used as the frame's colour before decode. */
  dominantColor: string | undefined;
  colorSpace: string | undefined;
  /** "Canon EOS R5 · RF35mm F1.8" when the upload carried EXIF. */
  camera: string | undefined;
  capturedAt: Date | undefined;
  compatibility: Compatibility;
};

export type AudioAsset = AssetBase & {
  kind: "AUDIO";
  /** Seconds, from the extractor; the player still trusts the element once it loads. */
  duration: number | undefined;
  peaks: readonly number[];
  codec: string | undefined;
  bitrate: number | undefined;
  sampleRate: number | undefined;
  channels: number | undefined;
  credit: string | undefined;
  /** The model's text output beside the audio — lyria's sectioned lyric sheet. */
  content: string | undefined;
};

export type DocumentAsset = AssetBase & {
  kind: "DOCUMENT";
  pageCount: number | undefined;
  wordCount: number | undefined;
  docTitle: string | undefined;
  author: string | undefined;
  language: string | undefined;
  pdfVersion: string | undefined;
  searchable: boolean;
  encrypted: boolean;
  preview: string | undefined;
};

export type AssetView = ImageAsset | DocumentAsset | AudioAsset;

/* -------------------------------- helpers -------------------------------- */

const PROVIDER_FORMATS = new Set(["jpeg", "jpg", "png", "webp"]);

const BROWSER_IMAGE_FORMATS = new Set([
  "jpeg",
  "jpg",
  "png",
  "webp",
  "gif",
  "avif",
  "svg",
  "bmp",
  "ico",
  "apng"
]);

/**
 * Pure image-gen ids resolve through imgCtx's historic map (retired ids
 * included); anything else is a chat model and resolves through its provider.
 */
export function modelDisplayName(
  model: string | null | undefined,
  provider: $Enums.Provider | null | undefined
) {
  if (!model) return undefined;
  if (imgCtx.isPureImageGenModelHistoric(model))
    return imgCtx.pureImageGenDisplayNameMap[model];
  if (!provider) return undefined;
  return getModelDisplayName(fromPrismaFormat(provider), model);
}

function nonNull<T>(value: T | null | undefined) {
  return value === null ? undefined : value;
}

/** CDN keys always end in a real extension and never carry a query string. */
function extOf(url: string) {
  return url.slice(url.lastIndexOf(".") + 1).toLowerCase();
}

function stemOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? name : name.slice(0, dot);
}

function withExt(stem: string, format: string) {
  return stem.toLowerCase().endsWith(`.${format}`) ? stem : `${stem}.${format}`;
}

function joinPresent(
  parts: readonly (string | null | undefined)[],
  sep: string
) {
  const present = parts.filter(
    (p): p is string => typeof p === "string" && p.length > 0
  );
  return present.length > 0 ? present.join(sep) : undefined;
}

export function imageCompatibility(
  width: number | undefined,
  height: number | undefined,
  format: string
): Compatibility {
  const reasons = Array.of<string>();
  if (!PROVIDER_FORMATS.has(format.toLowerCase())) {
    reasons.push(`${format.toUpperCase()} is outside JPEG / PNG / WEBP`);
  }
  // unknown edges cannot be vouched for, so they read as a reason, not a pass
  if (width === undefined || height === undefined) {
    reasons.push("dimensions unknown");
  } else {
    if (width > PROVIDER_MAX_EDGE)
      reasons.push(`${width}px wide exceeds ${PROVIDER_MAX_EDGE}px`);
    if (height > PROVIDER_MAX_EDGE)
      reasons.push(`${height}px tall exceeds ${PROVIDER_MAX_EDGE}px`);
  }
  return reasons.length > 0
    ? { ready: false, reasons }
    : { ready: true, via: "original" };
}

/* -------------------------------- adapter -------------------------------- */

/**
 * Builds the viewer's model from a registry row. `null` only when there is
 * nothing to show: soft-deleted, no CDN object yet, or a video (no lane). An
 * image with no dimensions on any relation still renders; its edges read as
 * unknown. Pure — called at render on the row the registry hands back,
 * memoised by the consumer on that row's reference.
 */
export function toAssetView(row: AttachmentSingleton<true>): AssetView | null {
  if (row.deletedAt !== null) return null;
  if (row.assetType === "VIDEO") return null;

  const originalSrc = row.cdnUrl;
  const compatSrc = row.compatStatus === "ACTIVE" ? row.compatCdnUrl : null;
  const anySrc = originalSrc ?? compatSrc;
  if (!anySrc) return null;

  // the url's anatomy is the authority on what kind of object this is:
  // sender, user-vs-generated type, series id + ordinal, the user's filename
  const parsed = cdnUrlHandler(anySrc);
  const inline = row.inlineImageGenOutput;
  const gen = row.imageGenOutput;
  const audioGen = row.audioGenOutput;

  const sender: SenderType = parsed.senderType;
  const compat: $Enums.CompatStatus = row.compatStatus ?? parsed.compatStatus;

  // lineage rows first (they carry kind); the url's series is the fallback
  // for generated rows that predate them
  const series: Provenance["series"] = inline
    ? { id: inline.seriesId, ordinal: inline.seriesOrdinal, kind: inline.kind }
    : gen
      ? { id: gen.seriesId, ordinal: gen.seriesIndex, kind: gen.kind }
      : audioGen
        ? { id: audioGen.jobId, ordinal: undefined, kind: undefined }
        : parsed.senderType === "AI"
          ? {
              id: parsed.sId,
              ordinal: "sOrdinal" in parsed ? parsed.sOrdinal : undefined,
              kind: undefined
            }
          : undefined;

  const generatingModel =
    inline?.generatingModel ??
    gen?.generatingModel ??
    audioGen?.generatingModel;
  const facilitatingModel =
    inline?.facilitatingModel ??
    gen?.facilitatingModel ??
    audioGen?.facilitatingModel;
  const provider = inline?.provider ?? gen?.provider ?? audioGen?.provider;
  const generatedBy =
    sender === "AI" ? modelDisplayName(generatingModel, provider) : undefined;
  // a pure lane writes the same id to both columns; a facilitated lane writes
  // the chat model beside the image model — only the latter earns a second name
  const facilitatedBy =
    sender === "AI" &&
    facilitatingModel &&
    facilitatingModel !== generatingModel &&
    !imgCtx.isPureImageGenModelHistoric(facilitatingModel)
      ? modelDisplayName(facilitatingModel, provider)
      : undefined;

  const provenance = {
    sender,
    origin: row.origin,
    compat,
    createdAt: row.createdAt,
    series,
    generatedBy,
    facilitatedBy
  } satisfies Provenance;

  // the original's format: the stored ext, then the CDN key's extension
  const originalFormat = (
    row.ext ??
    (originalSrc ? extOf(originalSrc) : undefined) ??
    (row.assetType === "IMAGE" ? row.image?.format : undefined) ??
    (row.assetType === "AUDIO" ? row.audio?.format : undefined) ??
    (row.assetType === "DOCUMENT" ? row.document?.format : undefined) ??
    "bin"
  ).toLowerCase();
  const parsedFilename = "filename" in parsed ? parsed.filename : undefined;
  const stem = stemOf(row.filename ?? parsedFilename ?? row.id);
  const original = {
    src: anySrc,
    format: originalFormat,
    mime: nonNull(row.mime),
    downloadName:
      sender === "AI" && series
        ? `${series.id}${series.ordinal === undefined ? "" : `-${series.ordinal}`}.${originalFormat}`
        : withExt(stem, originalFormat)
  } satisfies FileRef;
  const compatFormat = (
    row.compatExt ??
    (compatSrc ? extOf(compatSrc) : undefined) ??
    (row.assetType === "DOCUMENT" ? "pdf" : originalFormat)
  ).toLowerCase();
  const compatCopy = compatSrc
    ? ({
        src: compatSrc,
        format: compatFormat,
        mime: nonNull(row.compatMime),
        downloadName: withExt(stem, compatFormat)
      } satisfies FileRef)
    : undefined;
  // preview the compat copy only when the browser can't render the original:
  // Office docs become PDF, HEIC/TIFF uploads become PNG/JPEG
  const previewCompat =
    compatCopy !== undefined &&
    (row.assetType === "DOCUMENT"
      ? originalFormat !== "pdf"
      : row.assetType === "IMAGE"
        ? !BROWSER_IMAGE_FORMATS.has(originalFormat)
        : false);
  const shown = previewCompat && compatCopy ? compatCopy : original;
  const base = {
    id: row.id,
    conversationId: row.conversationId,
    src: shown.src,
    format: shown.format,
    mime: shown.mime,
    byteSize: nonNull(row.size),
    downloadName: original.downloadName,
    original,
    compatCopy,
    provenance
  } satisfies Rm<AssetBase, "title">;

  if (row.assetType === "IMAGE") {
    const width = row.image?.width ?? inline?.width ?? nonNull(gen?.width);
    const height = row.image?.height ?? inline?.height ?? nonNull(gen?.height);
    const caption = nonNull(inline?.revisedPrompt ?? gen?.revisedPrompt);
    const title =
      sender === "AI"
        ? "Generated image"
        : (row.filename ??
          parsedFilename ??
          (row.origin === "PASTED" ? "Pasted image" : "Uploaded image"));
    const meta = row.image;
    const camera = meta
      ? joinPresent(
          [
            joinPresent([meta.cameraMake, meta.cameraModel], " "),
            meta.lensModel
          ],
          " · "
        )
      : undefined;
    const compatibility: Compatibility =
      compat === "ACTIVE" && compatCopy
        ? { ready: true, via: "compat" }
        : imageCompatibility(width, height, originalFormat);
    return {
      ...base,
      kind: "IMAGE",
      title,
      width,
      height,
      alt: caption ?? title,
      caption,
      hasAlpha: meta?.hasAlpha ?? null,
      animated: meta?.animated ?? false,
      frames: meta?.frames ?? 1,
      dominantColor: nonNull(meta?.dominantColorHex),
      colorSpace: nonNull(meta?.colorSpace),
      camera,
      capturedAt: nonNull(meta?.exifDateTimeOriginal),
      compatibility
    } satisfies ImageAsset;
  }

  if (row.assetType === "AUDIO") {
    const meta = row.audio;
    const credit = meta
      ? joinPresent([meta.artist, meta.album], " — ")
      : undefined;
    const content = nonNull(audioGen?.content);
    const title =
      sender === "AI"
        ? audioTitle(generatedBy, content)
        : (meta?.title ?? row.filename ?? parsedFilename ?? "Uploaded audio");
    return {
      ...base,
      kind: "AUDIO",
      title,
      // ms on the row; 0 is the finalize placeholder, so the element decides
      duration: meta && meta.duration > 0 ? meta.duration / 1000 : undefined,
      peaks: meta?.waveformPeaks ?? [],
      codec: nonNull(meta?.codec),
      bitrate: nonNull(meta?.bitrate),
      sampleRate: nonNull(meta?.sampleRate),
      channels: nonNull(meta?.channels),
      credit,
      content
    } satisfies AudioAsset;
  }

  const doc = row.document;
  return {
    ...base,
    kind: "DOCUMENT",
    title:
      row.filename ??
      parsedFilename ??
      doc?.title ??
      (compat === "ACTIVE" ? "Converted document" : "Document"),
    pageCount: nonNull(doc?.pageCount),
    wordCount: nonNull(doc?.wordCount),
    docTitle: nonNull(doc?.title),
    author: nonNull(doc?.author),
    language: nonNull(doc?.language),
    pdfVersion: nonNull(doc?.pdfVersion),
    searchable: doc?.isSearchable ?? true,
    encrypted: doc?.isEncrypted ?? false,
    preview: nonNull(doc?.textPreview)
  } satisfies DocumentAsset;
}

/* ---------- display helpers shared by the lightbox and the full page ---------- */

export function originLabel(p: Provenance) {
  if (p.sender === "AI") return "Generated";
  return p.origin === "PASTED" ? "Pasted" : "Uploaded";
}

export function compatLabel(p: Provenance) {
  if (p.sender === "AI") return undefined;
  return p.compat === "ACTIVE" ? "compat copy" : "original";
}

/** "Nano Banana Pro via Gemini 3 Pro", "Lyria 3.5", or undefined when nothing is known. */
export function modelLine(p: Provenance) {
  if (p.sender !== "AI") return undefined;
  if (p.generatedBy && p.facilitatedBy)
    return `${p.generatedBy} via ${p.facilitatedBy}`;
  return p.generatedBy ?? p.facilitatedBy;
}

export function kindLabel(asset: AssetView) {
  return asset.kind === "IMAGE"
    ? "image"
    : asset.kind === "AUDIO"
      ? "audio"
      : "document";
}

/**
 * "Lyria 3.5 song" / "Generated audio". Shared with the live envelope in the
 * bubble so the title is built one way and never flips at commit.
 */
export function audioTitle(
  generatedBy: string | undefined,
  content: string | undefined
) {
  return `${generatedBy ?? "Generated"} ${content ? "song" : "audio"}`;
}

/**
 * Second line under an audio title: the artist credit, else the facilitator.
 * The generator is already the title, so it is not repeated here.
 */
export function audioSubtitle(asset: AudioAsset) {
  return (
    asset.credit ??
    (asset.provenance.facilitatedBy
      ? `via ${asset.provenance.facilitatedBy}`
      : undefined)
  );
}

/** What the shared player needs; keyed by the original cdnUrl so every view of one sound agrees. */
export function playbackTrack(asset: AudioAsset) {
  return {
    id: asset.original.src,
    src: asset.original.src,
    title: asset.title,
    duration: asset.duration
  } satisfies PlaybackTrack;
}

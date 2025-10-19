# @slipstream/metadata

Lightweight, zero‑native metadata extraction for images and documents. Designed to be fast, safe, and “header‑first” so you can classify and preview files without downloading entire objects.

- Minimal bytes fetched (range requests, idle and deadline guards)
- Hardened against slow/origin issues with quarantining and optional CDN origin fallbacks
- Works with Buffers or remote URLs
- Rich, typed results for common image and office/PDF formats

## Features

- Image formats: PNG (incl. iTXt, sRGB/ICC), JPEG (EXIF orientation/date, ICC), WebP (VP8/VP8L/VP8X, animation), GIF (frame count), BMP, AVIF (ispe, XMP), ICO (largest entry), TIFF (classic), HEIC/HEIF (ISOBMFF)
- Documents: PDF (version, pages, linearization, encryption, text preview, dates via Info and XMP), DOCX/PPTX/XLSX (core/app props, slides/sheets, quick preview), RTF, plain text and common code/data files
- Remote fetch strategy that never blocks the batch: probes first, ranges when possible, streams minimal data otherwise
- Typed return shapes and small helpers for reuse via mixins

## Install

Use your workspace package manager:

```bash
pnpm add @slipstream/metadata
# or
npm i @slipstream/metadata
# or
yarn add @slipstream/metadata
```

## Quick Start

Classify any URL or Buffer and get a unified, typed result:

```ts
import { Extract } from "@slipstream/metadata";

const extract = new Extract({ debug: false });

// From a remote URL
const result1 = await extract.extractRemote(
  "https://cdn.example.com/path/to/file.pdf",
  96 * 1024 // optional head size to fetch/analyze
);

// From a Buffer
const fileBuffer = await fs.promises.readFile("./sample.jpeg");
const result2 = await extract.extractRemote(fileBuffer);

if (result1.type === "IMAGE") {
  console.log(result1.width, result1.height, result1.format);
} else {
  console.log(result1.format, result1.pageCount, result1.textPreview);
}
```

## When To Use Which API

- Unified flow for URLs or Buffers: `new Extract(opts).extractRemote(source, size?, timeout?)`
- Images only (Buffer input): `new ImgMetadataExtractor().getImageSpecsWorkup(buffer, size?)`
- Documents only (Buffer input): `new DocMetadataExtractor().getDocumentSpecsWorkup(buffer, mime, filename?)`

Exports are available from the package root and by subpath:

```ts
import { Extract, DocMetadataExtractor, ImgMetadataExtractor } from "@slipstream/metadata";
// or
import { Extract } from "@slipstream/metadata/extract";
import { DocMetadataExtractor } from "@slipstream/metadata/docs";
import { ImgMetadataExtractor } from "@slipstream/metadata/images";
```

## Return Types (summary)

Image results (`ExpandedImgSpecs`):
- Core: `type: "IMAGE"`, `width`, `height`, `format`, `frames`, `animated`, `hasAlpha`, `orientation`, `aspectRatio`
- Color: `colorModel`, `colorSpace`, `iccProfile`
- EXIF: `exifDateTimeOriginal`
- Source: `source?`, `byteSize?` (reported total), `fetchedBytes?`, `contentType?`

Doc results (`ExpandedDocSpecs`):
- Core: `type: "DOCUMENT"`, `format`, `mimeType`, `pageCount`, `wordCount`, `lineCount`, `textPreview`
- PDF: `pdfVersion`, `isEncrypted`, `isSearchable`, `isLinearized`
- Common: `author`, `subject`, `keywords`, `createdDate`, `modifiedDate`
- Source: `source?`, `byteSize?`, `fetchedBytes?`, `contentType?`

See `src/types/index.ts` for full type definitions.

## The Hardened Fetcher (remote URLs)

The `Extract` class includes a minimal, safe fetcher that tries to do the least work necessary while avoiding pathological cases:

- Probes the first chunk via `Range` with a short deadline to sniff type and server capabilities
- Prefers `Range` for exact head bytes; uses `HEAD` to detect suspicious compression; streams with an idle guard when needed
- PDFs fetch head + tail when ranged to surface cross‑reference and XMP metadata without full download
- Quarantines problematic URLs (default 6h) to avoid re‑attempting failing endpoints during batch work
- Optional CDN hardening hooks:
  - `originFallback(cfUrl)`: resolve a CDN URL to origin (e.g., R2/S3) and re‑probe
  - `invalidateCloudFrontKey(key)`: invalidate bad cache entries when origin succeeds

Example with a CloudFront → S3 origin fallback:

```ts
const extract = new Extract({
  debug: true,
  userAgent: "my-app/metadata-extractor",
  quarantineTtlMs: 6 * 60 * 60 * 1000,
  originFallback: (url) => url.replace("https://cdn.example.com/", "https://s3.example.com/"),
  invalidateCloudFrontKey: async (urlOrKey) => {
    // map full URL to distribution key if needed and call your invalidation API
  },
});

const meta = await extract.extractRemote("https://cdn.example.com/asset.png", 96 * 1024);
```

## Image Extraction Details

- PNG: IHDR dims, color type → color model/space, sRGB/cHRM/iCCP, iTXt/zTXt (XMP, Creation Time), EXIF (eXIf)
- JPEG: SOF dims, EXIF orientation (0x0112) and DateTimeOriginal (0x9003), ICC in APP2
- WebP: VP8/VP8L/VP8X dims, alpha flag, animation frames, ICC/XMP where present
- GIF: dims and frame counting via blocks
- BMP: dims and basic color model
- AVIF/HEIF: ISOBMFF box walk for dims (ispe), XMP extraction
- ICO: picks largest entry; detects embedded PNG
- TIFF: classic TIFF IFDs for dims/samples; BigTIFF intentionally not parsed in lightweight path

Image parser is header‑first and avoids full decode; it surfaces useful metadata quickly and safely.

## Document Extraction Details

- PDF: version, linearization, encryption, page counting via Pages/Count (with fallbacks), quick text preview (BT/Tj/TJ), Info dictionary strings (Author/Subject/Title/Keywords), dates parsed from Info and XMP
- DOCX/PPTX/XLSX: reads `docProps/core.xml` and `app.xml`; for DOCX extracts preview text from `word/document.xml`; for XLSX inspects sheets, sharedStrings, and common features (formulas, charts, pivots, macros)
- RTF: naive but effective text stripping for preview/word count
- Plain text and code/data: BOM detection, UTF‑8 validation with Windows‑1252 fallback, word/line counts, language hint from extension

ZIP handling is a minimal central‑directory reader with deflate via `fflate` only when necessary.

## API Reference (selected)

- `class Extract(opts?: ExtractorHardenedOptions)` → unified image/doc extractor with network hardening.
  - `extractRemote(source: Buffer | string, size = 16384, timeout = 5000)` → `ExpandedDocSpecs | ExpandedImgSpecs`
  - Options: `originFallback`, `invalidateCloudFrontKey`, `quarantineTtlMs`, `userAgent`, `debug`, plus injection of `img`/`docs` extractors
- `class ImgMetadataExtractor` → image‑only, Buffer in
  - `getImageSpecsWorkup(buffer: Buffer, size = 4096 * 6)` → `ExpandedImgSpecs`
- `class DocMetadataExtractor` → document‑only, Buffer in
  - `getDocumentSpecsWorkup(buffer: Buffer, mime: string, filename?: string)` → `ExpandedDocSpecs`

Advanced: You can share extractor instances across many `Extract` instances via the provided mixins if needed.

## Examples

Classify many URLs efficiently:

```ts
import { Extract } from "@slipstream/metadata";

const extract = new Extract();
const urls = [
  "https://example.com/report.pdf",
  "https://example.com/photo.jpg",
  "https://example.com/deck.pptx",
];

const results = await Promise.all(urls.map(u => extract.extractRemote(u, 96 * 1024)));
for (const r of results) {
  console.log(r.type === "IMAGE" ? r.format : r.format, r.source);
}
```

Images from disk (Buffer):

```ts
import { ImgMetadataExtractor } from "@slipstream/metadata/images";

const img = new ImgMetadataExtractor();
const buf = await fs.promises.readFile("./photo.webp");
const specs = img.getImageSpecsWorkup(buf);
console.log(specs.width, specs.height, specs.colorSpace);
```

Documents from an upload (Buffer + MIME):

```ts
import { DocMetadataExtractor } from "@slipstream/metadata/docs";

const docs = new DocMetadataExtractor();
const { buffer, mime, filename } = await readUpload();
const specs = docs.getDocumentSpecsWorkup(buffer, mime, filename);
console.log(specs.format, specs.pageCount, specs.textPreview);
```

## Runtime Notes

- Node 18+ recommended (built‑in `fetch` and WHATWG streams); the library uses `Buffer` and `fetch`
- No native dependencies; only `fflate` for ZIP/deflate
- Network timeouts and idle thresholds are conservative by default to keep batch processing snappy

## Limits & Caveats

- Header‑first by design: not a full codec/renderer
- BigTIFF is detected but not parsed in the lightweight path
- Some edge/CDN behaviors may ignore Range on the first probe; the fetcher retries with `HEAD` and guardrails
- If a URL is quarantined due to repeated failures, you’ll get `QUARANTINED: <url>` until TTL expires (override via `quarantineTtlMs`)

## Local Development

- Build: `pnpm --filter @slipstream/metadata build`
- Typecheck/Lint: `pnpm --filter @slipstream/metadata typecheck` / `pnpm --filter @slipstream/metadata lint`
- Ad‑hoc test runner: `pnpm --filter @slipstream/metadata test` (see `src/test/` for examples)

---

## CDN Integration Example (assets.aicoalesce.com)

If you’re serving uploads from `assets.aicoalesce.com` / `assets-dev.aicoalesce.com` behind a CDN, wire up `originFallback` and `invalidateCloudFrontKey` so the extractor can heal around cache issues without blocking batches.

```ts
import { Extract } from "@slipstream/metadata";

// Map CDN URLs to your origin bucket(s)
const ORIGIN = {
  prod: "https://your-prod-bucket.s3.amazonaws.com", // e.g., s3://your-prod-bucket
  dev: "https://your-dev-bucket.s3.amazonaws.com",   // e.g., s3://your-dev-bucket
};

function cfToOrigin(cfUrl: string): string {
  try {
    const u = new URL(cfUrl);
    const path = u.pathname; // keep exact key
    if (u.hostname === "assets.aicoalesce.com") return `${ORIGIN.prod}${path}`;
    if (u.hostname === "assets-dev.aicoalesce.com") return `${ORIGIN.dev}${path}`;
    return cfUrl; // non‑CDN domains untouched
  } catch {
    return cfUrl;
  }
}

// Invalidate a single CDN key; implement either an internal endpoint
// or call AWS CloudFront directly (example below commented out).
async function invalidateKey(urlOrKey: string) {
  const key = urlOrKey.startsWith("http") ? new URL(urlOrKey).pathname : urlOrKey;

  // Option A: Internal service (recommended for apps)
  if (process.env.CF_INVALIDATE_ENDPOINT) {
    await fetch(process.env.CF_INVALIDATE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
    return;
  }

  // Option B: AWS SDK v3 (uncomment and add dependency if you prefer)
  // import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
  // const cf = new CloudFrontClient({});
  // await cf.send(new CreateInvalidationCommand({
  //   DistributionId: process.env.CF_DISTRIBUTION_ID!,
  //   InvalidationBatch: {
  //     CallerReference: String(Date.now()),
  //     Paths: { Quantity: 1, Items: [key] },
  //   },
  // }));
}

const extract = new Extract({
  userAgent: "slipstream/metadata (+apps/ws-server)",
  originFallback: cfToOrigin,
  invalidateCloudFrontKey: invalidateKey,
  quarantineTtlMs: 6 * 60 * 60 * 1000,
});

// Example: classify with a generous head size for richer headers/XMP
const meta = await extract.extractRemote(
  "https://assets.aicoalesce.com/upload/abc123/some-file.png",
  96 * 1024
);
console.log(meta.type, meta.source);
```

Questions or ideas to improve extraction heuristics for new formats? Contributions welcome.

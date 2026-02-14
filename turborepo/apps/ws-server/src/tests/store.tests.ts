import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import * as dotenv from "dotenv";
import type {
  PageAnnotation,
  PageBox,
  StructuredPageText
} from "@d0paminedriven/pdfdown";
import { Fs } from "@d0paminedriven/fs";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { ExtractService } from "@/extract/index.ts";
import type { OffsetCache, PageOffsetEntry } from "@/store/types.ts";
import { UserStoreWorkupService } from "@/store/workup.ts";
import { VoyageEmbeddingService } from "@/voyage/index.ts";
import { PrismaDbService } from "@slipstream/db/factory";

dotenv.config({ quiet: true });

// ── Real service wiring (mirrors index.ts) ──────────────────────────────────

const logger = LoggerService.getLoggerInstance({
  serviceName: "store-test",
  environment: "test",
  isProd: false
});

const extract = new ExtractService();

const db = new PrismaDbService({
  connectionString: process.env.DATABASE_URL ?? "",
  poolMax: 10,
  idleTimeoutMs: 30000
});

const prisma = new PrismaService(db, extract, false);
const voyage = new VoyageEmbeddingService(process.env.VOYAGE_API_KEY ?? "");

// ── Harness — exposes protected methods for testing ─────────────────────────

class StoreWorkupHarness extends UserStoreWorkupService {
  constructor() {
    super(logger, voyage, prisma, process.env.VOYAGE_API_KEY ?? "");
  }

  public buildOffsets(
    attachmentId: string,
    structuredText: StructuredPageText[],
    imagePages: Set<number>,
    annotPages: Set<number>
  ) {
    return this.buildAttachmentOffsetCache(
      attachmentId,
      structuredText,
      imagePages,
      annotPages
    );
  }

  public getOffsetCache(attachmentId: string) {
    const cache = this.attScopedOffsets.get(attachmentId);
    if (!cache) throw new Error(`missing offset cache for ${attachmentId}`);
    return cache;
  }

  public toOffsetEntries(cache: ReadonlyMap<number, OffsetCache>) {
    return this.offsetEntriesFromCache(cache);
  }

  public boundary(pageNumber: number, sorted: readonly PageOffsetEntry[]) {
    return this.findBoundaryOffset(pageNumber, sorted);
  }

  public async resolveOffsets(
    attachmentId: string,
    annotations: PageAnnotation[],
    pageBoxes: PageBox[]
  ) {
    return this.resolveAnnotationOffsets(attachmentId, annotations, pageBoxes);
  }

  public subtype(subtype: string) {
    return this.mapAnnotSubtype(subtype);
  }

  public cdnCompat(uri: string) {
    return this.detectCdnCompatStatus(new URL(uri));
  }

  public pageBoxes(attId: string, meta: Parameters<typeof this.pageBoxHelper>[1]) {
    return this.pageBoxHelper(attId, meta);
  }
}

// ── Shared PDF extraction helper ────────────────────────────────────────────

const fs = new Fs(process.cwd());
const pdfDir = "src/test/__out__/condensed";

async function extractPdf(filename: string) {
  const buf = fs.fileToBuffer(`${pdfDir}/${filename}`);
  const { PdfDown } = await import("@d0paminedriven/pdfdown");
  const pdfDown = new PdfDown(buf);

  const [structuredText, images, annotations, meta] = await Promise.all([
    pdfDown.structuredTextAsync(),
    pdfDown.imagesPerPageAsync(),
    pdfDown.annotationsPerPageAsync(),
    pdfDown.metadataAsync()
  ]);

  const imagePages = new Set(images.map(img => img.page));
  const annotPages = new Set(annotations.map(annot => annot.page));

  return {
    structuredText,
    images,
    annotations,
    meta,
    imagePages,
    annotPages
  } as const;
}

type ExtractedPdf = Awaited<ReturnType<typeof extractPdf>>;

// Track tmp files for Voyage cleanup
const tmpFilesToClean = Array.of<string>();

after(async () => {
  for (const tmpName of tmpFilesToClean) {
    try {
      fs.rmTmpFile(tmpName);
    } catch {
      // best-effort cleanup
    }
  }
  try {
    await voyage.exitPython();
  } catch {
    // no-op: Python bridge may already be shut down
  }
  await db.p(false).$disconnect();
  await LoggerService.resetInstance();
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 1: pdfdown extraction + offset cache (real PDF)
// ══════════════════════════════════════════════════════════════════════════════

describe("pdfdown extraction + offset cache (Geminastics-Pt-I)", () => {
  const store = new StoreWorkupHarness();
  const attId = "att-geminastics-pt-i";
  let extracted: ExtractedPdf | null = null;

  before(async () => {
    extracted = await extractPdf("Geminastics-Pt-I.pdf");
  });

  const extractedPdf = () => {
    if (!extracted) {
      throw new Error("missing extracted PDF fixture for Geminastics-Pt-I");
    }
    return extracted;
  };

  it("extracts structured text from a real PDF", () => {
    const data = extractedPdf();
    assert.ok(data.structuredText.length > 0, "should have pages");
    for (const page of data.structuredText) {
      assert.equal(typeof page.page, "number");
      assert.equal(typeof page.body, "string");
    }
  });

  it("page numbers are sequential starting from 1", () => {
    const pages = extractedPdf().structuredText.map(p => p.page);
    for (let i = 0; i < pages.length; i++) {
      assert.equal(pages[i], i + 1);
    }
  });

  it("builds offsets with monotonically increasing ranges", () => {
    const data = extractedPdf();
    const offsets = store.buildOffsets(
      attId,
      data.structuredText,
      data.imagePages,
      data.annotPages
    );

    assert.equal(offsets.length, data.structuredText.length);

    let prevEnd = 0;
    for (const entry of offsets) {
      const [start, end] = entry.offsets;
      assert.equal(start, prevEnd, `page ${entry.page} start should equal prev end`);
      assert.ok(end >= start, `page ${entry.page} end >= start`);
      prevEnd = end;
    }
  });

  it("hasImages/hasAnnots flags match extraction sets", () => {
    const data = extractedPdf();
    const cache = store.getOffsetCache(attId);
    for (const [page, entry] of cache.entries()) {
      assert.equal(
        entry.hasImages,
        data.imagePages.has(page),
        `page ${page} hasImages mismatch`
      );
      assert.equal(
        entry.hasAnnots,
        data.annotPages.has(page),
        `page ${page} hasAnnots mismatch`
      );
    }
  });

  it("offset entries include empty-body pages with zero-length spans", () => {
    const cache = store.getOffsetCache(attId);
    const sorted = store.toOffsetEntries(cache);

    assert.equal(sorted.length, cache.size);
    for (const entry of sorted) {
      const cacheEntry = cache.get(entry.page);
      assert.ok(cacheEntry, `cache entry should exist for page ${entry.page}`);
      if (!cacheEntry) continue;
      if (cacheEntry.body.trim().length === 0) {
        assert.equal(
          entry.globalEnd,
          entry.globalStart,
          `empty page ${entry.page} should have zero-length span`
        );
        assert.equal(entry.bodyLength, 0, `empty page ${entry.page} body length should be 0`);
      } else {
        assert.ok(
          entry.globalEnd > entry.globalStart,
          `non-empty page ${entry.page} should span chars`
        );
      }
    }
  });

  it("boundary resolution returns valid offsets for missing/empty pages", () => {
    const data = extractedPdf();
    const cache = store.getOffsetCache(attId);
    const sorted = store.toOffsetEntries(cache);

    // Test a page beyond the last page
    const beyondPage = data.structuredText.length + 10;
    const boundary = store.boundary(beyondPage, sorted);
    assert.ok(boundary.startOffset >= 0);
    assert.ok(boundary.endOffset >= boundary.startOffset);

    // Test page 0 (before any page)
    const beforeFirst = store.boundary(0, sorted);
    assert.equal(beforeFirst.startOffset, 0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 2: OCR PDF extraction + offset cache
// ══════════════════════════════════════════════════════════════════════════════

describe("pdfdown extraction + offset cache (hello-ocr)", () => {
  const store = new StoreWorkupHarness();
  const attId = "att-hello-ocr";
  let extracted: ExtractedPdf | null = null;

  before(async () => {
    extracted = await extractPdf("hello-ocr.pdf");
  });

  const extractedPdf = () => {
    if (!extracted) {
      throw new Error("missing extracted PDF fixture for hello-ocr");
    }
    return extracted;
  };

  it("extracts text from an OCR PDF", () => {
    assert.ok(
      extractedPdf().structuredText.length > 0,
      "OCR PDF should have pages"
    );
  });

  it("builds offsets for OCR PDF", () => {
    const data = extractedPdf();
    const offsets = store.buildOffsets(
      attId,
      data.structuredText,
      data.imagePages,
      data.annotPages
    );

    assert.equal(offsets.length, data.structuredText.length);

    let prevEnd = 0;
    for (const entry of offsets) {
      const [start, end] = entry.offsets;
      assert.equal(start, prevEnd);
      assert.ok(end >= start);
      prevEnd = end;
    }
  });

  it("page count matches metadata", () => {
    const data = extractedPdf();
    assert.equal(data.structuredText.length, data.meta.pageCount);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 3: page box + annotation resolution (real PDF)
// ══════════════════════════════════════════════════════════════════════════════

describe("page box + annotation resolution (Geminastics-Pt-I)", () => {
  const store = new StoreWorkupHarness();
  const attId = "att-annot-resolution";
  let extracted: ExtractedPdf | null = null;

  before(async () => {
    extracted = await extractPdf("Geminastics-Pt-I.pdf");
    if (!extracted) {
      throw new Error("failed to load Geminastics-Pt-I fixture");
    }
    const data = extracted;
    store.buildOffsets(
      attId,
      data.structuredText,
      data.imagePages,
      data.annotPages
    );
  });

  const extractedPdf = () => {
    if (!extracted) {
      throw new Error("missing extracted PDF fixture for annotation resolution");
    }
    return extracted;
  };

  it("resolves annotation offsets within page bounds", async () => {
    const data = extractedPdf();
    if (data.annotations.length === 0) {
      // PDF may not have annotations — skip gracefully
      return;
    }

    const resolved = await store.resolveOffsets(
      attId,
      data.annotations,
      data.meta.pageBoxes
    );

    assert.equal(resolved.length, data.annotations.length);

    const cache = store.getOffsetCache(attId);

    for (const annot of resolved) {
      assert.ok(annot.startOffset >= 0, `startOffset >= 0 on page ${annot.pageNumber}`);
      assert.ok(
        annot.endOffset >= annot.startOffset,
        `endOffset >= startOffset on page ${annot.pageNumber}`
      );
      assert.equal(typeof annot.subtype, "string");
      assert.ok(annot.subtype.length > 0);
      assert.equal(typeof annot.isCdnLink, "boolean");

      // If page has content, offsets should be within global bounds
      const pageEntry = cache.get(annot.pageNumber);
      if (pageEntry && pageEntry.body.trim().length > 0) {
        const [globalStart, globalEnd] = pageEntry.offsets;
        assert.ok(
          annot.startOffset >= globalStart,
          `annot startOffset (${annot.startOffset}) >= globalStart (${globalStart}) on page ${annot.pageNumber}`
        );
        assert.ok(
          annot.endOffset <= globalEnd,
          `annot endOffset (${annot.endOffset}) <= globalEnd (${globalEnd}) on page ${annot.pageNumber}`
        );
      }
    }
  });

  it("non-CDN URIs have isCdnLink: false", async () => {
    const data = extractedPdf();
    if (data.annotations.length === 0) return;

    const resolved = await store.resolveOffsets(
      attId,
      data.annotations,
      data.meta.pageBoxes
    );

    for (const annot of resolved) {
      if (annot.uri && URL.canParse(annot.uri)) {
        const host = new URL(annot.uri).hostname;
        if (host !== "assets.aicoalesce.com" && host !== "assets-dev.aicoalesce.com") {
          assert.equal(annot.isCdnLink, false, `URI ${annot.uri} should not be CDN`);
        }
      }
    }
  });
});

// Synthetic annotation resolution test (no PDF needed — exercises geometry + boundary)
describe("annotation offset resolution (synthetic)", () => {
  it("uses geometry-only approximation and boundary fallback for empty/missing pages", async () => {
    const store = new StoreWorkupHarness();
    const attachmentId = "att-geometry";
    const structured = [
      { page: 1, header: "", body: "a".repeat(100), footer: "" },
      { page: 2, header: "", body: "", footer: "" },
      { page: 3, header: "", body: "b".repeat(100), footer: "" }
    ] satisfies StructuredPageText[];

    store.buildOffsets(
      attachmentId,
      structured,
      new Set<number>(),
      new Set([1, 2, 4])
    );

    const annots = [
      {
        page: 1,
        subtype: "Link",
        rect: [0, 900, 61.2, 1008],
        uri: "https://example.com/top"
      },
      {
        page: 1,
        subtype: "Link",
        rect: [0, 100, 61.2, 200],
        uri: "https://example.com/bottom"
      },
      {
        page: 2,
        subtype: "Widget",
        rect: [0, 40, 10, 50],
        content: "empty-page-annot"
      },
      {
        page: 4,
        subtype: "Reference",
        rect: [0, 40, 10, 50],
        content: "missing-page-annot"
      }
    ] satisfies PageAnnotation[];

    const pageBoxes = Array.of<PageBox>();

    const resolved = await store.resolveOffsets(attachmentId, annots, pageBoxes);
    assert.equal(resolved.length, 4);

    const top = resolved[0];
    assert.equal(top?.startOffset, 5);
    assert.equal(top?.endOffset, 15);
    assert.equal(top?.subtype, "LINK");

    const bottom = resolved[1];
    assert.equal(bottom?.startOffset, 85);
    assert.equal(bottom?.endOffset, 95);
    assert.equal((bottom?.startOffset ?? 0) > (top?.startOffset ?? 0), true);

    const emptyBody = resolved[2];
    assert.equal(emptyBody?.startOffset, 100);
    assert.equal(emptyBody?.endOffset, 100);
    assert.equal(emptyBody?.subtype, "WIDGET");

    const missingPage = resolved[3];
    assert.equal(missingPage?.startOffset, 200);
    assert.equal(missingPage?.endOffset, 200);
    assert.equal(missingPage?.subtype, "REFERENCE");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 4: subtype mapping
// ══════════════════════════════════════════════════════════════════════════════

describe("annotation subtype mapping", () => {
  const store = new StoreWorkupHarness();

  it("maps all valid subtypes", () => {
    const cases = [
      ["Link", "LINK"],
      ["Highlight", "HIGHLIGHT"],
      ["Widget", "WIDGET"],
      ["Reference", "REFERENCE"],
      ["Text", "TEXT"],
      ["Markup", "MARKUP"],
      ["AutoLink", "AUTOLINK"]
    ] as const;

    for (const [input, expected] of cases) {
      assert.equal(store.subtype(input), expected, `${input} → ${expected}`);
    }
  });

  it("maps unknown subtype to LINK", () => {
    assert.equal(store.subtype("mystery"), "LINK");
    assert.equal(store.subtype("FreeText"), "LINK");
    assert.equal(store.subtype(""), "LINK");
  });

  it("is case insensitive", () => {
    assert.equal(store.subtype("link"), "LINK");
    assert.equal(store.subtype("WIDGET"), "WIDGET");
    assert.equal(store.subtype("highlight"), "HIGHLIGHT");
    assert.equal(store.subtype("autoLink"), "AUTOLINK");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 5: CDN compat detection
// ══════════════════════════════════════════════════════════════════════════════

describe("cdn compat detection", () => {
  const store = new StoreWorkupHarness();

  it("classifies attachment-id top path as ACTIVE", () => {
    const result = store.cdnCompat(
      "https://assets.aicoalesce.com/upload/converted/att_wtywhioyfurelljpivpbgdk3.pdf"
    );
    assert.equal(result.compatStatus, "ACTIVE");
    assert.equal(result.source, "att-prefix");
  });

  it("classifies epoch-prefixed top path as ALIASED", () => {
    const result = store.cdnCompat(
      "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1762810468102-Chapter_XV.pdf"
    );
    assert.equal(result.compatStatus, "ALIASED");
    assert.equal(result.source, "epoch-prefix");
  });

  it("falls back to legacy path semantics for non-standard top paths", () => {
    const converted = store.cdnCompat(
      "https://assets.aicoalesce.com/upload/converted/not-att-filename.pdf"
    );
    const nonConverted = store.cdnCompat(
      "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/not-att-filename.pdf"
    );

    assert.equal(converted.compatStatus, "ACTIVE");
    assert.equal(converted.source, "legacy-path-fallback");
    assert.equal(nonConverted.compatStatus, "ALIASED");
    assert.equal(nonConverted.source, "legacy-path-fallback");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 6: Voyage tokenization (real API)
// ══════════════════════════════════════════════════════════════════════════════

describe("Voyage multimodal tokenization (real API)", () => {
  const sequence = Array.of<{ t: string } | { f: string }>();

  before(async () => {
    const extracted = await extractPdf("Geminastics-Pt-I.pdf");

    // Build interleaved text + image sequences (same pattern as voyage-tokenize.ts)
    const imagesByPage = new Map<number, typeof extracted.images>();
    for (const img of extracted.images) {
      const existing = imagesByPage.get(img.page);
      existing ? existing.push(img) : imagesByPage.set(img.page, [img]);
    }

    for (const page of extracted.structuredText) {
      if (page.body && page.body.trim().length > 0) {
        sequence.push({ t: page.body });
      }
      const pageImgs = imagesByPage.get(page.page);
      if (pageImgs) {
        for (const img of pageImgs) {
          const tmpName = fs.uniqueTmpName(
            `test-voyage-${img.page}-${img.imageIndex}`,
            "png"
          );
          const absTmpPath = resolve(tmpdir(), tmpName);
          fs.writeTmp(tmpName, img.data);
          sequence.push({ f: absTmpPath });
          tmpFilesToClean.push(tmpName);
        }
      }
    }
  });

  it("counts tokens for interleaved text + images", async () => {
    if (sequence.length === 0) {
      return; // No content to tokenize
    }

    const result = await voyage.countUsageFromPaths(
      [sequence],
      "voyage-multimodal-3.5"
    );

    assert.ok(result.total_tokens > 0, "total_tokens should be > 0");
    assert.equal(result.model, "voyage-multimodal-3.5");
    assert.equal(typeof result.text_tokens, "number");
    assert.equal(typeof result.image_pixels, "number");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 7: page box helper (real PDF metadata)
// ══════════════════════════════════════════════════════════════════════════════

describe("page box helper (Ascension-Through-Fire)", () => {
  const store = new StoreWorkupHarness();
  let extracted: ExtractedPdf | null = null;

  before(async () => {
    extracted = await extractPdf(
      "Ascension-Through-Fire---A-Sacred-Arrival-Above-Infernal-Gates.pdf"
    );
  });

  const extractedPdf = () => {
    if (!extracted) {
      throw new Error("missing extracted PDF fixture for page box helper");
    }
    return extracted;
  };

  it("produces valid page box cache from real metadata", () => {
    const data = extractedPdf();
    const result = store.pageBoxes("att-ascension", data.meta);

    assert.ok(result.pageBoxCache.length > 0, "should have at least one page box");
    assert.equal(result.pageCount, data.meta.pageCount);

    // Coverage should sum to approximately 1 for non-anomaly entries
    for (const box of result.pageBoxCache) {
      assert.ok(box.coverage > 0 && box.coverage <= 1, `coverage ${box.coverage} in (0, 1]`);
      assert.ok(box.width > 0, "width > 0");
      assert.ok(box.height > 0, "height > 0");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 8: offset cache (synthetic — preserves original unit test coverage)
// ══════════════════════════════════════════════════════════════════════════════

describe("store workup offset cache (synthetic)", () => {
  it("builds attachment-scoped offsets with no separator semantics", () => {
    const store = new StoreWorkupHarness();
    const structured = [
      { page: 1, header: "", body: "abc", footer: "" },
      { page: 2, header: "", body: "de", footer: "" },
      { page: 3, header: "", body: "", footer: "" }
    ] satisfies StructuredPageText[];

    const offsets = store.buildOffsets(
      "att-cache",
      structured,
      new Set([2]),
      new Set([1, 3])
    );

    assert.equal(offsets.length, 3);
    assert.deepEqual(
      offsets.map(v => [v.page, v.offsets[0], v.offsets[1]]),
      [
        [1, 0, 3],
        [2, 3, 5],
        [3, 5, 5]
      ]
    );
    assert.equal(offsets[1]?.hasImages, true);
    assert.equal(offsets[0]?.hasAnnots, true);
    assert.equal(offsets[2]?.hasAnnots, true);

    const cache = store.getOffsetCache("att-cache");
    const sorted = store.toOffsetEntries(cache);
    assert.deepEqual(
      sorted.map(v => [v.page, v.globalStart, v.globalEnd]),
      [
        [1, 0, 3],
        [2, 3, 5],
        [3, 5, 5]
      ]
    );
  });
});

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
import { SharpService } from "@/sharp/index.ts";
import type { OffsetCache, PageOffsetEntry } from "@/store/types.ts";
import { UserStoreVectorService } from "@/store/vector-store.ts";
import { UserStoreWorkupService } from "@/store/workup.ts";
import { VoyageEmbeddingService } from "@/voyage/index.ts";
import { PrismaDbService } from "@slipstream/db/factory";
import { Client } from "pg";

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
const sharp = new SharpService();
const vectorStore = new UserStoreVectorService(
  logger,
  voyage,
  prisma,
  sharp,
  process.env.VOYAGE_API_KEY ?? ""
);

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
type RetrievalProbeStoreCandidate = {
  storeId: string;
  userId: string;
  storeName: string;
  claudtullusMatches: bigint;
  geminseaMatches: bigint;
};

type StoreInventoryRow = {
  storeId: string;
  userId: string;
  storeName: string;
  totalDocs: bigint;
  activeDocs: bigint;
  totalChunks: bigint;
  readyChunks: bigint;
  errorChunks: bigint;
  nullEmbeddingReadyChunks: bigint;
};

type EmbeddingModelDistRow = {
  embeddingModel: string;
  chunkCount: bigint;
  readyCount: bigint;
};

type TopChunkRow = {
  id: string;
  chunkIndex: number;
  content: string;
  embeddingModel: string;
  score: number;
};

type AlignmentChunkRow = {
  id: string;
  chunkIndex: number;
  content: string;
  embeddingModel: string;
  state: string;
  hasEmbedding: boolean;
  multimodalScore: number | null;
  contextScore: number | null;
};

type IntegrityRow = {
  id: string;
  storeId: string;
  chunkIndex: number;
  embeddingModel: string;
};

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

// ══════════════════════════════════════════════════════════════════════════════
// Suite 9: vector retrieval probe (real DB + Voyage)
// ══════════════════════════════════════════════════════════════════════════════

describe("vector retrieval probe (real DB + Voyage)", () => {
  it("retrieves Claudtullus and Geminsea chunks from a default user store", async t => {
  const pg = new Client(process.env.DATABASE_URL ?? "");
 await pg.connect()
    const candidateRows = await db.p(false).$queryRaw<
      RetrievalProbeStoreCandidate[]
    >`
      SELECT
        chunk."storeId" AS "storeId",
        store."userId" AS "userId",
        store."storeName" AS "storeName",
        COUNT(*) FILTER (
          WHERE chunk.content ILIKE '%Claudtullus%'
        ) AS "claudtullusMatches",
        COUNT(*) FILTER (
          WHERE chunk.content ILIKE '%Geminsea%'
        ) AS "geminseaMatches"
      FROM "UserStoreDocChunk" chunk
      INNER JOIN "UserStoreDoc" doc ON doc.id = chunk."docId"
      INNER JOIN "UserStore" store ON store.id = chunk."storeId"
      WHERE chunk."deletedAt" IS NULL
      AND doc."deletedAt" IS NULL
      AND chunk.state = 'READY'::"UserStoreChunkState"
      AND doc.state IN ('ACTIVE'::"UserStoreDocState", 'PARTIAL'::"UserStoreDocState")
      AND (
        chunk.content ILIKE '%Claudtullus%'
        OR chunk.content ILIKE '%Geminsea%'
      )
      GROUP BY chunk."storeId", store."userId", store."storeName"
      HAVING
        COUNT(*) FILTER (WHERE chunk.content ILIKE '%Claudtullus%') > 0
        AND COUNT(*) FILTER (WHERE chunk.content ILIKE '%Geminsea%') > 0
      ORDER BY
        (
          COUNT(*) FILTER (WHERE chunk.content ILIKE '%Claudtullus%')
          + COUNT(*) FILTER (WHERE chunk.content ILIKE '%Geminsea%')
        ) DESC
      LIMIT 20;
    `;

    const defaultStoreCandidate = candidateRows.find(row => {
      return row.storeName === prisma.defaultUserStoreName(row.userId);
    });

    if (!defaultStoreCandidate) {
      t.skip(
        "No default user store contains both Claudtullus and Geminsea chunks"
      );
      return;
    }

    const probeTerms = ["Claudtullus", "Geminsea"] as const;

    for (const term of probeTerms) {
      const hits = await vectorStore.searchUserStoreChunks({
        userId: defaultStoreCandidate.userId,
        query: term,
        limit: 10,
        threshold: 0
      });

      assert.ok(
        hits.length > 0,
        `expected at least one vector hit for "${term}" in default store ${defaultStoreCandidate.storeId}`
      );

      const containsTerm = hits.some(hit => {
        const needle = term.toLowerCase();
        return (
          hit.content.toLowerCase().includes(needle) ||
          hit.filename.toLowerCase().includes(needle)
        );
      });
      assert.equal(
        containsTerm,
        true,
        `expected at least one hit containing "${term}" for user ${defaultStoreCandidate.userId}`
      );

      for (let i = 1; i < hits.length; i++) {
        const prev = hits[i - 1]?.score ?? Number.NEGATIVE_INFINITY;
        const next = hits[i]?.score ?? Number.NEGATIVE_INFINITY;
        assert.ok(
          prev >= next,
          `scores should be non-increasing for "${term}" at index ${i}`
        );
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 10: semantic search diagnostics (real DB + Voyage)
// ══════════════════════════════════════════════════════════════════════════════

describe("semantic search diagnostics (real DB + Voyage)", () => {
  const probeTerms = (
    process.env.PROBE_TERMS ?? "Claudtullus,Geminastics,neo-dinosaur hellscape"
  )
    .split(",")
    .map(t => t.trim())
    .filter((t): t is string => t.length > 0);

  let storeInventory = Array.of<StoreInventoryRow>();
  let candidateStore: StoreInventoryRow | null = null;
  const multimodalEmbeddings = new Map<string, number[]>();
  const contextEmbeddings = new Map<string, number[]>();

  before(async () => {
    // 1. Store inventory
    storeInventory = await db.p(false).$queryRaw<StoreInventoryRow[]>`
      SELECT
        store.id AS "storeId",
        store."userId",
        store."storeName",
        COUNT(DISTINCT doc.id) AS "totalDocs",
        COUNT(DISTINCT doc.id) FILTER (
          WHERE doc.state = 'ACTIVE'::"UserStoreDocState"
        ) AS "activeDocs",
        COUNT(chunk.id) AS "totalChunks",
        COUNT(chunk.id) FILTER (
          WHERE chunk.state = 'READY'::"UserStoreChunkState"
        ) AS "readyChunks",
        COUNT(chunk.id) FILTER (
          WHERE chunk.state = 'ERROR'::"UserStoreChunkState"
        ) AS "errorChunks",
        COUNT(chunk.id) FILTER (
          WHERE chunk.state = 'READY'::"UserStoreChunkState"
            AND chunk.embedding IS NULL
        ) AS "nullEmbeddingReadyChunks"
      FROM "UserStore" store
      LEFT JOIN "UserStoreDoc" doc
        ON doc."storeId" = store.id AND doc."deletedAt" IS NULL
      LEFT JOIN "UserStoreDocChunk" chunk
        ON chunk."storeId" = store.id AND chunk."deletedAt" IS NULL
      GROUP BY store.id, store."userId", store."storeName"
      ORDER BY COUNT(chunk.id) FILTER (
        WHERE chunk.state = 'READY'::"UserStoreChunkState"
      ) DESC
      LIMIT 50;
    `;

    // 2. Find candidate store
    candidateStore =
      storeInventory.find(
        row =>
          row.storeName === prisma.defaultUserStoreName(row.userId) &&
          Number(row.readyChunks) > 0
      ) ?? null;

    // 3. Pre-compute query embeddings for all probe terms with both models
    if (candidateStore && probeTerms.length > 0) {
      for (const term of probeTerms) {
        // multimodal-3.5
        try {
          const mmResult = await voyage.embedChunksMultimodal("base64", {
            inputs: [{ content: [{ type: "text", text: term }] }],
            model: "voyage-multimodal-3.5",
            input_type: "query"
          });
          if (!("detail" in mmResult) && mmResult.data[0]?.embedding) {
            multimodalEmbeddings.set(term, mmResult.data[0].embedding);
          }
        } catch {
          // best-effort — test will report missing embedding
        }

        // context-3
        try {
          const ctxResult = await voyage.embedChunksContextual({
            inputs: [[term]],
            input_type: "query",
            model: "voyage-context-3",
            output_dimension: 1024
          });
          if (
            !("detail" in ctxResult) &&
            ctxResult.data[0]?.data[0]?.embedding
          ) {
            contextEmbeddings.set(term, ctxResult.data[0].data[0].embedding);
          }
        } catch {
          // best-effort
        }
      }
    }
  });

  it("10a: store inventory", async t => {
    if (storeInventory.length === 0) {
      t.skip("No user stores found in database");
      return;
    }

    for (const row of storeInventory) {
      t.diagnostic(
        `Store: ${row.storeName} (id: ${row.storeId})\n` +
          `  Docs: ${Number(row.totalDocs)} total | ${Number(row.activeDocs)} ACTIVE\n` +
          `  Chunks: ${Number(row.totalChunks)} total | ` +
          `${Number(row.readyChunks)} READY | ` +
          `${Number(row.errorChunks)} ERROR | ` +
          `${Number(row.nullEmbeddingReadyChunks)} READY-but-NULL-embedding`
      );
    }

    if (candidateStore) {
      t.diagnostic(
        `\nCandidate store for probe: ${candidateStore.storeName} ` +
          `(user: ${candidateStore.userId})`
      );
    } else {
      t.diagnostic("\nNo candidate default store found with READY chunks");
    }
  });

  it("10b: embedding integrity audit", async t => {
    const broken = await db.p(false).$queryRaw<IntegrityRow[]>`
      SELECT
        chunk.id,
        chunk."storeId",
        chunk."chunkIndex",
        chunk."embeddingModel"
      FROM "UserStoreDocChunk" chunk
      WHERE chunk."deletedAt" IS NULL
        AND chunk.state = 'READY'::"UserStoreChunkState"
        AND chunk.embedding IS NULL
      ORDER BY chunk."storeId", chunk."chunkIndex"
      LIMIT 100;
    `;

    if (broken.length === 0) {
      t.diagnostic("Embedding integrity: PASS — no READY chunks with NULL embeddings");
    } else {
      t.diagnostic(
        `Embedding integrity: FAIL — ${broken.length} READY chunks with NULL embedding:`
      );
      for (const row of broken) {
        t.diagnostic(
          `  chunk ${row.id} (store: ${row.storeId}, idx: ${row.chunkIndex}, model: ${row.embeddingModel})`
        );
      }
    }
  });

  it("10c: model distribution", async t => {
    if (!candidateStore) {
      t.skip("No candidate store");
      return;
    }

    const dist = await db.p(false).$queryRaw<EmbeddingModelDistRow[]>`
      SELECT
        chunk."embeddingModel",
        COUNT(*) AS "chunkCount",
        COUNT(*) FILTER (
          WHERE chunk.state = 'READY'::"UserStoreChunkState"
        ) AS "readyCount"
      FROM "UserStoreDocChunk" chunk
      WHERE chunk."deletedAt" IS NULL
        AND chunk."storeId" = ${candidateStore.storeId}
      GROUP BY chunk."embeddingModel"
      ORDER BY "readyCount" DESC;
    `;

    t.diagnostic(`Model distribution for store ${candidateStore.storeName}:`);
    const models = Array.of<string>();
    for (const row of dist) {
      t.diagnostic(
        `  ${row.embeddingModel}: ${Number(row.chunkCount)} total | ${Number(row.readyCount)} READY`
      );
      models.push(row.embeddingModel);
    }

    if (models.includes("voyage-context-3") && models.includes("voyage-multimodal-3.5")) {
      t.diagnostic(
        "\n  WARNING: Store has chunks from BOTH embedding models. " +
          "Queries must use the correct model per chunk for reliable cosine similarity."
      );
    }
  });

  it("10d: multimodal-3.5 query search (current behavior)", async t => {
    if (!candidateStore) {
      t.skip("No candidate store");
      return;
    }

    for (const term of probeTerms) {
      t.diagnostic(`\n=== "${term}" (voyage-multimodal-3.5 query) ===`);

      const hits = await vectorStore.searchUserStoreChunks({
        userId: candidateStore.userId,
        query: term,
        limit: 10,
        threshold: 0
      });

      t.diagnostic(`  Hits: ${hits.length}`);
      for (const hit of hits) {
        const snippet = hit.content.slice(0, 120).replace(/\n/g, " ");
        t.diagnostic(
          `  [${(hit.score ?? 0).toFixed(4)}] chunk#${hit.chunkIndex} (${hit.embeddingModel}) "${snippet}..."`
        );
      }

      // Raw top-5 closest with multimodal embedding regardless of threshold
      const mmEmb = multimodalEmbeddings.get(term);
      if (mmEmb) {
        const embStr = `[${mmEmb.join(",")}]`;
        const top5 = await db.p(false).$queryRaw<TopChunkRow[]>`
          SELECT
            chunk.id,
            chunk."chunkIndex",
            LEFT(chunk.content, 150) AS content,
            chunk."embeddingModel",
            1 - (chunk.embedding <=> ${embStr}::vector) AS score
          FROM "UserStoreDocChunk" chunk
          INNER JOIN "UserStoreDoc" doc ON doc.id = chunk."docId"
          WHERE chunk."storeId" = ${candidateStore.storeId}
            AND chunk."deletedAt" IS NULL
            AND doc."deletedAt" IS NULL
            AND doc.state IN ('ACTIVE'::"UserStoreDocState", 'PARTIAL'::"UserStoreDocState")
            AND chunk.state = 'READY'::"UserStoreChunkState"
            AND chunk.embedding IS NOT NULL
          ORDER BY chunk.embedding <=> ${embStr}::vector
          LIMIT 5;
        `;

        t.diagnostic(`  Raw top-5 closest (multimodal-3.5 query, no threshold):`);
        for (const row of top5) {
          const snippet = row.content.replace(/\n/g, " ");
          t.diagnostic(
            `    [${row.score.toFixed(4)}] chunk#${row.chunkIndex} (${row.embeddingModel}) "${snippet}..."`
          );
        }
      } else {
        t.diagnostic("  (multimodal embedding unavailable for raw search)");
      }
    }
  });

  it("10e: context-3 query search (model-matched)", async t => {
    if (!candidateStore) {
      t.skip("No candidate store");
      return;
    }

    for (const term of probeTerms) {
      t.diagnostic(`\n=== "${term}" (voyage-context-3 query) ===`);

      const ctxEmb = contextEmbeddings.get(term);
      if (!ctxEmb) {
        t.diagnostic("  (context-3 embedding unavailable — skipping)");
        continue;
      }

      const embStr = `[${ctxEmb.join(",")}]`;

      // Search via prisma typed query
      const ctxHits = await prisma.searchUserStoreChunks(
        candidateStore.storeId,
        embStr,
        10,
        0
      );

      t.diagnostic(`  Hits: ${ctxHits.length}`);
      for (const hit of ctxHits) {
        const snippet = hit.content.slice(0, 120).replace(/\n/g, " ");
        t.diagnostic(
          `  [${(hit.score ?? 0).toFixed(4)}] chunk#${hit.chunkIndex} (${hit.embeddingModel}) "${snippet}..."`
        );
      }

      // Raw top-5 closest with context-3 embedding
      const top5 = await db.p(false).$queryRaw<TopChunkRow[]>`
        SELECT
          chunk.id,
          chunk."chunkIndex",
          LEFT(chunk.content, 150) AS content,
          chunk."embeddingModel",
          1 - (chunk.embedding <=> ${embStr}::vector) AS score
        FROM "UserStoreDocChunk" chunk
        INNER JOIN "UserStoreDoc" doc ON doc.id = chunk."docId"
        WHERE chunk."storeId" = ${candidateStore.storeId}
          AND chunk."deletedAt" IS NULL
          AND doc."deletedAt" IS NULL
          AND doc.state IN ('ACTIVE'::"UserStoreDocState", 'PARTIAL'::"UserStoreDocState")
          AND chunk.state = 'READY'::"UserStoreChunkState"
          AND chunk.embedding IS NOT NULL
        ORDER BY chunk.embedding <=> ${embStr}::vector
        LIMIT 5;
      `;

      t.diagnostic(`  Raw top-5 closest (context-3 query, no threshold):`);
      for (const row of top5) {
        const snippet = row.content.replace(/\n/g, " ");
        t.diagnostic(
          `    [${row.score.toFixed(4)}] chunk#${row.chunkIndex} (${row.embeddingModel}) "${snippet}..."`
        );
      }

      // Side-by-side comparison
      const mmEmb = multimodalEmbeddings.get(term);
      if (mmEmb) {
        const mmTop = await db.p(false).$queryRaw<TopChunkRow[]>`
          SELECT
            chunk.id,
            chunk."chunkIndex",
            LEFT(chunk.content, 60) AS content,
            chunk."embeddingModel",
            1 - (chunk.embedding <=> ${`[${mmEmb.join(",")}]`}::vector) AS score
          FROM "UserStoreDocChunk" chunk
          INNER JOIN "UserStoreDoc" doc ON doc.id = chunk."docId"
          WHERE chunk."storeId" = ${candidateStore.storeId}
            AND chunk."deletedAt" IS NULL
            AND doc."deletedAt" IS NULL
            AND doc.state IN ('ACTIVE'::"UserStoreDocState", 'PARTIAL'::"UserStoreDocState")
            AND chunk.state = 'READY'::"UserStoreChunkState"
            AND chunk.embedding IS NOT NULL
          ORDER BY chunk.embedding <=> ${`[${mmEmb.join(",")}]`}::vector
          LIMIT 1;
        `;

        const mmBest = mmTop[0];
        const ctxBest = top5[0];
        t.diagnostic(`\n  Side-by-side for "${term}":`);
        t.diagnostic(
          `    [multimodal-3.5 query] top score: ${mmBest ? mmBest.score.toFixed(4) : "N/A"}  model: ${mmBest?.embeddingModel ?? "N/A"}`
        );
        t.diagnostic(
          `    [context-3 query]      top score: ${ctxBest ? ctxBest.score.toFixed(4) : "N/A"}  model: ${ctxBest?.embeddingModel ?? "N/A"}`
        );
      }
    }
  });

  it("10f: content-to-embedding alignment", async t => {
    if (!candidateStore) {
      t.skip("No candidate store");
      return;
    }

    for (const term of probeTerms) {
      t.diagnostic(`\n=== Alignment check: "${term}" ===`);

      const mmEmb = multimodalEmbeddings.get(term);
      const ctxEmb = contextEmbeddings.get(term);

      if (!mmEmb && !ctxEmb) {
        t.diagnostic("  (no embeddings available — skipping)");
        continue;
      }

      const mmEmbStr = mmEmb ? `[${mmEmb.join(",")}]` : null;
      const ctxEmbStr = ctxEmb ? `[${ctxEmb.join(",")}]` : null;

      // Find chunks containing the term via ILIKE
      const ilikePattern = `%${term}%`;
      const matched = await db.p(false).$queryRaw<AlignmentChunkRow[]>`
        SELECT
          chunk.id,
          chunk."chunkIndex",
          LEFT(chunk.content, 200) AS content,
          chunk."embeddingModel",
          chunk.state::text AS state,
          (chunk.embedding IS NOT NULL) AS "hasEmbedding",
          CASE WHEN chunk.embedding IS NOT NULL AND ${mmEmbStr}::vector IS NOT NULL
            THEN 1 - (chunk.embedding <=> ${mmEmbStr ?? ""}::vector)
            ELSE NULL
          END AS "multimodalScore",
          CASE WHEN chunk.embedding IS NOT NULL AND ${ctxEmbStr}::vector IS NOT NULL
            THEN 1 - (chunk.embedding <=> ${ctxEmbStr ?? ""}::vector)
            ELSE NULL
          END AS "contextScore"
        FROM "UserStoreDocChunk" chunk
        INNER JOIN "UserStoreDoc" doc ON doc.id = chunk."docId"
        WHERE chunk."storeId" = ${candidateStore.storeId}
          AND chunk.content ILIKE ${ilikePattern}
          AND chunk."deletedAt" IS NULL
          AND doc."deletedAt" IS NULL
        ORDER BY chunk."chunkIndex"
        LIMIT 20;
      `;

      if (matched.length === 0) {
        t.diagnostic(`  No chunks contain "${term}" (ILIKE search)`);
        continue;
      }

      t.diagnostic(`  ${matched.length} chunks contain "${term}":`);
      for (const row of matched) {
        const snippet = row.content.slice(0, 100).replace(/\n/g, " ");
        const mmScore =
          row.multimodalScore != null ? row.multimodalScore.toFixed(4) : "N/A";
        const ctxScore =
          row.contextScore != null ? row.contextScore.toFixed(4) : "N/A";
        const delta =
          row.multimodalScore != null && row.contextScore != null
            ? (row.contextScore - row.multimodalScore).toFixed(4)
            : "N/A";

        t.diagnostic(
          `  chunk#${row.chunkIndex} (${row.embeddingModel}, ${row.state}, embed: ${row.hasEmbedding})\n` +
            `    "${snippet}..."\n` +
            `    multimodal-3.5 query: ${mmScore} | context-3 query: ${ctxScore} | delta: ${delta}`
        );
      }
    }
  });

  it("10g: query embedding sanity", async t => {
    const firstTerm = probeTerms[0];
    if (!firstTerm) {
      t.skip("No probe terms configured");
      return;
    }

    const mmEmb = multimodalEmbeddings.get(firstTerm);
    const ctxEmb = contextEmbeddings.get(firstTerm);

    const l2Norm = (v: number[]) =>
      Math.sqrt(v.reduce((s, x) => s + x * x, 0));

    t.diagnostic(`Query embedding sanity for "${firstTerm}":\n`);

    if (mmEmb) {
      t.diagnostic(`  voyage-multimodal-3.5:`);
      t.diagnostic(`    dimension: ${mmEmb.length}`);
      t.diagnostic(`    L2 norm:   ${l2Norm(mmEmb).toFixed(6)}`);
      t.diagnostic(`    first 5:   [${mmEmb.slice(0, 5).map(v => v.toFixed(6)).join(", ")}]`);
    } else {
      t.diagnostic("  voyage-multimodal-3.5: UNAVAILABLE");
    }

    if (ctxEmb) {
      t.diagnostic(`  voyage-context-3:`);
      t.diagnostic(`    dimension: ${ctxEmb.length}`);
      t.diagnostic(`    L2 norm:   ${l2Norm(ctxEmb).toFixed(6)}`);
      t.diagnostic(`    first 5:   [${ctxEmb.slice(0, 5).map(v => v.toFixed(6)).join(", ")}]`);
    } else {
      t.diagnostic("  voyage-context-3: UNAVAILABLE");
    }

    // Cross-model similarity
    // eslint-disable-next-line
    if (mmEmb && ctxEmb && mmEmb.length === ctxEmb.length) {
      let dotProduct = 0;
      for (let i = 0; i < mmEmb.length; i++) {
        dotProduct += (mmEmb[i] ?? 0) * (ctxEmb[i] ?? 0);
      }
      const normA = l2Norm(mmEmb);
      const normB = l2Norm(ctxEmb);
      const crossSim = normA > 0 && normB > 0 ? dotProduct / (normA * normB) : 0;

      t.diagnostic(`\n  Cross-model cosine similarity (same query, different models): ${crossSim.toFixed(6)}`);

      if (crossSim < 0.5) {
        t.diagnostic(
          "  CONFIRMED: Embedding spaces are NOT aligned (similarity < 0.5). " +
            "Same-model querying is required for reliable search."
        );
      } else if (crossSim < 0.8) {
        t.diagnostic(
          "  WARNING: Moderate cross-model alignment. Some queries may work " +
            "cross-model but unusual phrases will likely fail."
        );
      } else {
        t.diagnostic("  Cross-model alignment appears reasonable (>= 0.8).");
      }
    }
  });
});

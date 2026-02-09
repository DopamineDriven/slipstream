import type { CreateUserStoreRT } from "@/prisma/types.ts";
import type {
  AttScopedImg,
  AttScopedImgsCache,
  CdnCacheEntry,
  OffsetCache,
  PageDimensions,
  PageOffsetEntry,
  ResolvedAnnotation
} from "@/store/types.ts";
import type {
  PageAnnotation,
  PageBox,
  PageImage,
  StructuredPageText
} from "@d0paminedriven/pdfdown";
import type { Logger as PinoLogger } from "pino";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { VoyageEmbeddingService } from "@/voyage/index.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import { AttachmentSingleton } from "@slipstream/types";

interface AttScopedPageBoxCache extends PageBox {
  coverage: number;
}
export class UserStoreWorkupService {
  protected logger: PinoLogger;

  // ── Caches ───────────────────────────────────────────────────────────

  /** Key: `${userId}::${storeName}` → store record with bigint-to-num conversion */
  protected storeRegistry = new Map<string, CreateUserStoreRT<true>>();

  /** Key: epoch timestamp (13 chars) → CDN cache entry for non-compat (ALIASED) URLs */
  protected cdnEpochCache = new Map<string, CdnCacheEntry>();

  /**
   * external key -> attachment.id
   * internal key -> page number
   */
  protected attScopedOffsets = new Map<string, Map<number, OffsetCache>>();
  /**
   * external key -> attachment.id
   * internal key -> page number
   */
  protected attScopedImgs = new Map<string, Map<number, AttScopedImgsCache>>();

  /**
   * external key -> attachment.id
   * first internal key -> page number
   * second internal key -> img index number (more than one image per page possible)
   */
  protected attScopedAnnots = new Map<
    string,
    Map<
      number,
      AttScopedImgsCache
    >
  >();

  /**
   * external key -> attachment.id
   * internal key -> page number
   */
  protected attScopedMeta = new Map<string, Map<number, AttScopedImgsCache>>();
  /**
   * external key -> attachment.id
   * internal key -> page number
   */
  protected attScopedPageBoxes = new Map<
    string,
    Map<number, AttScopedPageBoxCache>
  >();

  constructor(
    logger: LoggerService,
    protected voyage: VoyageEmbeddingService,
    protected prisma: PrismaService,
    protected apiKey: string
  ) {
    this.logger = logger
      .getPinoInstance()
      .child({ node_version: process.version }, { msgPrefix: "[store] " });
  }

  // ── CDN Hostname ─────────────────────────────────────────────────────

  protected get cdnHostname() {
    return this.prisma.isProd
      ? "assets.aicoalesce.com"
      : "assets-dev.aicoalesce.com";
  }

  protected async extractPdf(buffer: Buffer){
      const { PdfDown } = await import("@d0paminedriven/pdfdown");

  const pdfDown = new PdfDown(buffer);

  const [structuredText, images, annots, meta] = await Promise.all([
    pdfDown.structuredTextAsync(),
    pdfDown.imagesPerPageAsync(),
    pdfDown.annotationsPerPageAsync(),
    pdfDown.metadataAsync()
  ]);


}

  protected annotOffsetsByPage(
    attachmentId: string,
    structuredText: StructuredPageText[],
    imagePages: Set<number>,
    annotPages: Set<number>
  ) {
    let offset = 0;

    const mapper = new Map<number, OffsetCache>();
    for (const { body, page } of structuredText) {
      mapper.set(page, {
        body,
        page,
        offsets: [offset, offset + body.length],
        hasAnnots: annotPages.has(page),
        hasImages: imagePages.has(page)
      });
      offset += body.length;
    }
    this.attScopedOffsets.set(attachmentId, mapper);
    return Array.from(mapper.values());
  }
  // imgMapper(att: AttachmentSingleton<true>, imgs: PageImage[]) {
  //   const imgByPage = new Map<number, AttScopedImgsCache>();

  //   for (const {
  //     data,
  //     width,
  //     height,
  //     imageIndex,
  //     page,
  //     colorSpace,
  //     filter
  //   } of imgs) {
  //     const size = data.byteLength;

  //     const _config = {
  //       height,
  //       width,
  //       aspectRatio: width / height,
  //       index: imageIndex,
  //       page,
  //       colorSpace,
  //       filter,
  //       // bytes
  //       size
  //     };
  //   }
  // }
  // ── Store Registry ───────────────────────────────────────────────────

  protected storeRegistryKey(userId: string, storeName: string) {
    return `${userId}::${storeName}`;
  }

  public async populateStoreRegistry(userId: string) {
    const stores = await this.prisma.getAllUserStores(userId);
    for (const store of stores) {
      const data = await this.prisma.getUserStoreUnique(
        userId,
        store.storeName
      );
      this.storeRegistry.set(
        this.storeRegistryKey(userId, store.storeName),
        data
      );
    }
  }

  public async ensureUserStore(userId: string, storeName?: string) {
    const name = storeName ?? this.prisma.defaultUserStoreName(userId);
    const key = this.storeRegistryKey(userId, name);

    const cached = this.storeRegistry.get(key);
    if (cached) return cached;

    const exists = await this.prisma.userStoreCheck(userId, name);
    if (exists) {
      const data = await this.prisma.getUserStoreUnique(userId, name);
      this.storeRegistry.set(key, data);
      return data;
    } else {
      const data = await this.prisma.createUserStore({
        userId,
        storeName: name,
        defaultEmbeddingDim: 1024,
        defaultEmbeddingModel: "voyage-multimodal-3.5",
        schemaVersion: "v1_0"
      });
      this.storeRegistry.set(key, data);
      return data;
    }
  }

  // ── CDN Epoch Cache ──────────────────────────────────────────────────

  public async populateCdnEpochCache(userId: string) {
    const attachments =
      await this.prisma.findDocumentAttachmentsForCdnCache(userId);
    for (const att of attachments) {
      if (!att.compatCdnUrl || !att.compatStatus) continue;
      // Only cache non-compat (ALIASED) URLs — compat has attachmentId in URL path already
      if (att.compatStatus !== "ACTIVE") {
        const parsed = this.prisma.urlParseNonCompat(att.compatCdnUrl);
        this.cdnEpochCache.set(parsed.timestamp, {
          fullUrl: att.compatCdnUrl,
          filename: att.filename ?? parsed.filename,
          attachmentId: att.id,
          userId: parsed.userId,
          ext: att.ext ?? parsed.ext,
          mime: att.mime ?? "",
          userStoreDocId: att.userStoreDoc?.id ?? null
        });
      }
    }
  }

  // ── Registry Sync ────────────────────────────────────────────────────

  public async syncRegistry(userId: string) {
    // Clear user-specific entries from both caches
    for (const key of this.storeRegistry.keys()) {
      if (key.startsWith(`${userId}::`)) {
        this.storeRegistry.delete(key);
      }
    }
    this.cdnEpochCache.clear();

    await Promise.all([
      this.populateStoreRegistry(userId),
      this.populateCdnEpochCache(userId)
    ]);
  }

  // ── CDN Detection & Resolution ───────────────────────────────────────

  protected detectCdnLink(uri: string) {
    if (!URL.canParse(uri)) return false;
    return new URL(uri).hostname === this.cdnHostname;
  }

  protected async resolveCdnAnnotation(uri: string) {
    if (!URL.canParse(uri)) return;

    const url = new URL(uri);
    if (url.hostname !== this.cdnHostname) {
      return { linkedDocId: null, attachmentId: null };
    }

    // Determine compat status from URL structure: "converted" in path → ACTIVE
    const path = url.pathname;
    const basePath = path.slice(0, path.lastIndexOf("/"));
    const afterOrigin = basePath.indexOf("/", 1);
    const secondEnd = basePath.indexOf("/", afterOrigin + 1);
    const second =
      secondEnd > 0
        ? basePath.slice(afterOrigin + 1, secondEnd)
        : basePath.slice(afterOrigin + 1);
    const isCompat = second === "converted";

    if (!isCompat) {
      // ~98%: epoch-based O(1) cache lookup via urlParseNonCompat
      const parsed = this.prisma.urlParseNonCompat(uri);
      const entry = this.cdnEpochCache.get(parsed.timestamp);
      if (entry) {
        return {
          linkedDocId: entry.userStoreDocId,
          attachmentId: entry.attachmentId
        };
      }
      // Cache miss fallback: indexed DB query
      const att = await this.prisma.findAttachmentByCdnUrl(uri);
      if (att) {
        return {
          linkedDocId: att.userStoreDoc?.id ?? null,
          attachmentId: att.id
        };
      }
      return { linkedDocId: null, attachmentId: null };
    }

    // ~2%: compat — filename IS the attachmentId, extracted by urlParseCompat
    const parsed = this.prisma.urlParseCompat(uri);
    const doc = await this.prisma.findUserStoreDocByAttachmentId(
      parsed.attachmentId
    );
    return {
      linkedDocId: doc?.id ?? null,
      attachmentId: parsed.attachmentId
    };
  }

  // ── Annotation Offset Resolution ─────────────────────────────────────
  // These methods are protected — they migrate to store/vector-store.ts later

  protected async resolveAnnotationOffsets(
    structuredText: StructuredPageText[],
    annotations: PageAnnotation[],
    pageBoxes: PageBox[]
  ): Promise<ResolvedAnnotation[]> {
    const dims = this.buildPageDimensionsMap(pageBoxes);
    const hasOverrides = dims.overrides.size > 0;
    const { map: offsetMap, sorted: sortedEntries } =
      this.buildPageOffsetMap(structuredText);

    // Build concatenated text for Levenshtein search
    const nonEmptyPages = structuredText.filter(p => p.body.trim().length > 0);
    const concatenated = nonEmptyPages.map(p => p.body).join("\n\n");

    const results = Array.of<ResolvedAnnotation>();

    for (const annot of annotations) {
      const pageNumber = annot.page;

      const pageEntry = offsetMap.get(pageNumber);

      const { rect: r } = annot;

      let rect: [number, number, number, number];

      const r0 = r?.[0],
        r1 = r?.[1],
        r2 = r?.[2],
        r3 = r?.[3];

      if (r0 && r1 && r2 && r3) {
        rect = [r0, r1, r2, r3];
      } else {
        rect = [0, 0, 0, 0];
      }

      const [x1, y1, x2, y2] = rect;

      if (!pageEntry) {
        const { startOffset, endOffset } = this.findBoundaryOffset(
          pageNumber,
          sortedEntries
        );
        const subtype = this.mapAnnotSubtype(annot.subtype);

        const uri = annot.uri ?? annot.dest ?? annot.content ?? "";
        const isCdnLink = uri ? this.detectCdnLink(uri) : false;
        let linkedDocId: string | null = null;
        let attachmentId: string | null = null;

        if (isCdnLink) {
          const data = await this.resolveCdnAnnotation(uri);
          if (data) {
            const { attachmentId: attId, linkedDocId: linkedId } = data;
            linkedDocId = linkedId;
            attachmentId = attId;
          }
        }

        results.push({
          subtype,
          uri,
          rect,
          startOffset,
          endOffset,
          pageNumber,
          isCdnLink,
          linkedDocId,
          attachmentId
        });
        continue;
      }

      // Uniform dimensions: skip the per-page Map lookup entirely
      const pageDims = hasOverrides
        ? (dims.overrides.get(pageNumber) ?? dims.defaultDims)
        : dims.defaultDims;
      const pageHeight = pageDims.height;

      // Y interpolation: midpoint of rect, relative to page height (top-down)
      const yMid = (y1 + y2) / 2;
      const relativeY = Math.max(
        0,
        Math.min(1, (pageHeight - yMid) / pageHeight)
      );
      const approxStart =
        pageEntry.globalStart + Math.round(relativeY * pageEntry.bodyLength);

      const uri = annot.uri ?? annot.dest ?? annot.content ?? "";
      const searchLabel = this.extractSearchLabel(uri);

      let startOffset = approxStart;
      let endOffset = approxStart;

      if (searchLabel && searchLabel.length >= 3) {
        const refined = this.refineOffsetWithLevenshtein(
          concatenated,
          approxStart,
          searchLabel
        );
        if (refined && refined.confidence > 0.5) {
          startOffset = refined.start;
          endOffset = refined.end;
        } else {
          endOffset = Math.min(
            startOffset + searchLabel.length,
            pageEntry.globalEnd
          );
        }
      } else {
        // Fallback: X-span heuristic for endOffset
        const xSpan = Math.abs(x2 - x1);
        const xFraction = pageDims.width > 0 ? xSpan / pageDims.width : 0;
        const charEstimate = Math.max(
          1,
          Math.round(xFraction * pageEntry.bodyLength)
        );
        endOffset = Math.min(startOffset + charEstimate, pageEntry.globalEnd);
      }

      // Clamp to page bounds
      startOffset = Math.max(pageEntry.globalStart, startOffset);
      endOffset = Math.min(pageEntry.globalEnd, endOffset);
      if (endOffset < startOffset) endOffset = startOffset;

      const subtype = this.mapAnnotSubtype(annot.subtype);
      const isCdnLink = uri ? this.detectCdnLink(uri) : false;
      let linkedDocId: string | null = null;
      let attachmentId: string | null = null;

      if (isCdnLink) {
        const data = await this.resolveCdnAnnotation(uri);
        if (data) {
          const { attachmentId: attId, linkedDocId: linkedId } = data;
          linkedDocId = linkedId;
          attachmentId = attId;
        }
      }

      results.push({
        subtype,
        uri,
        rect,
        startOffset,
        endOffset,
        pageNumber,
        isCdnLink,
        linkedDocId,
        attachmentId
      });
    }

    return results;
  }

  protected buildPageDimensionsMap(pageBoxes: PageBox[]): PageDimensions {
    let defaultDims = { width: 612, height: 1008 }; // US Legal fallback
    const overrides = new Map<number, { width: number; height: number }>();

    for (const box of pageBoxes) {
      if (!box.pages) {
        // Dominant entry (most frequent) — no explicit page list
        defaultDims = { width: box.width, height: box.height };
      } else {
        // Non-dominant — specific pages with different dimensions
        for (const p of box.pages) {
          overrides.set(p, { width: box.width, height: box.height });
        }
      }
    }

    return { defaultDims, overrides };
  }

  protected buildPageOffsetMap(structuredText: StructuredPageText[]) {
    const map = new Map<number, PageOffsetEntry>();
    const nonEmpty = structuredText.filter(p => p.body.trim().length > 0);

    // Sorted array for boundary lookups on empty-body pages
    const sorted = Array.of<PageOffsetEntry>();

    let offset = 0;
    for (const [i, p] of nonEmpty.entries()) {
      const separator = i > 0 ? 2 : 0; // "\n\n" between pages
      const globalStart = offset + separator;
      const bodyLength = p.body.length;
      const globalEnd = globalStart + bodyLength;
      const entry = {
        page: p.page,
        globalStart,
        globalEnd,
        bodyLength
      } satisfies PageOffsetEntry;
      map.set(p.page, entry);
      sorted.push(entry);
      offset = globalEnd;
    }

    return { map, sorted } as const;
  }

  /** For annotations on empty-body pages, find the boundary offset from surrounding pages */
  protected findBoundaryOffset(
    pageNumber: number,
    sorted: readonly PageOffsetEntry[]
  ) {
    if (sorted.length === 0) return { startOffset: 0, endOffset: 0 };

    // Find last page before and first page after
    let prevEnd: number | null = null;
    let nextStart: number | null = null;

    for (const entry of sorted) {
      if (entry.page < pageNumber) {
        prevEnd = entry.globalEnd;
      } else if (entry.page > pageNumber) {
        nextStart = entry.globalStart;
        break;
      }
    }

    // First page, no text → annotation is at the start of the stream
    if (prevEnd == null) {
      return { startOffset: 0, endOffset: nextStart ?? 0 };
    }
    // Last page, no text → annotation is at the end of the stream
    if (nextStart == null) {
      return { startOffset: prevEnd, endOffset: prevEnd };
    }
    // Between two pages → spans the boundary
    return { startOffset: prevEnd, endOffset: nextStart };
  }

  protected extractSearchLabel(uri: string): string | null {
    if (!uri || !URL.canParse(uri)) return null;
    const url = new URL(uri);
    const path = url.pathname;
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash === -1 || lastSlash === path.length - 1) return null;
    const lastSegment = decodeURIComponent(path.slice(lastSlash + 1));
    const dotIdx = lastSegment.lastIndexOf(".");
    const stripped = dotIdx > 0 ? lastSegment.slice(0, dotIdx) : lastSegment;
    return stripped.length >= 3 ? stripped : null;
  }

  protected refineOffsetWithLevenshtein(
    concatenatedText: string,
    approxStart: number,
    label: string
  ) {
    const labelLen = label.length;
    const windowStart = Math.max(0, approxStart - 200);
    const windowEnd = Math.min(
      concatenatedText.length,
      approxStart + 200 + labelLen
    );
    const window = concatenatedText.slice(windowStart, windowEnd);

    if (window.length < labelLen) return null;

    let bestLD = Infinity;
    let bestPos = 0;
    const lowerLabel = label.toLowerCase();

    for (let i = 0; i <= window.length - labelLen; i++) {
      const candidate = window.slice(i, i + labelLen).toLowerCase();
      const ld = this.prisma.extractor.calculateLD(lowerLabel, candidate);
      if (ld < bestLD) {
        bestLD = ld;
        bestPos = i;
        if (ld === 0) break; // exact match
      }
    }

    const confidence = 1 - bestLD / labelLen;
    return {
      start: windowStart + bestPos,
      end: windowStart + bestPos + labelLen,
      confidence
    };
  }

  protected readonly annotSubtypes = new Set<$Enums.AnnotSubtype>();
  protected isAnnotSubtype(subtype: string) {
    return (
      subtype === "AUTOLINK" ||
      subtype === "HIGHLIGHT" ||
      subtype === "LINK" ||
      subtype === "MARKUP" ||
      subtype === "REFERENCE" ||
      subtype === "TEXT" ||
      subtype === "WIDGET"
    );
  }
  protected mapAnnotSubtype(subtype: string) {
    const upper = subtype.toUpperCase();
    if (this.isAnnotSubtype(upper)) {
      return upper satisfies $Enums.AnnotSubtype;
    }
    return "LINK";
  }
}

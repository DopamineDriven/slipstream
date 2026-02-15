import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { CreateUserStoreRT } from "@/prisma/types.ts";
import type {
  AttScopedImg,
  AttScopedImgsCache,
  AttScopedPageBoxCache,
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
  PdfDown,
  PdfMeta,
  StructuredPageText
} from "@d0paminedriven/pdfdown";
import type { Logger as PinoLogger } from "pino";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { VoyageEmbeddingService } from "@/voyage/index.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { AttachmentSingleton } from "@slipstream/types";

export class UserStoreWorkupService {
  protected pdfdown: Promise<typeof PdfDown>;
  protected logger: PinoLogger;

  // ── Caches ───────────────────────────────────────────────────────────

  /** Outer key: userId -> inner key: storeName -> store record */
  public storeRegistry = new Map<
    string,
    Map<string, CreateUserStoreRT<true>>
  >();

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
    Map<number, AttScopedImgsCache>
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
    this.pdfdown = import("@d0paminedriven/pdfdown").then(d => d.PdfDown);
  }

  // ── CDN Hostname ─────────────────────────────────────────────────────

  protected get cdnHostname() {
    return this.prisma.isProd
      ? "assets.aicoalesce.com"
      : "assets-dev.aicoalesce.com";
  }
  protected async pdfDown(buffer: Buffer) {
    const PdfD = await this.pdfdown;
    return new PdfD(buffer);
  }

  protected buildAttachmentOffsetCache(
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

  protected attachmentImageTmpName(
    attachmentId: string,
    page: number,
    imageIndex: number
  ) {
    // Attachment-scoped tmp naming supports proactive post-upload invocation.
    const tmpFileName = this.prisma.extractor.uniqueTmpName(
      `${attachmentId}-img-${page}-${imageIndex}`,
      "png"
    );
    const absTmpPath = resolve(tmpdir(), tmpFileName);
    return { tmpFileName, absTmpPath } as const;
  }

  protected preflightAttachment(att: AttachmentSingleton<true>) {
    if (att.assetType !== "DOCUMENT") {
      return {
        ok: false,
        reason: "SKIP_NON_DOCUMENT",
        assetType: att.assetType
      } as const;
    }

    if (!att.compatStatus) {
      throw new Error(`missing compatStatus for attachment ${att.id}`);
    }

    if (att.compatStatus === "PENDING") {
      return {
        ok: false,
        reason: "WAIT_COMPAT_ACTIVE",
        compatStatus: att.compatStatus
      } as const;
    }

    if (att.compatStatus === "FAILED") {
      this.logger.warn(
        { attachmentId: att.id, compatStatus: att.compatStatus },
        "Bypassing user store indexing due to FAILED compat status"
      );
      return {
        ok: false,
        reason: "SKIP_COMPAT_FAILED",
        compatStatus: att.compatStatus
      } as const;
    }

    if (att.compatStatus !== "ACTIVE" && att.compatStatus !== "ALIASED") {
      throw new Error(`unsupported compatStatus for attachment ${att.id}`);
    }

    const { ext } = this.prisma.urlExtWorkupEmbeddings(att);
    if (ext.toLowerCase() !== "pdf") {
      return {
        ok: false,
        reason: "SKIP_NON_PDF",
        ext
      } as const;
    }

    return {
      ok: true,
      compatStatus: att.compatStatus,
      ext: "pdf"
    } as const;
  }

  public postUploadIndexingDecision(att: AttachmentSingleton<true>) {
    return this.preflightAttachment(att);
  }

  protected imgMapper(att: AttachmentSingleton<true>, imgs: PageImage[]) {
    const current = this.attScopedImgs.get(att.id);
    const imgByPage = new Map<number, AttScopedImgsCache>();

    if (current) {
      for (const [page, pageCache] of current.entries()) {
        const clonedPageData = new Map(pageCache.data);
        imgByPage.set(page, {
          count: clonedPageData.size,
          page,
          data: clonedPageData
        });
      }
    }

    for (const { data, width, height, imageIndex, page } of imgs) {
      const { tmpFileName, absTmpPath } = this.attachmentImageTmpName(
        att.id,
        page,
        imageIndex
      );
      this.prisma.extractor.writeTmp(tmpFileName, data);

      const imageRecord = {
        height,
        width,
        aspectRatio: width / height,
        index: imageIndex,
        page,
        tmpFileName,
        absTmpPath,
        size: String(data.byteLength)
      } satisfies AttScopedImg;

      const pageCache = imgByPage.get(page);
      if (!pageCache) {
        const pageData = new Map<number, AttScopedImg>([
          [imageIndex, imageRecord]
        ]);
        const next = {
          count: pageData.size,
          page,
          data: pageData
        } satisfies AttScopedImgsCache;
        imgByPage.set(page, next);
        continue;
      }

      const existingImage = pageCache.data.get(imageIndex);
      if (
        existingImage &&
        existingImage.absTmpPath !== imageRecord.absTmpPath &&
        this.prisma.extractor.exists(existingImage.absTmpPath)
      ) {
        this.prisma.extractor.rmFile(existingImage.absTmpPath);
      }

      pageCache.data.set(imageIndex, imageRecord);
      pageCache.count = pageCache.data.size;
    }

    for (const pageCache of imgByPage.values()) {
      pageCache.count = pageCache.data.size;
    }

    this.attScopedImgs.set(att.id, imgByPage);
    return imgByPage;
  }

  protected cleanupImgMapper(attId: string) {
    const mapped = this.attScopedImgs.get(attId);
    if (!mapped) return;

    const cleanupFailures = Array.of<{
      page: number;
      imageIndex: number;
      tmpFileName: string;
      absTmpPath: string;
      reason: string;
    }>();
    const remainingByPage = new Map<number, AttScopedImgsCache>();

    for (const [page, pageEntry] of mapped.entries()) {
      const remainingImgs = new Map<number, AttScopedImg>();

      for (const [imageIndex, imageEntry] of pageEntry.data.entries()) {
        if (!this.prisma.extractor.exists(imageEntry.absTmpPath)) continue;

        try {
          this.prisma.extractor.rmFile(imageEntry.absTmpPath);
        } catch (err) {
          cleanupFailures.push({
            page,
            imageIndex,
            tmpFileName: imageEntry.tmpFileName,
            absTmpPath: imageEntry.absTmpPath,
            reason: this.prisma.safeErrMsg(err)
          });
          remainingImgs.set(imageIndex, imageEntry);
          continue;
        }

        if (this.prisma.extractor.exists(imageEntry.absTmpPath)) {
          cleanupFailures.push({
            page,
            imageIndex,
            tmpFileName: imageEntry.tmpFileName,
            absTmpPath: imageEntry.absTmpPath,
            reason: "file still exists after rmFile"
          });
          remainingImgs.set(imageIndex, imageEntry);
        }
      }

      if (remainingImgs.size > 0) {
        remainingByPage.set(page, {
          count: remainingImgs.size,
          page,
          data: remainingImgs
        });
      }
    }

    if (remainingByPage.size === 0) {
      this.attScopedImgs.delete(attId);
    } else {
      this.attScopedImgs.set(attId, remainingByPage);
    }

    if (cleanupFailures.length > 0) {
      this.logger.error(
        {
          attachmentId: attId,
          failedTmpCount: cleanupFailures.length,
          failures: cleanupFailures
        },
        "Failed to cleanup one or more attachment-scoped tmp images"
      );
      throw new Error(
        `tmp image cleanup failed for attachment ${attId} (${cleanupFailures.length} files)`
      );
    }
  }

  public async prepareAttachmentPdfWorkup(att: AttachmentSingleton<true>) {
    const preflight = this.preflightAttachment(att);
    if (!preflight.ok) return preflight;

    const tmp = await this.prisma.userStoreAssetToTmp(att);
    const buffer = this.prisma.extractor.fileToBuffer(tmp.absTmpPath);
    const pdfDown = await this.pdfDown(buffer);

    const [structuredText, images, annotations, meta] = await Promise.all([
      pdfDown.structuredTextAsync(),
      pdfDown.imagesPerPageAsync(),
      pdfDown.annotationsPerPageAsync(),
      pdfDown.metadataAsync()
    ]);

    const imagePages = new Set(images.map(img => img.page));
    const annotPages = new Set(annotations.map(annot => annot.page));

    const offsets = this.buildAttachmentOffsetCache(
      att.id,
      structuredText,
      imagePages,
      annotPages
    );
    const pageBoxes = this.pageBoxHelper(att.id, meta);
    const imagesByPage = this.imgMapper(att, images);

    return {
      ok: true,
      compatStatus: preflight.compatStatus,
      tmp,
      structuredText,
      images,
      annotations,
      meta,
      offsets,
      pageBoxes,
      imagesByPage
    } as const;
  }
  // ── Store Registry ───────────────────────────────────────────────────
  protected pageBoxHelper(attId: string, meta: PdfMeta) {
    // 0 is default page box config key; if size ===1, 0 is the only entry (uniform)
    const pBoxCache = new Map<number, AttScopedPageBoxCache>();
    const { pageBoxes, ...metaRest } = meta;
    const total = metaRest.pageCount;
    const anomalySet = new Set<number>();
    if (pageBoxes.length === 1) {
      const uniformBox = pageBoxes[0];
      if (uniformBox) {
        pBoxCache.set(0, { ...uniformBox, coverage: 1 });
      }
    }
    if (pageBoxes.length > 1) {
      // intentionally reverse to iterate over the default last
      // after aggregating the number of pages deviating from the majority page box config
      for (const [i, p] of pageBoxes.reverse().entries()) {
        if (p.pages?.length) {
          for (const e of p.pages) {
            anomalySet.add(e);
          }
          pBoxCache.set(i, {
            ...p,
            coverage: p.pages.length / total
          });
        } else {
          const coverage = (total - pBoxCache.size) / total;
          pBoxCache.set(0, { coverage, ...p });
        }
      }
    }

    if (pBoxCache.size > 1) {
      for (const a of Array.from(pBoxCache.keys())) {
        if (a !== 0) anomalySet.add(a);
      }
    }
    /**
     * hydrate att scoped page boxes
     */
    this.attScopedPageBoxes.set(attId, pBoxCache);
    return {
      anomalySet,
      pageBoxCache: Array.from(pBoxCache.values()),
      ...metaRest
    };
  }
  protected writeStoreRegistry(
    userId: string,
    storeName: string,
    data: CreateUserStoreRT<true>
  ) {
    const byStoreName = this.storeRegistry.get(userId);
    if (byStoreName) {
      byStoreName.set(storeName, data);
    } else {
      this.storeRegistry.set(userId, new Map([[storeName, data]]));
    }
  }

  public async populateStoreRegistry(userId: string) {
    const stores = await this.prisma.getAllUserStores(userId);
    const byStoreName = new Map<string, CreateUserStoreRT<true>>();
    for (const store of stores) {
      const data = await this.prisma.getUserStoreUnique(
        userId,
        store.storeName
      );
      byStoreName.set(store.storeName, data);
    }
    this.storeRegistry.set(userId, byStoreName);
  }

  public async ensureUserStore(userId: string, storeName?: string) {
    const name = storeName ?? this.prisma.defaultUserStoreName(userId);
    const cached = this.storeRegistry.get(userId)?.get(name);
    if (cached) return cached;

    const exists = await this.prisma.userStoreCheck(userId, name);
    if (exists) {
      const data = await this.prisma.getUserStoreUnique(userId, name);
      this.writeStoreRegistry(userId, name, data);
      return data;
    } else {
      const data = await this.prisma.createUserStore({
        userId,
        storeName: name,
        defaultEmbeddingDim: 1024,
        defaultEmbeddingModel: "voyage-multimodal-3.5",
        schemaVersion: "v1_0"
      });
      this.writeStoreRegistry(userId, name, data);
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

  public async syncRegistry(userId: string) {
    // Clear user-scoped registry + refresh.
    this.storeRegistry.delete(userId);
    for (const [timestamp, entry] of this.cdnEpochCache.entries()) {
      if (entry.userId !== userId) continue;
      this.cdnEpochCache.delete(timestamp);
    }

    await Promise.all([
      this.populateStoreRegistry(userId),
      this.populateCdnEpochCache(userId)
    ]);
  }

  protected detectCdnLink(uri: string) {
    if (!URL.canParse(uri)) return false;
    return new URL(uri).hostname === this.cdnHostname;
  }

  protected detectCdnCompatStatus(url: URL) {
    const topPath = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
    if (topPath.startsWith("att_")) {
      return {
        compatStatus: "ACTIVE",
        topPath,
        source: "att-prefix"
      } as const;
    }
    if (/^\d{13}-/.test(topPath)) {
      return {
        compatStatus: "ALIASED",
        topPath,
        source: "epoch-prefix"
      } as const;
    }

    const segments = url.pathname
      .split("/")
      .filter((segment): segment is string => segment.length > 0);
    const compatStatus = segments.includes("converted") ? "ACTIVE" : "ALIASED";
    return {
      compatStatus,
      topPath,
      source: "legacy-path-fallback"
    } as const;
  }

  protected async resolveCdnAnnotation(uri: string) {
    if (!URL.canParse(uri)) return;

    const url = new URL(uri);
    if (url.hostname !== this.cdnHostname) {
      return { linkedDocId: null, attachmentId: null };
    }

    const parsedCompat = this.detectCdnCompatStatus(url);
    if (parsedCompat.compatStatus === "ALIASED") {
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
    attachmentId: string,
    annotations: PageAnnotation[],
    pageBoxes: PageBox[]
  ): Promise<ResolvedAnnotation[]> {
    const offsetCache = this.attScopedOffsets.get(attachmentId);
    if (!offsetCache) {
      throw new Error(
        `offset cache is not hydrated for attachment ${attachmentId}`
      );
    }
    const dims = this.buildPageDimensionsMap(pageBoxes);
    const hasOverrides = dims.overrides.size > 0;
    const sortedEntries = this.offsetEntriesFromCache(offsetCache);

    const results = Array.of<ResolvedAnnotation>();

    for (const annot of annotations) {
      const pageNumber = annot.page;

      const pageEntry = offsetCache.get(pageNumber);

      const { rect: r } = annot;

      let rect: [number, number, number, number];

      const r0 = r?.[0],
        r1 = r?.[1],
        r2 = r?.[2],
        r3 = r?.[3];

      const hasRect =
        typeof r0 === "number" &&
        typeof r1 === "number" &&
        typeof r2 === "number" &&
        typeof r3 === "number";
      if (hasRect) {
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
      const [globalStart, globalEnd] = pageEntry.offsets;
      const bodyLength = pageEntry.body.length;

      // Y interpolation: midpoint of rect, relative to page height (top-down)
      const yMid = (y1 + y2) / 2;
      const relativeY = Math.max(
        0,
        Math.min(1, (pageHeight - yMid) / pageHeight)
      );
      let startOffset = globalStart + Math.round(relativeY * bodyLength);

      const uri = annot.uri ?? annot.dest ?? annot.content ?? "";
      const xSpan = Math.abs(x2 - x1);
      const xFraction = pageDims.width > 0 ? xSpan / pageDims.width : 0;
      const charEstimate = Math.max(1, Math.round(xFraction * bodyLength));
      let endOffset = Math.min(startOffset + charEstimate, globalEnd);

      // Clamp to page bounds
      startOffset = Math.max(globalStart, startOffset);
      endOffset = Math.min(globalEnd, endOffset);
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

  protected offsetEntriesFromCache(cache: ReadonlyMap<number, OffsetCache>) {
    const entries = Array.of<PageOffsetEntry>();
    for (const offset of cache.values()) {
      const [globalStart, globalEnd] = offset.offsets;
      entries.push({
        page: offset.page,
        globalStart,
        globalEnd,
        bodyLength: offset.body.length
      } satisfies PageOffsetEntry);
    }
    return entries.sort((a, b) => a.page - b.page);
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

  /** For annotations on missing pages, find the closest boundary offset from surrounding pages */
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

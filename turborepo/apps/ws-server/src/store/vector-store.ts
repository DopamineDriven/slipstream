import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type {
  AttScopedImg,
  ChunkBudgetAdjustReason,
  ChunkWithRecord,
  HybridChunkHit,
  PartitionedSearchResult,
  UserStoreChunkDraft,
  UserStoreChunkReady,
  UserStoreHybridSearchParams,
  UserStoreIndexResult,
  UserStoreSearchParams,
  UserStoreSearchResult
} from "@/store/types.ts";
import type { Voyage } from "@/voyage/types.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { SharpService } from "@/sharp/index.ts";
import { UserStoreWorkupService } from "@/store/workup.ts";
import { VoyageEmbeddingService } from "@/voyage/index.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { AttachmentSingleton, MessageSingleton } from "@slipstream/types";

export class UserStoreVectorService extends UserStoreWorkupService {
  constructor(
    logger: LoggerService,
    voyage: VoyageEmbeddingService,
    prisma: PrismaService,
    protected sharp: SharpService,
    apiKey: string
  ) {
    super(logger, voyage, prisma, apiKey);
  }

  private get multimodalLimits() {
    return {
      maxTokensPerInput: 32_000,
      maxTotalTokensPerRequest: 320_000,
      maxImagePixels: 16_000_000,
      maxImageBytes: 20 * 1024 * 1024,
      maxImageDimension: 1920,
      maxRechunkDepth: 8
    } as const;
  }

  private collapsePages(pages: number[]) {
    if (pages.length === 0) return null;
    return this.prisma.collapsePageRefEnumerable(pages);
  }

  private uniqueSortedPages(values: number[]) {
    return Array.from(new Set(values)).sort((a, b) => a - b);
  }

  private attachmentSizeToBigInt(size: number | bigint | null | undefined) {
    if (typeof size === "bigint") return size;
    if (typeof size === "number" && Number.isFinite(size) && size > 0) {
      return BigInt(Math.round(size));
    }
    return 0n;
  }

  private chunkDraftsFromOffsetCache(
    attachmentId: string,
    filename: string,
    imagesByPage: Map<number, { data: Map<number, AttScopedImg> }>
  ) {
    const offsetCache = this.attScopedOffsets.get(attachmentId);
    if (!offsetCache) {
      throw new Error(
        `offset cache is not hydrated for attachment ${attachmentId}`
      );
    }

    const drafts = Array.of<UserStoreChunkDraft>();
    const sortedOffsets = Array.from(offsetCache.values()).sort(
      (a, b) => a.page - b.page
    );

    for (const offsetEntry of sortedOffsets) {
      const [startOffset, endOffset] = offsetEntry.offsets;
      const pageImages = imagesByPage.get(offsetEntry.page)?.data
        ? Array.from(
            imagesByPage.get(offsetEntry.page)?.data.values() ?? []
          ).sort((a, b) => a.index - b.index)
        : Array.of<AttScopedImg>();

      const hasText = offsetEntry.body.trim().length > 0;

      if (!hasText && pageImages.length === 0) continue;

      // Text chunk: body text only, no images
      if (hasText) {
        drafts.push({
          page: offsetEntry.page,
          text: offsetEntry.body,
          startOffset,
          endOffset,
          hasImages: false,
          hasAnnots: offsetEntry.hasAnnots,
          images: Array.of<AttScopedImg>()
        });
      }

      // Image chunks: one per image, with page text as context
      for (const img of pageImages) {
        drafts.push({
          page: offsetEntry.page,
          text: hasText
            ? offsetEntry.body
            : `[Visual content from page ${offsetEntry.page} of ${filename}]`,
          startOffset,
          endOffset,
          hasImages: true,
          hasAnnots: offsetEntry.hasAnnots,
          images: [img]
        });
      }
    }
    return drafts;
  }

  private async tokenUsageForChunk(chunk: UserStoreChunkDraft) {
    if (!chunk.hasImages) {
      const result = await this.voyage.countTokens(
        [chunk.text],
        "voyage-context-3"
      );
      return result.total;
    }
    const usageInput = Array.of<{ t: string } | { f: string }>();
    usageInput.push({ t: chunk.text });
    for (const image of chunk.images) {
      usageInput.push({ f: image.absTmpPath });
    }
    const usage = await this.voyage.countUsageFromPaths(
      [usageInput],
      "voyage-multimodal-3.5"
    );
    return usage.total_tokens;
  }

  private buildEmbeddingInput(chunk: UserStoreChunkDraft) {
    const content = Array.of<
      Voyage.Multimodal.Input.Text | Voyage.Multimodal.Input.ImageBase64
    >();
    content.push({ type: "text", text: chunk.text });

    for (const image of chunk.images) {
      const buf = this.prisma.extractor.fileToBuffer(image.absTmpPath);
      content.push({
        type: "image_base64",
        image_base64: `data:image/png;base64,${buf.toString("base64")}`
      });
    }
    return { content } satisfies Voyage.Multimodal.Input.Contents<"base64">;
  }

  private parseImgSizeBytes(size: string) {
    const parsed = Number.parseInt(size, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
  }

  private roughTokenEstimate(chunk: UserStoreChunkDraft) {
    const textTokens = Math.max(1, Math.ceil(chunk.text.length / 4));
    const imageTokens = chunk.images.reduce((sum, image) => {
      const pixels = Math.max(1, image.width * image.height);
      return sum + Math.ceil(pixels / 560);
    }, 0);
    return textTokens + imageTokens;
  }

  private exceedsImageLimits(chunk: UserStoreChunkDraft) {
    const { maxImageBytes, maxImagePixels } = this.multimodalLimits;
    for (const image of chunk.images) {
      const pixelCount = image.width * image.height;
      const sizeBytes = this.parseImgSizeBytes(image.size);
      if (pixelCount > maxImagePixels || sizeBytes > maxImageBytes) {
        return true;
      }
    }
    return false;
  }

  private withinChunkBudget(chunk: UserStoreChunkDraft, tokenCount: number) {
    const { maxTokensPerInput, maxTotalTokensPerRequest } =
      this.multimodalLimits;
    if (tokenCount > maxTokensPerInput) return false;
    if (tokenCount > maxTotalTokensPerRequest) return false;
    return !this.exceedsImageLimits(chunk);
  }

  private isVisualPlaceholderChunk(chunk: UserStoreChunkDraft) {
    if (chunk.startOffset !== chunk.endOffset) return false;
    return chunk.text.startsWith("[Visual content from page");
  }

  private splitTextChunk(chunk: UserStoreChunkDraft) {
    if (chunk.text.length < 2) return;
    const mid = Math.floor(chunk.text.length / 2);
    if (mid <= 0 || mid >= chunk.text.length) return;

    const leftText = chunk.text.slice(0, mid);
    const rightText = chunk.text.slice(mid);

    const leftEndOffset = Math.min(
      chunk.endOffset,
      chunk.startOffset + leftText.length
    );
    const rightStartOffset = Math.max(chunk.startOffset, leftEndOffset);

    return [
      {
        ...chunk,
        text: leftText,
        endOffset: leftEndOffset
      },
      {
        ...chunk,
        text: rightText,
        startOffset: rightStartOffset,
        hasImages: false,
        images: Array.of<AttScopedImg>()
      }
    ] as const;
  }

  private splitImageChunk(chunk: UserStoreChunkDraft) {
    if (chunk.images.length < 2) return;
    const mid = Math.ceil(chunk.images.length / 2);
    const leftImages = chunk.images.slice(0, mid);
    const rightImages = chunk.images.slice(mid);
    return [
      {
        ...chunk,
        hasImages: leftImages.length > 0,
        images: leftImages
      },
      {
        ...chunk,
        hasImages: rightImages.length > 0,
        images: rightImages
      }
    ] as const;
  }

  private async resizeChunkImages(
    attachmentId: string,
    chunk: UserStoreChunkDraft,
    resizedTmpPaths: string[]
  ) {
    const resizedImages = Array.of<AttScopedImg>();
    let changed = false;
    const { maxImageDimension } = this.multimodalLimits;

    for (const image of chunk.images) {
      const sourceBuf = this.prisma.extractor.fileToBuffer(image.absTmpPath);

      let width = image.width;
      let height = image.height;

      if (width <= 0 || height <= 0) {
        const dims = await this.sharp.getDimsFromBuffer(sourceBuf);
        width = dims.width;
        height = dims.height;
      }

      const [targetWidth, targetHeight] = this.sharp.calcDims(
        width,
        height,
        maxImageDimension
      );

      const shouldResize =
        targetWidth !== width ||
        targetHeight !== height ||
        width * height > this.multimodalLimits.maxImagePixels ||
        this.parseImgSizeBytes(image.size) >
          this.multimodalLimits.maxImageBytes;

      if (!shouldResize) {
        resizedImages.push({
          ...image,
          width,
          height,
          aspectRatio: width / height
        });
        continue;
      }

      const resized = await this.sharp.resizeToBuffer(sourceBuf, [
        targetWidth,
        targetHeight
      ]);
      const tmpFileName = this.prisma.extractor.uniqueTmpName(
        `${attachmentId}-img-${image.page}-${image.index}-resized`,
        "png"
      );
      const absTmpPath = resolve(tmpdir(), tmpFileName);
      this.prisma.extractor.writeTmp(tmpFileName, resized);
      resizedTmpPaths.push(absTmpPath);

      resizedImages.push({
        ...image,
        width: targetWidth,
        height: targetHeight,
        aspectRatio: targetWidth / targetHeight,
        tmpFileName,
        absTmpPath,
        size: String(resized.byteLength)
      });
      changed = true;
    }

    return {
      changed,
      chunk: {
        ...chunk,
        hasImages: resizedImages.length > 0,
        images: resizedImages
      }
    } as const;
  }

  private toTextOnlyChunk(chunk: UserStoreChunkDraft) {
    return {
      ...chunk,
      hasImages: false,
      images: Array.of<AttScopedImg>()
    } satisfies UserStoreChunkDraft;
  }

  private async finalizeChunkBudget(
    attachmentId: string,
    chunk: UserStoreChunkDraft,
    resizedTmpPaths: string[],
    depth = 0
  ): Promise<UserStoreChunkReady[]> {
    if (depth > this.multimodalLimits.maxRechunkDepth) {
      throw new Error(
        `chunk rechunk depth exceeded for attachment ${attachmentId} (page ${chunk.page})`
      );
    }

    let candidate = chunk;
    const likelyOversize =
      this.roughTokenEstimate(candidate) >
        this.multimodalLimits.maxTokensPerInput ||
      this.exceedsImageLimits(candidate);

    if (likelyOversize && candidate.images.length > 0) {
      const resized = await this.resizeChunkImages(
        attachmentId,
        candidate,
        resizedTmpPaths
      );
      if (resized.changed) {
        candidate = resized.chunk;
      }
    }

    const tokenCount = await this.tokenUsageForChunk(candidate);
    if (this.withinChunkBudget(candidate, tokenCount)) {
      return [
        {
          ...candidate,
          tokenCount,
          budgetAdjustReason:
            candidate !== chunk && candidate.images.length > 0
              ? "RESIZED"
              : null
        }
      ];
    }

    if (candidate.images.length > 0) {
      if (!this.isVisualPlaceholderChunk(candidate)) {
        const textOnly = this.toTextOnlyChunk(candidate);
        const textOnlyTokenCount = await this.tokenUsageForChunk(textOnly);
        if (this.withinChunkBudget(textOnly, textOnlyTokenCount)) {
          this.logger.warn(
            {
              attachmentId,
              page: candidate.page,
              originalTokens: tokenCount,
              textOnlyTokens: textOnlyTokenCount,
              depth
            },
            "Chunk exceeded multimodal budget; using text-only fallback"
          );
          return [
            {
              ...textOnly,
              tokenCount: textOnlyTokenCount,
              budgetAdjustReason: "TEXT_ONLY_FALLBACK"
            }
          ];
        }

        const splitText = this.splitTextChunk(textOnly);
        if (splitText) {
          const [left, right] = splitText;
          const [leftChunks, rightChunks] = await Promise.all([
            this.finalizeChunkBudget(
              attachmentId,
              left,
              resizedTmpPaths,
              depth + 1
            ),
            this.finalizeChunkBudget(
              attachmentId,
              right,
              resizedTmpPaths,
              depth + 1
            )
          ]);
          return [...leftChunks, ...rightChunks];
        }
      }

      const splitImages = this.splitImageChunk(candidate);
      if (splitImages) {
        const [left, right] = splitImages;
        const [leftChunks, rightChunks] = await Promise.all([
          this.finalizeChunkBudget(
            attachmentId,
            left,
            resizedTmpPaths,
            depth + 1
          ),
          this.finalizeChunkBudget(
            attachmentId,
            right,
            resizedTmpPaths,
            depth + 1
          )
        ]);
        const combined = [...leftChunks, ...rightChunks];
        return combined.map(chunkEntry => ({
          ...chunkEntry,
          budgetAdjustReason:
            chunkEntry.budgetAdjustReason ??
            ("IMAGE_RECHUNK" satisfies ChunkBudgetAdjustReason)
        }));
      }

      throw new Error(
        `chunk exceeds multimodal limits for attachment ${attachmentId} (page ${candidate.page})`
      );
    }

    const splitText = this.splitTextChunk(candidate);
    if (splitText) {
      const [left, right] = splitText;
      const [leftChunks, rightChunks] = await Promise.all([
        this.finalizeChunkBudget(
          attachmentId,
          left,
          resizedTmpPaths,
          depth + 1
        ),
        this.finalizeChunkBudget(
          attachmentId,
          right,
          resizedTmpPaths,
          depth + 1
        )
      ]);
      const combined = [...leftChunks, ...rightChunks];
      return combined.map(chunkEntry => ({
        ...chunkEntry,
        budgetAdjustReason:
          chunkEntry.budgetAdjustReason ??
          ("TEXT_RECHUNK" satisfies ChunkBudgetAdjustReason)
      }));
    }

    throw new Error(
      `text chunk exceeds multimodal limits for attachment ${attachmentId} (page ${candidate.page})`
    );
  }

  private cleanupResizedTmpPaths(paths: readonly string[]) {
    const failures = Array.of<{ absTmpPath: string; reason: string }>();
    for (const absTmpPath of paths) {
      if (!this.prisma.extractor.exists(absTmpPath)) continue;
      try {
        this.prisma.extractor.rmFile(absTmpPath);
      } catch (err) {
        failures.push({
          absTmpPath,
          reason: this.prisma.safeErrMsg(err)
        });
        continue;
      }
      if (this.prisma.extractor.exists(absTmpPath)) {
        failures.push({
          absTmpPath,
          reason: "file still exists after rmFile"
        });
      }
    }
    if (failures.length > 0) {
      this.logger.error(
        {
          failedTmpCount: failures.length,
          failures
        },
        "Failed to cleanup one or more resized tmp images"
      );
      throw new Error(`resized tmp cleanup failed (${failures.length} files)`);
    }
  }

  private partitionTextChunkBatches(
    chunks: readonly ChunkWithRecord[],
    maxTokensPerBatch: number
  ) {
    const batches = Array.of<ChunkWithRecord[]>();
    let current = Array.of<ChunkWithRecord>();
    let runningTokens = 0;

    for (const entry of chunks) {
      if (
        current.length > 0 &&
        runningTokens + entry.chunk.tokenCount > maxTokensPerBatch
      ) {
        batches.push(current);
        current = Array.of<ChunkWithRecord>();
        runningTokens = 0;
      }
      current.push(entry);
      runningTokens += entry.chunk.tokenCount;
    }

    if (current.length > 0) {
      batches.push(current);
    }

    return batches;
  }

  public async searchUserStoreChunks({
    userId,
    query,
    limit = 5,
    threshold = 0,
    filename
  }: UserStoreSearchParams): Promise<UserStoreSearchResult[]> {
    if (query.trim().length === 0) return Array.of<UserStoreSearchResult>();

    const store = await this.ensureUserStore(userId);
    const clampedLimit = Math.max(1, Math.min(limit, 25));
    const filenameFilter = filename?.trim() ?? null;

    // Embed query with both models in parallel — allSettled so one failure
    // doesn't block the other
    const [multimodalSettled, contextualSettled] = await Promise.allSettled([
      this.voyage.embedChunksMultimodal("base64", {
        inputs: [{ content: [{ type: "text", text: query }] }],
        model: "voyage-multimodal-3.5",
        input_type: "query"
      }),
      this.voyage.embedChunksContextual({
        inputs: [[query]],
        input_type: "query",
        model: "voyage-context-3",
        output_dimension: 1024
      })
    ]);

    const results = Array.of<UserStoreSearchResult>();

    // Search multimodal-3.5 chunks
    if (multimodalSettled.status === "fulfilled") {
      const mmResult = multimodalSettled.value;
      if (!("detail" in mmResult)) {
        const mmEmb = mmResult.data[0]?.embedding;
        if (mmEmb) {
          const mmHits = await this.prisma.searchUserStoreChunksByModel(
            store.id,
            `[${mmEmb.join(",")}]`,
            clampedLimit,
            threshold,
            "voyage-multimodal-3.5",
            filenameFilter
          );
          results.push(...mmHits);
        }
      } else {
        this.logger.warn(
          { userId, detail: this.prisma.safeErrMsg(mmResult.detail) },
          "UserStore multimodal query embedding failed"
        );
      }
    } else {
      this.logger.warn(
        { userId, error: multimodalSettled.reason },
        "UserStore multimodal query embedding threw"
      );
    }

    // Search context-3 chunks
    if (contextualSettled.status === "fulfilled") {
      const ctxResult = contextualSettled.value;
      if (!("detail" in ctxResult)) {
        const ctxEmb = ctxResult.data[0]?.data[0]?.embedding;
        if (ctxEmb) {
          const ctxHits = await this.prisma.searchUserStoreChunksByModel(
            store.id,
            `[${ctxEmb.join(",")}]`,
            clampedLimit,
            threshold,
            "voyage-context-3",
            filenameFilter
          );
          results.push(...ctxHits);
        }
      } else {
        this.logger.warn(
          { userId, detail: this.prisma.safeErrMsg(ctxResult.detail) },
          "UserStore contextual query embedding failed"
        );
      }
    } else {
      this.logger.warn(
        { userId, error: contextualSettled.reason },
        "UserStore contextual query embedding threw"
      );
    }

    if (results.length === 0) return results;

    // Deduplicate by chunk id, sort by score descending, take limit
    const seen = new Set<string>();
    return results
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .filter(hit => {
        if (seen.has(hit.id)) return false;
        seen.add(hit.id);
        return true;
      })
      .slice(0, clampedLimit);
  }

  public async searchUserStoreChunksHybrid({
    userId,
    query,
    searchTerms,
    limit = 10,
    threshold = 0,
    filename
  }: UserStoreHybridSearchParams): Promise<PartitionedSearchResult> {
    if (query.trim().length === 0) {
      return this.emptyPartitionedResult(searchTerms ?? null, threshold);
    }

    const store = await this.ensureUserStore(userId);
    const semanticLimit = Math.max(1, Math.min(limit, 25));
    const fulltextLimit = Math.max(1, Math.min(limit, 25));
    const filenameFilter = filename?.trim() ?? null;
    const terms = searchTerms?.trim().slice(0, 500) ?? null;

    const [multimodalSettled, contextualSettled] = await Promise.allSettled([
      this.voyage.embedChunksMultimodal("base64", {
        inputs: [{ content: [{ type: "text", text: query }] }],
        model: "voyage-multimodal-3.5",
        input_type: "query"
      }),
      this.voyage.embedChunksContextual({
        inputs: [[query]],
        input_type: "query",
        model: "voyage-context-3",
        output_dimension: 1024
      })
    ]);

    const allRows = Array.of<HybridChunkHit>();

    if (multimodalSettled.status === "fulfilled") {
      const mmResult = multimodalSettled.value;
      if (!("detail" in mmResult)) {
        const mmEmb = mmResult.data[0]?.embedding;
        if (mmEmb) {
          const rows = await this.prisma.searchUserStoreChunksHybrid(
            store.id,
            `[${mmEmb.join(",")}]`,
            semanticLimit,
            threshold,
            terms,
            fulltextLimit,
            "voyage-multimodal-3.5",
            filenameFilter
          );
          allRows.push(...rows);
        }
      } else {
        this.logger.warn(
          { userId, detail: this.prisma.safeErrMsg(mmResult.detail) },
          "Hybrid search multimodal query embedding failed"
        );
      }
    } else {
      this.logger.warn(
        { userId, error: multimodalSettled.reason },
        "Hybrid search multimodal query embedding threw"
      );
    }

    if (contextualSettled.status === "fulfilled") {
      const ctxResult = contextualSettled.value;
      if (!("detail" in ctxResult)) {
        const ctxEmb = ctxResult.data[0]?.data[0]?.embedding;
        if (ctxEmb) {
          const rows = await this.prisma.searchUserStoreChunksHybrid(
            store.id,
            `[${ctxEmb.join(",")}]`,
            semanticLimit,
            threshold,
            terms,
            fulltextLimit,
            "voyage-context-3",
            filenameFilter
          );
          allRows.push(...rows);
        }
      } else {
        this.logger.warn(
          { userId, detail: this.prisma.safeErrMsg(ctxResult.detail) },
          "Hybrid search contextual query embedding failed"
        );
      }
    } else {
      this.logger.warn(
        { userId, error: contextualSettled.reason },
        "Hybrid search contextual query embedding threw"
      );
    }

    return this.partitionHybridRows(allRows, terms, threshold);
  }

  private partitionHybridRows(
    rows: HybridChunkHit[],
    searchTerms: string | null,
    threshold: number
  ): PartitionedSearchResult {
    const semanticSeen = new Set<string>();
    const fulltextSeen = new Set<string>();
    const semantic = Array.of<HybridChunkHit>();
    const fulltext = Array.of<HybridChunkHit>();

    // Filter rows with null id (can't happen at runtime — Prisma CTE nullability artifact)
    const valid = rows.filter((r): r is HybridChunkHit & { id: string } =>
      r.id != null
    );

    // Sort by score descending within each signal so dedup keeps highest score
    valid.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    for (const row of valid) {
      if (row.signal === "semantic") {
        if (!semanticSeen.has(row.id)) {
          semanticSeen.add(row.id);
          semantic.push(row);
        }
      } else if (row.signal === "fulltext") {
        if (!fulltextSeen.has(row.id)) {
          fulltextSeen.add(row.id);
          fulltext.push(row);
        }
      }
    }

    // Re-sort by rank ascending (positional order from the query)
    semantic.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    fulltext.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

    const overlapIds = [...semanticSeen].filter(id => fulltextSeen.has(id));
    const unionSize = new Set([...semanticSeen, ...fulltextSeen]).size;

    return {
      semantic,
      fulltext,
      overlap: {
        chunkIds: overlapIds,
        jaccardSimilarity: unionSize > 0 ? overlapIds.length / unionSize : 0
      },
      meta: {
        searchTerms,
        semanticThreshold: threshold,
        semanticCount: semantic.length,
        fulltextCount: fulltext.length
      }
    } satisfies PartitionedSearchResult;
  }

  private emptyPartitionedResult(
    searchTerms: string | null,
    threshold: number
  ): PartitionedSearchResult {
    return {
      semantic: [],
      fulltext: [],
      overlap: { chunkIds: [], jaccardSimilarity: 0 },
      meta: {
        searchTerms,
        semanticThreshold: threshold,
        semanticCount: 0,
        fulltextCount: 0
      }
    } satisfies PartitionedSearchResult;
  }

  public formatPartitionedResults(result: PartitionedSearchResult, query: string) {
    const searchTerms = result.meta.searchTerms;
    const parsedTerms = searchTerms
      ? this.parseSearchTerms(searchTerms)
      : Array.of<string>();

    const toScore = (raw: number | null) =>
      raw != null ? Number(Number(raw).toFixed(4)) : 0;

    const semanticResults = result.semantic.map(r => ({
      filename: r.filename,
      score: toScore(r.score),
      content: r.content,
      startOffset: r.startOffset,
      endOffset: r.endOffset,
      chunkIndex: r.chunkIndex,
      rank: r.rank,
      match_type: r.appearsInBothSignals === true ? "both" : "semantic"
    }));

    const fulltextResults = result.fulltext.map(r => {
      const { matchedTerms, spans } =
        r.content && parsedTerms.length > 0
          ? this.extractMatchedSpans(r.content, parsedTerms)
          : { matchedTerms: Array.of<string>(), spans: Array.of<[number, number]>() };

      return {
        filename: r.filename,
        score: toScore(r.score),
        content: r.content,
        startOffset: r.startOffset,
        endOffset: r.endOffset,
        chunkIndex: r.chunkIndex,
        rank: r.rank,
        match_type: r.appearsInBothSignals === true ? "both" : "fulltext",
        matched_terms: matchedTerms,
        matched_spans: spans
      };
    });

    const overlapResults = result.overlap.chunkIds
      .map(chunkId => {
        const semHit = result.semantic.find(r => r.id === chunkId);
        const ftHit = result.fulltext.find(r => r.id === chunkId);
        const hit = semHit ?? ftHit;
        if (!hit) return null;

        const { matchedTerms, spans } =
          hit.content && parsedTerms.length > 0
            ? this.extractMatchedSpans(hit.content, parsedTerms)
            : { matchedTerms: Array.of<string>(), spans: Array.of<[number, number]>() };

        return {
          filename: hit.filename,
          semantic_score: semHit ? toScore(semHit.score) : null,
          fulltext_score: ftHit ? toScore(ftHit.score) : null,
          content: hit.content,
          startOffset: hit.startOffset,
          endOffset: hit.endOffset,
          chunkIndex: hit.chunkIndex,
          match_type: "both",
          matched_terms: matchedTerms,
          matched_spans: spans
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);

    return JSON.stringify({
      query,
      search_terms: searchTerms,
      semantic_results: semanticResults,
      fulltext_results: fulltextResults,
      overlap_results: overlapResults,
      metadata: {
        semantic_count: result.meta.semanticCount,
        fulltext_count: result.meta.fulltextCount,
        overlap_count: result.overlap.chunkIds.length,
        jaccard_similarity: Number(
          result.overlap.jaccardSimilarity.toFixed(4)
        ),
        semantic_threshold: result.meta.semanticThreshold
      }
    });
  }

  private parseSearchTerms(searchTerms: string) {
    const terms = Array.of<string>();
    let remaining = searchTerms;

    // Extract quoted phrases first
    const quoteRegex = /"([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = quoteRegex.exec(searchTerms)) !== null) {
      const phrase = match[1];
      if (phrase) terms.push(phrase);
      remaining = remaining.replace(match[0], " ");
    }

    // Split remaining on whitespace, skip negated terms and boolean operators
    for (const word of remaining.split(/\s+/)) {
      const trimmed = word.trim();
      if (trimmed.length === 0 || trimmed.startsWith("-")) continue;
      if (trimmed === "OR" || trimmed === "AND") continue;
      terms.push(trimmed);
    }

    return terms;
  }

  private extractMatchedSpans(
    content: string,
    terms: readonly string[]
  ) {
    const matchedTerms = Array.of<string>();
    const spans = Array.of<[number, number]>();
    const lowerContent = content.toLowerCase();

    for (const term of terms) {
      const lowerTerm = term.toLowerCase();
      let pos = 0;
      let found = false;

      while (pos < lowerContent.length) {
        const idx = lowerContent.indexOf(lowerTerm, pos);
        if (idx === -1) break;
        spans.push([idx, idx + term.length]);
        pos = idx + term.length;
        found = true;
      }

      if (found) matchedTerms.push(term);
    }

    spans.sort((a, b) => a[0] - b[0]);
    return { matchedTerms, spans };
  }

  public async indexMessageAttachments(
    message: MessageSingleton<true>,
    storeName?: string
  ) {
    const docs = message.attachments.filter(
      att => att.assetType === "DOCUMENT"
    );
    if (docs.length === 0) return Array.of<UserStoreIndexResult>();
    const results = Array.of<UserStoreIndexResult>();
    for (const att of docs) {
      const result = await this.indexAttachment(
        att,
        message.model,
        message.provider,
        storeName
      );
      results.push(result);
    }
    return results;
  }

  private async indexAttachment(
    attachment: AttachmentSingleton<true>,
    originatingModel: string | null,
    originatingProvider: $Enums.Provider,
    storeName?: string
  ): Promise<UserStoreIndexResult> {
    const preflight = this.postUploadIndexingDecision(attachment);
    if (!preflight.ok) {
      return {
        ok: false,
        reason: preflight.reason,
        attachmentId: attachment.id,
        compatStatus:
          "compatStatus" in preflight ? preflight.compatStatus : undefined,
        ext: "ext" in preflight ? preflight.ext : undefined
      };
    }

    if (!attachment.conversationId || !attachment.messageId) {
      return {
        ok: false,
        reason: "SKIP_MISSING_CONTEXT",
        attachmentId: attachment.id,
        compatStatus: attachment.compatStatus ?? undefined
      };
    }

    const { url, ext, mime } = this.prisma.urlExtWorkupEmbeddings(attachment);
    if (!url) {
      return {
        ok: false,
        reason: "SKIP_MISSING_SOURCE_URL",
        attachmentId: attachment.id,
        compatStatus: attachment.compatStatus ?? undefined
      };
    }

    const store = await this.ensureUserStore(attachment.userId, storeName);

    const prepared = await this.prepareAttachmentPdfWorkup(attachment);
    if (!prepared.ok) {
      return {
        ok: false,
        reason: prepared.reason,
        attachmentId: attachment.id,
        compatStatus:
          "compatStatus" in prepared ? prepared.compatStatus : undefined,
        ext: "ext" in prepared ? prepared.ext : undefined
      };
    }

    const imagePages = this.uniqueSortedPages(
      prepared.images.map(image => image.page)
    );
    const annotPages = this.uniqueSortedPages(
      prepared.annotations.map(annotation => annotation.page)
    );
    const imagePagesRef = this.collapsePages(imagePages);
    const annotPagesRef = this.collapsePages(annotPages);
    const hasVisualMedia = prepared.images.length > 0;
    const visualMediaSource = hasVisualMedia ? "NATIVE" : null;
    const visualMediaContent = hasVisualMedia ? "MIXED" : null;

    const annotations = await this.resolveAnnotationOffsets(
      attachment.id,
      prepared.annotations,
      prepared.meta.pageBoxes
    );
    const extractedTextLength = prepared.structuredText.reduce(
      (sum, page) => sum + page.body.length,
      0
    );

    const provenanceId = this.prisma.toVectorStoreFilename(attachment);
    const filename = attachment.filename ?? "attachment.pdf";

    const doc = await this.prisma.upsertUserStoreDoc({
      storeId: store.id,
      attachmentId: attachment.id,
      conversationId: attachment.conversationId,
      messageId: attachment.messageId,
      originatingUrl: url,
      originatingModel,
      originatingProvider,
      provenanceId,
      filename,
      mimeType: mime || "application/pdf",
      ext: ext || "pdf",
      size: this.attachmentSizeToBigInt(attachment.size),
      embeddingModel: "voyage-multimodal-3.5",
      embeddingDim: 1024,
      hasVisualMedia,
      visualMediaSource,
      visualMediaContent,
      pageCount: prepared.meta.pageCount,
      modelSelectionReason: hasVisualMedia
        ? "probe:hasVisualMedia"
        : `mime:${mime || "application/pdf"}`,
      state: "EXTRACTING",
      extractedTextLength,
      imageCount: prepared.images.length,
      imagePages: imagePagesRef,
      annotPages: annotPagesRef,
      tokenCount: 0,
      annots:
        annotations.length > 0
          ? annotations.map(annotation => ({
              subtype: annotation.subtype,
              uri: annotation.uri,
              rect: Array.of<number>(...annotation.rect),
              startOffset: annotation.startOffset,
              endOffset: annotation.endOffset,
              pageNumber: annotation.pageNumber,
              isCdnLink: annotation.isCdnLink,
              linkedDocId: annotation.linkedDocId,
              attachmentId: annotation.attachmentId
            }))
          : null
    });

    await this.prisma.updateUserStoreDocStateTyped(
      doc.id,
      "INDEXING",
      null,
      null,
      extractedTextLength,
      prepared.images.length,
      imagePagesRef,
      annotPagesRef,
      null,
      visualMediaSource,
      visualMediaContent
    );

    const chunks = this.chunkDraftsFromOffsetCache(
      attachment.id,
      filename,
      prepared.imagesByPage
    );
    const chunkQueue = Array.of<UserStoreChunkReady>();
    const resizedTmpPaths = Array.of<string>();

    try {
      for (const chunk of chunks) {
        const finalized = await this.finalizeChunkBudget(
          attachment.id,
          chunk,
          resizedTmpPaths
        );
        chunkQueue.push(...finalized);
      }
    } catch (err) {
      const errorMessage = `Chunk preparation failed: ${this.prisma.safeErrMsg(err)}`;
      await this.prisma.updateUserStoreDocStateTyped(
        doc.id,
        "FAILED",
        0,
        0,
        extractedTextLength,
        prepared.images.length,
        imagePagesRef,
        annotPagesRef,
        errorMessage,
        visualMediaSource,
        visualMediaContent
      );
      return {
        ok: true,
        attachmentId: attachment.id,
        storeId: store.id,
        docId: doc.id,
        state: "FAILED",
        chunkCount: 0,
        readyCount: 0,
        errorCount: 0,
        tokenCount: 0
      };
    }

    if (chunkQueue.length === 0) {
      await this.prisma.updateUserStoreDocStateTyped(
        doc.id,
        "FAILED",
        0,
        0,
        extractedTextLength,
        prepared.images.length,
        imagePagesRef,
        annotPagesRef,
        "No chunkable content extracted from document",
        visualMediaSource,
        visualMediaContent
      );
      return {
        ok: true,
        attachmentId: attachment.id,
        storeId: store.id,
        docId: doc.id,
        state: "FAILED",
        chunkCount: 0,
        readyCount: 0,
        errorCount: 0,
        tokenCount: 0
      };
    }

    let readyCount = 0;
    let errorCount = 0;
    let totalTokenCount = 0;

    // Phase A: create chunk records, partition by embedding model
    const textChunks = Array.of<ChunkWithRecord>();
    const imageChunks = Array.of<ChunkWithRecord>();

    for (const [chunkIndex, chunk] of chunkQueue.entries()) {
      const contentHash = createHash("sha256")
        .update(
          `${chunk.page}:${chunk.startOffset}:${chunk.endOffset}:${chunk.text}:${chunk.images.map(image => image.index).join(",")}`
        )
        .digest("hex");

      const embeddingModel = (
        chunk.hasImages
          ? ("voyage-multimodal-3.5" as const)
          : ("voyage-context-3" as const)
      ) satisfies Voyage.ModelUnion;

      const chunkRecord = await this.prisma.createUserStoreChunkForEmbedding({
        provenanceId,
        storeId: store.id,
        docId: doc.id,
        chunkIndex,
        content: chunk.text,
        contentHash,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        hasImages: chunk.hasImages,
        hasAnnots: chunk.hasAnnots,
        pageStartOffset: chunk.startOffset,
        pageEndOffset: chunk.endOffset,
        embeddingModel
      });

      const entry = {
        chunk,
        chunkIndex,
        record: chunkRecord
      } satisfies ChunkWithRecord;
      if (chunk.hasImages) {
        imageChunks.push(entry);
      } else {
        textChunks.push(entry);
      }
    }

    // Phase B: batch embed text chunks with voyage-context-3
    if (textChunks.length > 0) {
      const batches = this.partitionTextChunkBatches(textChunks, 32_000);

      for (const batch of batches) {
        try {
          const textBodies = batch.map(({ chunk }) => chunk.text);
          const contextualResult = await this.voyage.embedChunksContextual({
            inputs: [textBodies],
            input_type: "document",
            model: "voyage-context-3",
            output_dimension: 1024
          });

          if ("detail" in contextualResult) {
            throw new Error(
              `Voyage contextual embedding error: ${this.prisma.safeErrMsg(contextualResult.detail)}`
            );
          }

          const docEmbeddings = contextualResult.data[0];
          if (!docEmbeddings) {
            throw new Error(
              "No document embeddings returned from contextual endpoint"
            );
          }

          for (const [i, { chunk, record }] of batch.entries()) {
            const embedding = docEmbeddings.data[i]?.embedding;
            if (embedding) {
              await this.prisma.updateUserStoreChunkTyped(
                record.id,
                "READY",
                `[${embedding.join(",")}]`,
                chunk.tokenCount,
                null,
                null,
                false,
                chunk.hasAnnots,
                "voyage-context-3"
              );
              readyCount += 1;
              totalTokenCount += chunk.tokenCount;
            } else {
              errorCount += 1;
              await this.prisma.updateUserStoreChunkTyped(
                record.id,
                "ERROR",
                null,
                null,
                `No embedding returned for text chunk at batch index ${i}`,
                1,
                false,
                chunk.hasAnnots,
                null
              );
            }
          }
        } catch (err) {
          for (const { chunk, record } of batch) {
            errorCount += 1;
            await this.prisma.updateUserStoreChunkTyped(
              record.id,
              "ERROR",
              null,
              null,
              this.prisma.safeErrMsg(err),
              1,
              false,
              chunk.hasAnnots,
              null
            );
          }
        }
      }
    }

    // Phase C: embed image chunks one-at-a-time with voyage-multimodal-3.5
    for (const { chunk, chunkIndex, record } of imageChunks) {
      try {
        const embeddingInput = this.buildEmbeddingInput(chunk);

        const embeddingResult = await this.voyage.embedChunksMultimodal(
          "base64",
          {
            inputs: [embeddingInput],
            model: "voyage-multimodal-3.5",
            input_type: "document"
          }
        );

        if ("detail" in embeddingResult) {
          throw new Error(
            `Voyage embedding error: ${this.prisma.safeErrMsg(embeddingResult.detail)}`
          );
        }

        const embedding = embeddingResult.data[0]?.embedding;
        if (!embedding) {
          throw new Error(
            `No embedding returned for image chunk index ${chunkIndex}`
          );
        }

        await this.prisma.updateUserStoreChunkTyped(
          record.id,
          "READY",
          `[${embedding.join(",")}]`,
          chunk.tokenCount,
          null,
          null,
          chunk.hasImages,
          chunk.hasAnnots,
          "voyage-multimodal-3.5"
        );
        readyCount += 1;
        totalTokenCount += chunk.tokenCount;
      } catch (err) {
        errorCount += 1;
        await this.prisma.updateUserStoreChunkTyped(
          record.id,
          "ERROR",
          null,
          null,
          this.prisma.safeErrMsg(err),
          1,
          chunk.hasImages,
          chunk.hasAnnots,
          null
        );
      }
    }

    const docState =
      readyCount === 0
        ? ("FAILED" as const)
        : errorCount > 0
          ? ("PARTIAL" as const)
          : ("ACTIVE" as const);

    const errorMessage =
      errorCount > 0
        ? `${errorCount}/${chunkQueue.length} chunks failed during embedding`
        : null;

    await this.prisma.updateUserStoreDocStateTyped(
      doc.id,
      docState,
      chunkQueue.length,
      totalTokenCount,
      extractedTextLength,
      prepared.images.length,
      imagePagesRef,
      annotPagesRef,
      errorMessage,
      visualMediaSource,
      visualMediaContent
    );

    if (docState === "ACTIVE") {
      this.cleanupImgMapper(attachment.id);
      if (this.prisma.extractor.exists(prepared.tmp.absTmpPath)) {
        this.prisma.extractor.rmFile(prepared.tmp.absTmpPath);
      }
      this.cleanupResizedTmpPaths(resizedTmpPaths);
    } else {
      this.logger.warn(
        {
          attachmentId: attachment.id,
          state: docState,
          retainedResizedTmpCount: resizedTmpPaths.length
        },
        "Retaining tmp assets for potential re-index attempt"
      );
    }

    return {
      ok: true,
      attachmentId: attachment.id,
      storeId: store.id,
      docId: doc.id,
      state: docState,
      chunkCount: chunkQueue.length,
      readyCount,
      errorCount,
      tokenCount: totalTokenCount
    };
  }

  public async syncUserStoreByName(userId: string) {
    await this.syncRegistry(userId);
    const storeNames = this.storeRegistry.get(userId);
    let storeNameArr = Array.of<string>();
    if (storeNames) {
      const storeKeys = Array.from(storeNames.keys());
      if (storeKeys.length > 1) {
        storeNameArr = storeKeys;
      } else {
        storeNameArr = [this.prisma.defaultUserStoreName(userId)];
      }
    }
    for (const storeName of storeNameArr) {
      await this.prisma.syncUserStore(userId, storeName);
    }
  }
}

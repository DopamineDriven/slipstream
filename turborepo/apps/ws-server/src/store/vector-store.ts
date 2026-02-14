import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type {
  AttScopedImg,
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

interface UserStoreChunkDraft {
  page: number;
  text: string;
  startOffset: number;
  endOffset: number;
  hasImages: boolean;
  hasAnnots: boolean;
  images: AttScopedImg[];
}

type ChunkBudgetAdjustReason =
  | "RESIZED"
  | "TEXT_ONLY_FALLBACK"
  | "TEXT_RECHUNK"
  | "IMAGE_RECHUNK";

interface UserStoreChunkReady extends UserStoreChunkDraft {
  tokenCount: number;
  budgetAdjustReason: ChunkBudgetAdjustReason | null;
}

type UserStoreIndexSkipReason =
  | "SKIP_NON_DOCUMENT"
  | "WAIT_COMPAT_ACTIVE"
  | "SKIP_COMPAT_FAILED"
  | "SKIP_NON_PDF"
  | "SKIP_MISSING_CONTEXT"
  | "SKIP_MISSING_SOURCE_URL";

type UserStoreIndexSkip = {
  readonly ok: false;
  readonly reason: UserStoreIndexSkipReason;
  readonly attachmentId: string;
  readonly compatStatus?: $Enums.CompatStatus;
  readonly ext?: string;
};

type UserStoreIndexSuccess = {
  readonly ok: true;
  readonly attachmentId: string;
  readonly storeId: string;
  readonly docId: string;
  readonly state: $Enums.UserStoreDocState;
  readonly chunkCount: number;
  readonly readyCount: number;
  readonly errorCount: number;
  readonly tokenCount: number;
};

export type UserStoreIndexResult = UserStoreIndexSuccess | UserStoreIndexSkip;

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

      const hasImages = pageImages.length > 0;
      const hasText = offsetEntry.body.trim().length > 0;

      if (!hasText && !hasImages) continue;

      drafts.push({
        page: offsetEntry.page,
        text: hasText
          ? offsetEntry.body
          : `[Visual content from page ${offsetEntry.page} of ${filename}]`,
        startOffset,
        endOffset,
        hasImages,
        hasAnnots: offsetEntry.hasAnnots,
        images: pageImages
      });
    }
    return drafts;
  }

  private async tokenUsageForChunk(chunk: UserStoreChunkDraft) {
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

  public async searchUserStoreChunks({
    userId,
    query,
    limit = 5,
    threshold = 0
  }: UserStoreSearchParams): Promise<UserStoreSearchResult[]> {
    if (query.trim().length === 0) return Array.of<UserStoreSearchResult>();

    const store = await this.ensureUserStore(userId);

    const queryResult = await this.voyage.embedChunksMultimodal("base64", {
      inputs: [{ content: [{ type: "text", text: query }] }],
      model: "voyage-multimodal-3.5",
      input_type: "query"
    });

    if ("detail" in queryResult) {
      this.logger.error(
        { userId, detail: this.prisma.safeErrMsg(queryResult.detail) },
        "UserStore query embedding failed"
      );
      return Array.of<UserStoreSearchResult>();
    }

    const queryEmbedding = queryResult.data[0]?.embedding;
    if (!queryEmbedding) return Array.of<UserStoreSearchResult>();

    const embedding = `[${queryEmbedding.join(",")}]`;
    return await this.prisma.searchUserStoreChunks(
      store.id,
      embedding,
      Math.max(1, Math.min(limit, 25)),
      threshold
    );
  }

  public async indexMessageAttachments(
    message: MessageSingleton<true>,
    storeName?: string
  ): Promise<UserStoreIndexResult[]> {
    const docs = message.attachments.filter(
      (att): att is AttachmentSingleton<true> & { assetType: "DOCUMENT" } =>
        att.assetType === "DOCUMENT"
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

    for (const [chunkIndex, chunk] of chunkQueue.entries()) {
      const contentHash = createHash("sha256")
        .update(
          `${chunk.page}:${chunk.startOffset}:${chunk.endOffset}:${chunk.text}:${chunk.images.map(image => image.index).join(",")}`
        )
        .digest("hex");

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
        pageEndOffset: chunk.endOffset
      });

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
            `No embedding returned for chunk index ${chunkIndex}`
          );
        }

        await this.prisma.updateUserStoreChunkTyped(
          chunkRecord.id,
          "READY",
          `[${embedding.join(",")}]`,
          chunk.tokenCount,
          null,
          null,
          chunk.hasImages,
          chunk.hasAnnots
        );
        readyCount += 1;
        totalTokenCount += chunk.tokenCount;
      } catch (err) {
        errorCount += 1;
        await this.prisma.updateUserStoreChunkTyped(
          chunkRecord.id,
          "ERROR",
          null,
          null,
          this.prisma.safeErrMsg(err),
          1,
          chunk.hasImages,
          chunk.hasAnnots
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

}

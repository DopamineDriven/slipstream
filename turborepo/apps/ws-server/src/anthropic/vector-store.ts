import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type {
  ChunkDraft,
  FileSearchToolInput,
  LocalSearchResult,
  MessageInputParams
} from "@/anthropic/types.ts";
import type { Voyage } from "@/voyage/types.ts";
import type { PageImage, StructuredPageText } from "@d0paminedriven/pdfdown";
import { AnthropicWorkup } from "@/anthropic/workup.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { UserStoreVectorService } from "@/store/vector-store.ts";
import { VoyageEmbeddingService } from "@/voyage/index.ts";
import { Anthropic } from "@anthropic-ai/sdk";
import type {
  AnthropicModelIdUnion,
  AttachmentSingleton,
  MessageSingleton
} from "@slipstream/types";

// export interface FileSearchToolInput {
//   readonly query: string;
//   readonly max_results?: number;
//   readonly filename_filter?: string;
// }

// interface FileSearchResult {
//   readonly filename: string;
//   readonly score: number;
//   readonly content: string;
//   readonly startOffset: number | null;
//   readonly endOffset: number | null;
//   readonly chunkIndex: number;
// }

// interface FileSearchResponse {
//   readonly results: FileSearchResult[];
//   readonly metadata: {
//     readonly query: string;
//     readonly totalResults: number;
//     readonly scoreRange: { readonly min: number; readonly max: number } | null;
//     readonly filenameFilter?: string;
//   };
// }

export class AnthropicVectorStoreWorkup extends AnthropicWorkup {
  // ─── Store lifecycle ─────────────────────────────────────────────────
  constructor(
    logger: LoggerService,
    voyage: VoyageEmbeddingService,
    prisma: PrismaService,
    protected userStoreVector: UserStoreVectorService,
    apiKey: string
  ) {
    super(logger, voyage, prisma, apiKey);
  }
  protected async ensureLocalStore(userId: string) {
    const cached = this.localStoreCache.get(userId);
    if (cached) return { storeId: cached.id };

    const store = await this.prisma.findLocalVectorStore(userId, "ANTHROPIC");
    this.localStoreCache.set(userId, store);
    return { storeId: store.id };
  }

  // ─── Doc record (Prisma-generated IDs) ───────────────────────────────

  protected async ensureDocRecord(
    attachment: AttachmentSingleton<true>,
    storeId: string
  ) {
    const cached = this.docCache.get(attachment.id);
    if (cached) return cached;

    const provenanceId = this.prisma.toVectorStoreFilename(attachment);
    const { ext, mime } = this.prisma.urlExtWorkupEmbeddings(attachment);
    const { fileName } = this.prisma.parseDocname(provenanceId);
    const conversationId = attachment.conversationId ?? "";
    const messageId = attachment.messageId ?? "";

    const doc = await this.prisma.upsertLocalStoreDoc({
      storeId,
      attachmentId: attachment.id,
      conversationId,
      messageId,
      provider: "ANTHROPIC",
      provenanceId,
      filename: fileName ?? "attachment",
      mimeType: mime,
      ext: ext,
      size: attachment.size ? BigInt(attachment.size) : null,
      embeddingModel: "voyage-multimodal-3.5",
      embeddingDim: 1024,
      modelSelectionReason: `mime:${mime || attachment.mime}`
    });

    const entry = {
      docId: doc.id,
      provenanceId: doc.provenanceId,
      state: doc.state
    };
    this.docCache.set(attachment.id, entry);
    return entry;
  }

  // ─── Core: chunk extraction + multimodal embedding ───────────────────

  protected async chunkAndEmbed(
    attachment: AttachmentSingleton<true>,
    docId: string,
    storeId: string
  ) {

    const provenanceId = this.prisma.toVectorStoreFilename(attachment);
    const conversationId = attachment.conversationId ?? "";
    const messageId = attachment.messageId ?? "";
    const { absTmpPath, tmpUniquename, mime } =
      await this.prisma.fetchRemoteToTmp("ANTHROPIC", attachment);

    try {
      // 1. Stream file to buffer
      const rs = createReadStream(absTmpPath);
      const iterate = rs[
        Symbol.asyncIterator
      ]() as AsyncIterableIterator<Buffer>;
      const arr = Array.of<Buffer>();
      for await (const chunk of iterate) arr.push(chunk);
      const buf = Buffer.concat(arr);

      const isPdf =
        (mime ?? "").includes("pdf") ||
        (attachment.ext ?? "").toLowerCase() === "pdf";

      let pages: StructuredPageText[];
      let imagesByPage: Map<number, PageImage[]>;
      let totalImages = 0;
      let pageCount = 0;
      let imagePages: number[] = [];
      let annotPages: number[] = [];

      if (isPdf) {
        // 2. Extract via PdfDown (Rust NAPI-RS, runs on libuv thread pool)
        const { PdfDown } = await import("@d0paminedriven/pdfdown");
        const pdfDown = new PdfDown(buf);
        const [structuredText, images, _annots, meta] = await Promise.all([
          pdfDown.structuredTextAsync(),
          pdfDown.imagesPerPageAsync(),
          pdfDown.annotationsPerPageAsync(),
          pdfDown.metadataAsync()
        ]);

        pages = structuredText;
        pageCount = meta.pageCount;
        totalImages = images.length;
        imagePages = [...new Set(images.map(img => img.page))];
        annotPages = [...new Set(_annots.map(a => a.page))];

        // 3. Build page-image index
        imagesByPage = new Map<number, PageImage[]>();
        for (const img of images) {
          const existing = imagesByPage.get(img.page);
          existing ? existing.push(img) : imagesByPage.set(img.page, [img]);
        }

        // Update doc record with extraction metadata
        await this.prisma.upsertLocalStoreDoc({
          storeId,
          attachmentId: attachment.id,
          conversationId,
          messageId,
          provider: "ANTHROPIC",
          provenanceId,
          filename: attachment.filename ?? "attachment",
          mimeType: mime || "application/pdf",
          ext: "pdf",
          hasVisualMedia: totalImages > 0,
          visualMediaHint: totalImages > 0 ? "images" : null,
          pageCount,
          imagePages:
            imagePages.length > 0
              ? this.prisma.collapsePageRef(imagePages)
              : null,
          annotPages:
            annotPages.length > 0
              ? this.prisma.collapsePageRef(annotPages)
              : null,
          modelSelectionReason:
            totalImages > 0 ? "probe:hasVisualMedia" : "mime:application/pdf"
        });
      } else {
        // Non-PDF text: treat as single-page body text
        const textContent = buf.toString("utf-8");
        pages = [{ page: 1, header: "", body: textContent, footer: "" }];
        imagesByPage = new Map();
        pageCount = 1;
      }

      // 4. Page-aware chunking — target ~1024 text tokens per chunk
      //    Track character offsets into the concatenated body text
      //    Exact token counts via Voyage Python bridge (not tiktoken approximation)
      const TARGET_TOKENS = 1024;

      // Pre-compute exact token counts for all non-empty pages in one bridge call
      const nonEmptyPages = pages.filter(
        p => p.body && p.body.trim().length > 0
      );
      const pageTexts = nonEmptyPages.map(p => p.body);
      const tokenResult = await this.voyage.countTokens(
        pageTexts,
        "voyage-multimodal-3.5"
      );

      const chunks = Array.of<ChunkDraft>();
      let currentText = "";
      let currentStartOffset = 0;
      let currentImages = Array.of<PageImage>();
      let currentTokens = 0;
      let charOffset = 0;

      for (let pi = 0; pi < nonEmptyPages.length; pi++) {
        const page = nonEmptyPages[pi];
        if (!page) continue;
        const pageTokens = tokenResult.counts[pi] ?? 0;
        const pageImages = imagesByPage.get(page.page) ?? [];

        if (
          currentTokens + pageTokens > TARGET_TOKENS &&
          currentText.length > 0
        ) {
          // Flush current chunk
          chunks.push({
            text: currentText,
            startOffset: currentStartOffset,
            endOffset: charOffset,
            images: currentImages,
            tokenCount: currentTokens
          });
          currentText = "";
          currentImages = Array.of<PageImage>();
          currentTokens = 0;
          currentStartOffset = charOffset;
        }

        const separator = currentText.length > 0 ? "\n\n" : "";
        currentText += separator + page.body;
        charOffset += separator.length + page.body.length;
        currentImages.push(...pageImages);
        currentTokens += pageTokens;
      }

      // Flush remainder
      if (currentText.length > 0) {
        chunks.push({
          text: currentText,
          startOffset: currentStartOffset,
          endOffset: charOffset,
          images: currentImages,
          tokenCount: currentTokens
        });
      }

      if (chunks.length === 0) {
        await this.prisma.updateLocalStoreDocState(
          docId,
          "FAILED",
          null,
          null,
          null,
          null,
          null,
          null,
          "No extractable text content"
        );
        return;
      }

      // 5. Phase 1 — Create QUEUED chunk records (Prisma Client, cuid2 IDs)
      const extractedTextLength = chunks.reduce(
        (acc, c) => acc + c.text.length,
        0
      );

      const chunkRecords = Array.of<{ id: string; index: number }>();
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;
        const contentHash = createHash("sha256")
          .update(chunk.text + chunk.startOffset + chunk.endOffset + "v1_0")
          .digest("hex");

        const record = await this.prisma.createLocalDocChunk(
          provenanceId,
          storeId,
          docId,
          i,
          chunk.text,
          contentHash,
          chunk.startOffset,
          chunk.endOffset
        );
        chunkRecords.push({ id: record.id, index: i });
      }

      // 6. Phase 2 — Build multimodal inputs, pre-check with countUsage, batch embed
      const BATCH_MAX_INPUTS = 1000;
      const BATCH_MAX_TOKENS = 320_000;
      const MAX_INPUT_TOKENS = 32_000;

      // Build multimodal inputs for every chunk (text + all images)
      const multimodalInputs = chunks.map(chunk => {
        const content = Array.of<
          Voyage.Multimodal.Input.Text | Voyage.Multimodal.Input.ImageBase64
        >();
        content.push({ type: "text", text: chunk.text });
        for (const img of chunk.images) {
          content.push({
            type: "image_base64",
            image_base64: `data:image/png;base64,${img.data.toString("base64")}`
          });
        }
        return { content };
      });

      // Exact token counts via Voyage Python bridge (count_usage — local, no API call)
      // Write chunk images to tmp so Python reads via PIL.Image.open(path)
      const tmpImageFiles = Array.of<string>();
      const usageInputs = chunks.map(chunk => {
        const sequence = Array.of<{ t: string } | { f: string }>();
        sequence.push({ t: chunk.text });
        for (const img of chunk.images) {
          const tmpName = this.prisma.extractor.uniqueTmpName(
            `voyage-usage-${docId}-img-${img.page}-${img.imageIndex}`,
            "png"
          );
          const absTmpPath = resolve(tmpdir(), tmpName);
          this.prisma.extractor.writeTmp(tmpName, img.data);
          sequence.push({ f: absTmpPath });
          tmpImageFiles.push(tmpName);
        }
        return sequence;
      });

      const inputTokenCounts = Array.of<number>();
      try {
        for (const sequence of usageInputs) {
          const result = await this.voyage.countUsageFromPaths(
            [sequence],
            "voyage-multimodal-3.5"
          );
          inputTokenCounts.push(result.total_tokens);
        }
      } finally {
        for (const tmpName of tmpImageFiles) {
          try {
            this.prisma.extractor.rmTmpFile(tmpName);
          } catch {
            /* best-effort */
          }
        }
      }

      // If any input exceeds 32K, strip images from text chunk and create
      // dedicated image-only overflow chunks with page references.
      // Images are still indexed — just in their own vectors.
      const originalChunkCount = chunks.length;
      for (let i = 0; i < originalChunkCount; i++) {
        if ((inputTokenCounts[i] ?? 0) <= MAX_INPUT_TOKENS) continue;

        const chunk = chunks[i];
        if (!chunk || chunk.images.length === 0) continue;

        console.info({
          chunkIndex: i,
          tokens: inputTokenCounts[i],
          offset: `${chunk.startOffset}-${chunk.endOffset}`
        });
        console.info(
          `Chunk ${i} exceeds ${MAX_INPUT_TOKENS} tokens (${inputTokenCounts[i]}), splitting images to overflow chunks`
        );

        // Replace original with text-only
        multimodalInputs[i] = {
          content: [{ type: "text", text: chunk.text }]
        };
        inputTokenCounts[i] = chunk.tokenCount;

        // Group stripped images by page for overflow chunks
        const imagesByPage = new Map<number, PageImage[]>();
        for (const img of chunk.images) {
          const existing = imagesByPage.get(img.page);
          existing ? existing.push(img) : imagesByPage.set(img.page, [img]);
        }

        for (const [page, imgs] of imagesByPage) {
          const overflowIndex = chunks.length;
          const descriptor = `[Visual content from page ${page} of ${attachment.filename ?? "document"}]`;

          // Create the overflow chunk draft
          const overflowChunk: ChunkDraft = {
            text: descriptor,
            startOffset: chunk.startOffset,
            endOffset: chunk.endOffset,
            images: imgs,
            tokenCount: 0 // will be set by countUsage below
          };
          chunks.push(overflowChunk);

          // Build multimodal input for the overflow chunk
          const overflowContent = Array.of<
            Voyage.Multimodal.Input.Text | Voyage.Multimodal.Input.ImageBase64
          >();
          overflowContent.push({ type: "text", text: descriptor });
          for (const img of imgs) {
            overflowContent.push({
              type: "image_base64",
              image_base64: `data:image/png;base64,${img.data.toString("base64")}`
            });
          }
          multimodalInputs.push({ content: overflowContent });

          // Create QUEUED chunk record for overflow
          const contentHash = createHash("sha256")
            .update(
              descriptor +
                chunk.startOffset +
                chunk.endOffset +
                `img_p${page}_v1_0`
            )
            .digest("hex");

          const record = await this.prisma.createLocalDocChunk(
            provenanceId,
            storeId,
            docId,
            overflowIndex,
            descriptor,
            contentHash,
            chunk.startOffset,
            chunk.endOffset
          );
          chunkRecords.push({ id: record.id, index: overflowIndex });
        }

        // Clear images from the original chunk (they've been moved to overflow)
        chunk.images = [];
      }

      // Get exact token counts for any new overflow inputs
      if (chunks.length > originalChunkCount) {
        const overflowTmpFiles = Array.of<string>();
        try {
          for (let o = originalChunkCount; o < chunks.length; o++) {
            const chunk = chunks[o];
            if (!chunk) continue;
            const sequence = Array.of<{ t: string } | { f: string }>();
            sequence.push({ t: chunk.text });
            for (const img of chunk.images) {
              const tmpName = this.prisma.extractor.uniqueTmpName(
                `voyage-overflow-${docId}-img-${img.page}-${img.imageIndex}`,
                "png"
              );
              const absTmpPath = resolve(tmpdir(), tmpName);
              this.prisma.extractor.writeTmp(tmpName, img.data);
              sequence.push({ f: absTmpPath });
              overflowTmpFiles.push(tmpName);
            }
            const result = await this.voyage.countUsageFromPaths(
              [sequence],
              "voyage-multimodal-3.5"
            );
            inputTokenCounts.push(result.total_tokens);
            chunk.tokenCount = result.total_tokens;
          }
        } finally {
          for (const tmpName of overflowTmpFiles) {
            try {
              this.prisma.extractor.rmTmpFile(tmpName);
            } catch {
              /* best-effort */
            }
          }
        }
      }

      // allEmbeddings[i] corresponds to chunks[i] (including overflow); null if batch failed
      const allEmbeddings = new Array<number[] | null>(chunks.length).fill(
        null
      );

      let batchStart = 0;
      while (batchStart < chunks.length) {
        const batchInputs =
          Array.of<Voyage.Multimodal.Input.Contents<"base64">>();
        const batchIndices = Array.of<number>();
        let batchTokens = 0;

        for (let i = batchStart; i < chunks.length; i++) {
          const input = multimodalInputs[i];
          if (!input) continue;

          const inputTokens = inputTokenCounts[i] ?? 0;

          if (
            batchInputs.length >= BATCH_MAX_INPUTS ||
            batchTokens + inputTokens > BATCH_MAX_TOKENS
          )
            break;

          batchInputs.push(input);
          batchIndices.push(i);
          batchTokens += inputTokens;
          batchStart = i + 1;
        }

        if (batchInputs.length === 0) {
          batchStart++;
          continue;
        }

        try {
          const result = await this.voyage.embedChunksMultimodal("base64", {
            inputs: batchInputs,
            model: "voyage-multimodal-3.5",
            input_type: "document"
          });

          if ("detail" in result) {
            console.error(
              `Voyage batch error: ${this.prisma.safeErrMsg(result.detail)}`
            );
          } else {
            for (let b = 0; b < result.data.length; b++) {
              const chunkIndex = batchIndices[b];

              if (chunkIndex != null) {
                const res = result.data[b]?.embedding;
                if (!res) continue;
                allEmbeddings[chunkIndex] = res;
              }
            }
          }
        } catch (batchErr) {
          console.error(
            { batchStart, batchSize: batchInputs.length },
            `Voyage batch failed: ${this.prisma.safeErrMsg(batchErr)}`
          );
        }
      }

      // 7. Phase 3 — Update each chunk: QUEUED → READY, or collect for retry
      let totalTokenCount = 0;
      let readyCount = 0;
      const failedChunks = Array.of<{
        chunkId: string;
        index: number;
        reason: string;
      }>();

      for (const { id: chunkId, index } of chunkRecords) {
        const chunk = chunks[index];
        const embedding = allEmbeddings[index];

        if (!chunk || !embedding) {
          failedChunks.push({
            chunkId,
            index,
            reason: "Embedding not produced for chunk"
          });
          continue;
        }

        try {
          const embeddingStr = `[${embedding.join(",")}]`;
          await this.prisma.insertLocalDocChunkTyped(
            chunkId,
            "READY",
            embeddingStr,
            chunk.tokenCount,
            null
          );
          totalTokenCount += chunk.tokenCount;
          readyCount++;
        } catch (chunkErr) {
          failedChunks.push({
            chunkId,
            index,
            reason: this.prisma.safeErrMsg(chunkErr)
          });
        }
      }

      // 8. Retry pass — text-only, individual calls (strip images, isolate failures)
      //    Most likely cause: image token heuristic undercounted, pushing past 32K
      let errorCount = 0;

      if (failedChunks.length > 0) {
        console.info({ docId, failed: failedChunks.length });
        console.info(
          `Retrying ${failedChunks.length} chunks text-only (images stripped)`
        );

        for (const { chunkId, index, reason: initialReason } of failedChunks) {
          const chunk = chunks[index];
          if (!chunk) {
            await this.prisma.insertLocalDocChunkTyped(
              chunkId,
              "ERROR",
              null,
              null,
              initialReason
            );
            errorCount++;
            continue;
          }

          try {
            const retryResult = await this.voyage.embedChunksMultimodal(
              "base64",
              {
                inputs: [{ content: [{ type: "text", text: chunk.text }] }],
                model: "voyage-multimodal-3.5",
                input_type: "document"
              }
            );

            if ("detail" in retryResult) {
              await this.prisma.insertLocalDocChunkTyped(
                chunkId,
                "ERROR",
                null,
                null,
                `retry failed [offset ${chunk.startOffset}-${chunk.endOffset}]: ${this.prisma.safeErrMsg(retryResult.detail)}`
              );
              errorCount++;
              continue;
            }

            const retryEmbedding = retryResult.data[0]?.embedding;
            if (!retryEmbedding) {
              await this.prisma.insertLocalDocChunkTyped(
                chunkId,
                "ERROR",
                null,
                null,
                `retry produced no embedding [offset ${chunk.startOffset}-${chunk.endOffset}]`
              );
              errorCount++;
              continue;
            }

            const embeddingStr = `[${retryEmbedding.join(",")}]`;
            await this.prisma.insertLocalDocChunkTyped(
              chunkId,
              "READY",
              embeddingStr,
              chunk.tokenCount,
              null
            );
            totalTokenCount += chunk.tokenCount;
            readyCount++;
            console.info({
              chunkId,
              offset: `${chunk.startOffset}-${chunk.endOffset}`
            });
            console.info(
              `Retry succeeded (text-only) for chunk at offset ${chunk.startOffset}`
            );
          } catch (retryErr) {
            await this.prisma.insertLocalDocChunkTyped(
              chunkId,
              "ERROR",
              null,
              null,
              `retry failed [offset ${chunk.startOffset}-${chunk.endOffset}]: ${this.prisma.safeErrMsg(retryErr)}`
            );
            errorCount++;
          }
        }
      }

      // 9. Update doc state based on final chunk results
      const docState = errorCount === chunkRecords.length ? "FAILED" : "ACTIVE";
      const collapsedImagePages =
        imagePages.length > 0 ? this.prisma.collapsePageRef(imagePages) : null;
      const collapsedAnnotPages =
        annotPages.length > 0 ? this.prisma.collapsePageRef(annotPages) : null;

      await this.prisma.updateLocalStoreDocState(
        docId,
        docState,
        chunkRecords.length,
        totalTokenCount,
        extractedTextLength,
        totalImages,
        collapsedImagePages,
        collapsedAnnotPages,
        errorCount > 0 && docState === "ACTIVE"
          ? `${errorCount}/${chunkRecords.length} chunks failed after retry`
          : null
      );

      if (errorCount > 0) {
        this.logger.warn(
          { docId, ready: readyCount, errors: errorCount },
          `Partial indexing: ${errorCount}/${chunkRecords.length} chunks failed after retry for ${attachment.filename}`
        );
      }

      this.logger.info(
        { docId, chunks: readyCount, tokens: totalTokenCount },
        `Indexed ${readyCount} chunks for ${attachment.filename}`
      );
    } catch (err) {
      await this.prisma.updateLocalStoreDocState(
        docId,
        "FAILED",
        null,
        null,
        null,
        null,
        null,
        null,
        this.prisma.safeErrMsg(err)
      );
      this.logger.error(this.prisma.safeErrMsg(err));
      throw new Error(this.prisma.safeErrMsg(err));
    } finally {
      this.prisma.cleanupTmpPostupload("ANTHROPIC", absTmpPath, tmpUniquename);
    }
  }

  // ─── Search ──────────────────────────────────────────────────────────

  protected async searchStore(
    userId: string,
    query: string,
    limit = 5,
    threshold = 0.3
  ): Promise<LocalSearchResult[]> {
    return await this.userStoreVector.searchUserStoreChunks({
      userId,
      query,
      limit,
      threshold
    });
  }

  // Legacy local-store indexing methods are intentionally retained in this
  // class for now, but search is routed through UserStoreVectorService.

  // ─── Custom file_search tool definition ──────────────────────────────

  protected fileSearchTool(): Anthropic.Beta.BetaToolUnion {
    return {
      name: "file_search",
      allowed_callers: ["code_execution_20250825"],
      description:
        "Search the user's uploaded documents using semantic similarity. " +
        "Returns a JSON array of matching chunks. Each element has: " +
        '{ "filename": string, "score": number (0-1), "content": string, ' +
        '"startOffset": number | null, "endOffset": number | null, "chunkIndex": number }. ' +
        "Use code_execution to call this tool and process results programmatically.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "The semantic search query"
          },
          max_results: {
            type: "number",
            description: "Maximum results to return (1-10, default 5)"
          }
        },
        required: ["query"]
      }
    } satisfies Anthropic.Beta.BetaToolUnion;
  }

  protected async executeFileSearch(
    userId: string,
    input: FileSearchToolInput
  ): Promise<string> {
    const results = await this.searchStore(
      userId,
      input.query,
      Math.min(input.max_results ?? 5, 10),
      0
    );

    if (results.length === 0) {
      return "[]";
    }

    return JSON.stringify(
      results.map(r => ({
        filename: r.filename,
        score: r.score != null ? Number(r.score.toFixed(4)) : 0,
        content: r.content,
        startOffset: r.startOffset,
        endOffset: r.endOffset,
        chunkIndex: r.chunkIndex
      }))
    );
  }

  // ─── Override tooling to conditionally include file_search ───────────
  private webSearchTool(
    user_location:
      | Anthropic.Beta.Messages.BetaWebSearchTool20250305.UserLocation
      | null
      | undefined
  ) {
    return {
      type: "web_search_20250305",
      name: "web_search",
      user_location
    } as const satisfies Anthropic.Beta.BetaWebSearchTool20250305;
  }

  private webFetchTool() {
    return {
      name: "web_fetch",
      type: "web_fetch_20250910",
      citations: { enabled: true }
    } as const satisfies Anthropic.Beta.BetaToolUnion;
  }

  private codeExecutionTool() {
    return {
      type: "code_execution_20250825",
      name: "code_execution"
    } as const satisfies Anthropic.Beta.BetaToolUnion;
  }

  protected tooling(
    m: AnthropicModelIdUnion,
    user_location:
      | Anthropic.Beta.Messages.BetaWebSearchTool20250305.UserLocation
      | null
      | undefined,
    hasLocalStore = false
  ) {
    if (m === "claude-3-haiku-20240307") {
      return [
        this.webSearchTool(user_location)
      ] satisfies Anthropic.Beta.BetaToolUnion[];
    } else {
      if (hasLocalStore) {
        return [
          // this.webSearchTool(user_location),
          // this.webFetchTool(),
          this.codeExecutionTool(),
          this.fileSearchTool()
        ];
      }
      return [
        this.webSearchTool(user_location),
        this.webFetchTool(),
        this.codeExecutionTool()
      ] satisfies Anthropic.Beta.BetaToolUnion[];
    }
  }

  protected async formatAnthropicHistoryWithFiles(
    isNewChat: boolean,
    msgs: MessageSingleton<true>[],
    model: AnthropicModelIdUnion,
    systemPrompt?: string,
    keyFingerprint = "server",
    keyId?: string,
    apiKey?: string
  ) {
    const lastClaudeIndex = msgs.findLastIndex(
      m => m.provider === "ANTHROPIC" && m.senderType === "AI"
    );
    const isFirstClaudeMsg = lastClaudeIndex === -1;

    const messages: Anthropic.Beta.BetaMessageParam[] = [];

    for (const [msgIndex, msg] of msgs.entries()) {
      const isFreshContext = isFirstClaudeMsg || msgIndex > lastClaudeIndex;

      if (msg.senderType === "USER") {
        const content: Anthropic.Beta.BetaContentBlockParam[] = [];
        const textParts: string[] = [];

        if (msg.attachments && msg.attachments.length > 0) {
          for (const attachment of msg.attachments) {
            const url =
              attachment.compatStatus === "ACTIVE"
                ? attachment.compatCdnUrl
                : attachment.cdnUrl;
            const mime =
              attachment.compatStatus === "ACTIVE"
                ? attachment.compatMime
                : attachment.mime;

            if (!url || !mime) continue;

            const filename = attachment.filename ?? "attachment";

            if (isFreshContext) {
              if (attachment.assetType === "DOCUMENT") {
                try {
                  const fileId = await this.ensureAnthropicAssetUploaded(
                    attachment,
                    model,
                    keyFingerprint,
                    keyId,
                    apiKey
                  );
                  content.push({
                    type: "document",
                    source: { type: "file", file_id: fileId },
                    citations: { enabled: true }
                  } satisfies Anthropic.Beta.BetaRequestDocumentBlock);
                } catch {
                  content.push({
                    type: "document",
                    source: { type: "url", url },
                    citations: { enabled: true }
                  } satisfies Anthropic.Beta.BetaRequestDocumentBlock);
                }
              } else if (attachment.assetType === "IMAGE") {
                const sizeInMB = (attachment.size ?? 0) / 1024 / 1024;

                if (sizeInMB >= 1) {
                  try {
                    const fileId = await this.ensureAnthropicAssetUploaded(
                      attachment,
                      model,
                      keyFingerprint,
                      keyId,
                      apiKey
                    );
                    content.push({
                      type: "image",
                      source: { type: "file", file_id: fileId }
                    } satisfies Anthropic.Beta.BetaImageBlockParam);
                  } catch {
                    content.push({
                      type: "image",
                      source: { type: "url", url }
                    } satisfies Anthropic.Beta.BetaImageBlockParam);
                  }
                } else {
                  content.push({
                    type: "image",
                    source: { type: "url", url }
                  } satisfies Anthropic.Beta.BetaImageBlockParam);
                }
              }
            } else {
              // Stale context
              if (attachment.assetType === "IMAGE") {
                textParts.push(`[seen] ![${filename}](${url})`);
              } else {
                textParts.push(`[seen] [${filename}](${url})`);
              }
            }
          }
        }

        textParts.push(msg.content);
        content.push({
          type: "text",
          text: textParts.join("\n\n")
        } satisfies Anthropic.Beta.BetaTextBlockParam);

        messages.push({ role: "user", content });
      } else {
        const textParts = Array.of<string>();
        textParts.push(msg.content);
        if (msg.attachments && msg.attachments.length > 0) {
          for (const attachment of msg.attachments) {
            const url =
              attachment.compatStatus === "ACTIVE"
                ? attachment.compatCdnUrl
                : attachment.cdnUrl;

            if (!url) continue;

            const filename = attachment.filename ?? "attachment";

            if (attachment.assetType === "IMAGE") {
              if (isFreshContext) {
                textParts.push(`![${filename}](${url})`);
              } else {
                textParts.push(`[seen] ![${filename}](${url})`);
              }
            } else {
              if (isFreshContext) {
                textParts.push(`[${filename}][${url}]`);
              } else {
                textParts.push(`[seen] [${filename}](${url})`);
              }
            }
          }
        }

        messages.push({
          role: "assistant",
          content: `<model provider="${msg.provider.toLowerCase()}" name="${msg.model}">\n${textParts.join("\n\n")}\n</model>`
        });
      }
    }

    const systemNote = `Note: Previous responses may be tagged with their source provider-model combo for context.

        Attachments marked [seen] have already been reviewed in earlier turns; re-fetch or re-extract previously seen assets as warranted (as context needs arise).`;

    const enhancedSystemPrompt = systemPrompt
      ? `${systemPrompt}\n\n${systemNote}`
      : systemNote;

    return {
      messages,
      system: [
        {
          type: "text",
          text: enhancedSystemPrompt
        }
      ] satisfies Anthropic.Beta.BetaTextBlockParam[]
    };
  }

  // ─── Multi-turn tool use streaming loop ──────────────────────────────

  protected async createStreamWorkup({
    isNewChat,
    messages: msgs,
    userId,
    apiKey,container,
    keyId,
    max_tokens,
    model: m,
    systemPrompt,
    temperature,
    topP,
    user_location
  }: MessageInputParams) {
    const model = m as AnthropicModelIdUnion;

    const keyFingerprint = keyId ?? "server";

    // Use Files API for PDFs
    const { messages, system } = await this.formatAnthropicHistoryWithFiles(
      isNewChat,
      msgs,
      model,
      systemPrompt,
      keyFingerprint,
      keyId ?? undefined,
      apiKey
    );

    this.logger.info(messages);

    const { max_tokens: maxTokens, thinking } = this.handleMaxTokensAndThinking(
      model,
      max_tokens
    );

    const hasUserStoreDocs = await this.prisma.hasUserStoreDocs(userId);

    const tools = this.tooling(model, user_location, hasUserStoreDocs);

    const betas = this.handleBetaHeaders(model, hasUserStoreDocs);
    this.logger.info(betas, "beta headers");
    // only opus 4.5 and 4.6 support effort config
    if (model === "claude-opus-4-6" || model === "claude-opus-4-5-20251101") {
      return {
        params: {
          max_tokens: maxTokens,
          stream: true,
          thinking,
          top_p: topP,
          temperature,
          system,
          container,
          model,
          tools,
          // only 4.6 supports max effort
          output_config: {
            effort: model === "claude-opus-4-6" ? "max" : "high"
          },
          tool_choice: { type: "auto" },
          metadata: { user_id: userId },
          messages,
          service_tier: "auto",
          betas
        } satisfies Anthropic.Beta.Messages.MessageCreateParamsStreaming
      };
    } else {
      return {
        params: {
          max_tokens: maxTokens,
          stream: true,
          thinking,
          top_p: topP,
          temperature,
          system,
          container,
          model,
          tools,
          tool_choice: { type: "auto" },
          metadata: { user_id: userId },
          messages,
          service_tier: "auto",
          betas
        } satisfies Anthropic.Beta.Messages.MessageCreateParamsStreaming
      };
    }
  }
}

/**
 protected fileSearchTool() {
  return {
    name: "file_search",
    description: [
      "Search the user's uploaded documents using semantic similarity.",
      "Returns a JSON array of matching chunks, ranked by relevance score.",
      "Each element contains:",
      '  { "filename": string, "score": number (0-1, higher=more relevant),',
      '    "content": string, "startOffset": number | null,',
      '    "endOffset": number | null, "chunkIndex": number }.',
      "",
      "Guidelines:",
      "- Break complex questions into multiple targeted queries.",
      "- Use specific terms from the domain rather than generic phrases.",
      "- If initial results have low scores (<0.3), rephrase and retry.",
      "- Combine results from multiple queries for comprehensive answers.",
      "- Quote relevant passages from 'content' when citing documents."
    ].join("\n"),
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Semantic search query. Be specific and use domain terminology from the user's question.",
          minLength: 1,
          maxLength: 512
        },
        max_results: {
          type: "integer",
          description:
            "Maximum number of chunks to return. Use higher values for broad questions, lower for specific lookups.",
          minimum: 1,
          maximum: 20,
          default: 5
        },
        filename_filter: {
          type: "string",
          description:
            "Optional: filter results to a specific filename (exact match). Omit to search all documents."
        }
      },
      required: ["query"] as const,
      additionalProperties: false as const
    },
    allowed_callers: ["code_execution_20250825"],
    input_examples: [
      { query: "protein binding affinity", max_results: 5 },
      {
        query: "quarterly revenue growth",
        max_results: 10,
        filename_filter: "Q3-report.pdf"
      }
    ]
  } as const satisfies Anthropic.Beta.BetaToolUnion;
}

protected async executeFileSearch(
  userId: string,
  input: FileSearchToolInput
): Promise<string> {
  const maxResults = Math.min(Math.max(input.max_results ?? 5, 1), 20);
  const query = input.query.trim();

  if (query.length === 0) {
    return JSON.stringify({
      results: [],
      metadata: {
        query: input.query,
        totalResults: 0,
        scoreRange: null
      }
    } satisfies FileSearchResponse);
  }

  // Fetch more than needed so we can apply a meaningful threshold
  // after seeing the actual score distribution
  const fetchLimit = Math.min(maxResults * 3, 60);

  const raw = await this.searchStore(
    userId,
    query,
    fetchLimit,
    0.0 // Don't pre-filter — let us inspect the full distribution
  );

  if (raw.length === 0) {
    return JSON.stringify({
      results: [],
      metadata: {
        query,
        totalResults: 0,
        scoreRange: null
      }
    } satisfies FileSearchResponse);
  }

  // ── Score diagnostics ──────────────────────────────────────
  const scores = raw.map(r => r.score ?? 0);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;

  this.logger.debug(
    {
      query,
      fetchedCount: raw.length,
      scoreMin: min.toFixed(4),
      scoreMax: max.toFixed(4),
      scoreMean: mean.toFixed(4),
      // If max < 0.5 with Voyage, something is likely wrong
      // with distance-vs-similarity conversion
      possibleDistanceNotSimilarity: max < 0.5 && raw.length > 3
    },
    "file_search score distribution"
  );

  // ── Apply filename filter if provided ──────────────────────
  let filtered = input.filename_filter
    ? raw.filter(r => r.filename === input.filename_filter)
    : raw;

  // ── Adaptive threshold ─────────────────────────────────────
  // Instead of a fixed cutoff, use relative scoring:
  // keep results within 40% of the best score, but always
  // keep at least 1 result if anything was returned
  const bestScore = Math.max(...filtered.map(r => r.score ?? 0));
  const adaptiveThreshold = bestScore * 0.6;

  filtered = filtered.filter(r => (r.score ?? 0) >= adaptiveThreshold);

  if (filtered.length === 0 && raw.length > 0) {
    // Fallback: return the single best match
    const best = raw.reduce((a, b) =>
      (a.score ?? 0) > (b.score ?? 0) ? a : b
    );
    filtered = [best];
  }

  const results = filtered
    .slice(0, maxResults)
    .map(
      (r): FileSearchResult => ({
        filename: r.filename,
        score: Number((r.score ?? 0).toFixed(4)),
        content: r.content,
        startOffset: r.startOffset ?? null,
        endOffset: r.endOffset ?? null,
        chunkIndex: r.chunkIndex
      })
    );

  return JSON.stringify({
    results,
    metadata: {
      query,
      totalResults: results.length,
      scoreRange: { min, max },
      ...(input.filename_filter
        ? { filenameFilter: input.filename_filter }
        : {})
    }
  } satisfies FileSearchResponse);
}
 */

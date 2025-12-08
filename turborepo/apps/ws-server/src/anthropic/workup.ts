import { createReadStream } from "node:fs";
import type {
  AnthropicFileRecord,
  PdfBudgetEntry,
  ProviderAnthropicChatRequestEntity
} from "@/anthropic/types.ts";
import type { Logger as PinoLogger } from "pino";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { Anthropic } from "@anthropic-ai/sdk";
import type {
  AnthropicModelIdUnion,
  AttachmentSingleton,
  MessageSingleton
} from "@slipstream/types";

export class AnthropicWorkup {
  private readonly ANTHROPIC_PAGE_BUDGET = 95;
  protected defaultClient: Anthropic;
  protected logger: PinoLogger;
  private assetCache = new Map<
    string,
    { fileId: string; dbRecordId: string; lastCheckedAt: Date | null }
  >();
  // Registry of all Anthropic files with access tracking
  private fileRegistry = new Map<string, AnthropicFileRecord>();
  private lastRegistrySync: Date | null = null;
  constructor(
    logger: LoggerService,
    protected prisma: PrismaService,
    protected apiKey: string
  ) {
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[anthropic] " }
      );
    this.defaultClient = new Anthropic({
      apiKey: this.apiKey,
      logLevel: "debug",
      logger: this.logger
    });
  }
  protected getClient(overrideKey?: string) {
    const client = this.defaultClient;
    if (overrideKey) {
      return client.withOptions({ apiKey: overrideKey });
    }
    return client;
  }
  private allocatePdfBudget(
    msgs: MessageSingleton<true>[]
  ): Map<string, PdfBudgetEntry> {
    const pdfEntries: PdfBudgetEntry[] = [];

    msgs.forEach((msg, turnIndex) => {
      if (!msg.attachments) return;

      for (const att of msg.attachments) {
        const mime = att.compatStatus === "ACTIVE" ? att.compatMime : att.mime;
        const url =
          att.compatStatus === "ACTIVE" ? att.compatCdnUrl : att.cdnUrl;

        if (mime === "application/pdf" && url) {
          pdfEntries.push({
            attachmentId: att.id,
            pageCount: att.document?.pageCount ?? 10, // Fallback shouldn't hit
            filename: att.filename ?? "document.pdf",
            url,
            turnIndex,
            included: false
          });
        }
      }
    });

    // Most recent first
    pdfEntries.sort((a, b) => b.turnIndex - a.turnIndex);

    // Allocate budget
    let remaining = this.ANTHROPIC_PAGE_BUDGET;

    for (const entry of pdfEntries) {
      if (entry.pageCount <= remaining) {
        entry.included = true;
        remaining -= entry.pageCount;
      }
    }

    this.logBudgetAllocation(pdfEntries);

    return new Map(pdfEntries.map(e => [e.attachmentId, e]));
  }
  private logBudgetAllocation(entries: PdfBudgetEntry[]): void {
    const included = entries.filter(e => e.included);
    const excluded = entries.filter(e => !e.included);

    this.logger.info(
      {
        totalPdfs: entries.length,
        included: included.map(e => `${e.filename} (${e.pageCount}p)`),
        excluded: excluded.map(e => `${e.filename} (${e.pageCount}p)`),
        budgetUsed: `${included.reduce((s, e) => s + e.pageCount, 0)}/${this.ANTHROPIC_PAGE_BUDGET}`
      },
      "PDF budget allocation"
    );
  }
  private createPdfReferenceBlock(
    entry: PdfBudgetEntry
  ): Anthropic.Beta.BetaTextBlockParam {
    return {
      type: "text",
      text: `[Document: "${entry.filename}" (${entry.pageCount} pages) - ${entry.url}]`
    };
  }
  protected handleBetaHeaders(model: AnthropicModelIdUnion) {
    switch (model) {
      // effort parameter is only supported by claude-opus-4.5
      case "claude-opus-4-5-20251101": {
        return [
          "effort-2025-11-24",
          "files-api-2025-04-14",
          "extended-cache-ttl-2025-04-11"
        ] satisfies Anthropic.Beta.AnthropicBeta[];
      }
      // context window 1m is only supported by claude-sonnet-4 & claude-sonnet-4.5
      case "claude-sonnet-4-5-20250929":
      case "claude-sonnet-4-20250514": {
        return [
          "files-api-2025-04-14",
          "extended-cache-ttl-2025-04-11",
          "context-1m-2025-08-07"
        ] satisfies Anthropic.Beta.AnthropicBeta[];
      }
      // output context window expansion 64k->128k is only supported by claude-sonnet-3.7
      case "claude-3-7-sonnet-20250219": {
        return [
          "files-api-2025-04-14",
          "extended-cache-ttl-2025-04-11",
          "output-128k-2025-02-19"
        ] satisfies Anthropic.Beta.AnthropicBeta[];
      }
      case "claude-3-5-haiku-20241022":
      case "claude-3-haiku-20240307":
      case "claude-opus-4-20250514":
      case "claude-opus-4-1-20250805":
      case "claude-haiku-4-5-20251001":
      default: {
        return [
          "files-api-2025-04-14",
          "extended-cache-ttl-2025-04-11"
        ] satisfies Anthropic.Beta.AnthropicBeta[];
      }
    }
  }

  private get outputTokensByModel() {
    return {
      "claude-3-haiku-20240307": 4096,
      "claude-3-5-haiku-20241022": 8192,
      "claude-opus-4-20250514": 32000,
      "claude-opus-4-1-20250805": 32000,
      "claude-opus-4-5-20251101": 64000,
      "claude-haiku-4-5-20251001": 64000,
      "claude-sonnet-4-20250514": 64000,
      "claude-sonnet-4-5-20250929": 64000,
      "claude-3-7-sonnet-20250219": 128000
    } as const satisfies Record<
      AnthropicModelIdUnion,
      4096 | 8192 | 32000 | 64000 | 128000
    >;
  }

  private get inputTokenCeilingByModel() {
    return {
      "claude-3-haiku-20240307": 200000,
      "claude-3-5-haiku-20241022": 200000,
      "claude-opus-4-20250514": 200000,
      "claude-opus-4-1-20250805": 200000,
      "claude-opus-4-5-20251101": 200000,
      "claude-haiku-4-5-20251001": 200000,
      "claude-sonnet-4-20250514": 1000000,
      "claude-sonnet-4-5-20250929": 1000000,
      "claude-3-7-sonnet-20250219": 200000
    } as const satisfies Record<AnthropicModelIdUnion, 200000 | 1000000>;
  }

  private getMaxTokens = <const T extends AnthropicModelIdUnion>(model: T) => {
    return this.outputTokensByModel[model];
  };

  private handleMaxTokens(mod: AnthropicModelIdUnion, max_tokens?: number) {
    const model = mod as AnthropicModelIdUnion;
    if (max_tokens && max_tokens <= this.getMaxTokens(model)) {
      return max_tokens;
    } else {
      return this.getMaxTokens(model);
    }
  }

  private handleThinking(mod: AnthropicModelIdUnion, max_tokens?: number) {
    switch (mod) {
      case "claude-3-7-sonnet-20250219":
      case "claude-opus-4-1-20250805":
      case "claude-opus-4-20250514":
      case "claude-sonnet-4-20250514":
      case "claude-haiku-4-5-20251001":
      case "claude-opus-4-5-20251101":
      case "claude-sonnet-4-5-20250929": {
        if (this.handleMaxTokens(mod, max_tokens) >= 1024) {
          return {
            type: "enabled",
            budget_tokens: this.getMaxTokens(mod) - 1024
          } as const satisfies Anthropic.Beta.BetaThinkingConfigEnabled;
        } else {
          return {
            type: "disabled"
          } as const satisfies Anthropic.Beta.BetaThinkingConfigDisabled;
        }
      }
      case "claude-3-5-haiku-20241022":
      case "claude-3-haiku-20240307":
      default: {
        return {
          type: "disabled"
        } as const satisfies Anthropic.Beta.BetaThinkingConfigDisabled;
      }
    }
  }

  private async *getAllAnthropicFiles(apiKey?: string, limit = 50) {
    let has_more = true;
    let count = 0;
    let after_id: string | undefined = undefined;

    const client = this.getClient(apiKey);

    while (has_more) {
      const page = await client.beta.files.list({
        limit,
        after_id,
        betas: ["files-api-2025-04-14", "extended-cache-ttl-2025-04-11"]
      });

      has_more = page.has_more;
      after_id = page.last_id ?? undefined;
      count += page.data.length;

      yield {
        data: page.data,
        count,
        has_more,
        first_id: page.first_id,
        last_id: page.last_id
      };
    }
  }

  protected handleMaxTokensAndThinking(
    mod: AnthropicModelIdUnion,
    max_tokens?: number
  ) {
    return {
      thinking: this.handleThinking(mod, max_tokens),
      max_tokens: this.handleMaxTokens(mod, max_tokens)
    };
  }

  protected webSearchTool(
    user_location: ProviderAnthropicChatRequestEntity["user_location"]
  ) {
    return [
      {
        type: "web_search_20250305",
        cache_control: { type: "ephemeral", ttl: "1h" },
        name: "web_search",
        user_location
      } satisfies Anthropic.Beta.BetaWebSearchTool20250305
    ];
  }

  public async syncFileRegistry(userId: string, cleanupStaleFiles = true) {
    const hasAnthropicMessages = await this.prisma.hasProviderMessages(
      userId,
      "ANTHROPIC"
    );
    if (!hasAnthropicMessages)
      return { synced: true, totalFiles: 0, lastSync: new Date() };
    const tryApiKey = await this.prisma.handleApiKeyLookup("anthropic", userId);

    console.info(
      `Starting Anthropic file registry sync -- ${tryApiKey.apiKey === null ? "no anthropic key on file" : "anthropic api key on file"}`
    );

    let totalFiles = 0;

    const apiKey = tryApiKey.apiKey ?? this.apiKey;
    // Preserve existing lastAccessedAt data before clearing
    const existingAccessData = new Map<string, Date>();

    for (const [id, record] of this.fileRegistry) {
      if (record.lastAccessedAt) {
        existingAccessData.set(id, record.lastAccessedAt);
      }
    }

    this.assetCache.clear();

    const dbResId = new Map<string, string>();
    try {
      const providerAssets = await this.prisma.findManyByProvider(
        "ANTHROPIC",
        userId
      );

      // Populate asset cache with active database mappings
      for (const asset of providerAssets) {
        if (asset.providerRef && !asset.isExpired) {
          const cacheKey = `${asset.keyFingerprint}:${asset.attachmentId}`;

          // Only add to cache if file exists in registry (authoritative source)
          if (asset.isExpired === false) {
            dbResId.set(asset.providerRef, asset.id);
            this.assetCache.set(cacheKey, {
              fileId: asset.providerRef,
              dbRecordId: asset.id,
              lastCheckedAt: asset.lastCheckedAt
            });

            // Update registry with DB record ID for cross-reference
            const registryEntry = this.fileRegistry.get(asset.providerRef);
            if (registryEntry) {
              registryEntry.dbRecordId = asset.id;
              this.fileRegistry.set(asset.providerRef, registryEntry);
            }
          } else {
            console.warn(
              {
                providerRef: asset.providerRef,
                attachmentId: asset.attachmentId
              },
              "DB asset not found in Anthropic registry, skipping cache entry"
            );
          }
        }
      }

      console.info(
        `Populated asset cache with ${this.assetCache.size} entries from database`
      );
    } catch (error) {
      console.error({ error }, "Failed to populate asset cache from database");
    }

    // Clear and rebuild registry
    this.fileRegistry.clear();
    const arrToDelete = Array.of<AnthropicFileRecord>();
    for await (const batch of this.getAllAnthropicFiles(apiKey)) {
      for (const file of batch.data) {
        if (dbResId.has(file.id)) {
          const dbId = dbResId.get(file.id);
          if (dbId) {
            this.fileRegistry.set(file.id, {
              id: file.id,
              size_bytes: file.size_bytes,
              created_at: file.created_at,
              filename: file.filename,
              mime_type: file.mime_type,
              dbRecordId: dbId,
              // Restore existing lastAccessedAt if available
              lastAccessedAt: existingAccessData.get(file.id)
            });
          }
        } else {
          const fourWeeks = 28 * 24 * 60 * 60 * 1000;
          const createdAtVsNow =
            Date.now() - new Date(file.created_at).getMilliseconds();
          if (createdAtVsNow > fourWeeks) {
            arrToDelete.push({
              id: file.id,
              size_bytes: file.size_bytes,
              created_at: file.created_at,
              filename: file.filename,
              mime_type: file.mime_type,
              dbRecordId: undefined,
              lastAccessedAt: undefined
            } satisfies AnthropicFileRecord);
          }
        }
      }

      totalFiles = batch.count;
      console.info(`Synced ${batch.count} files, has_more: ${batch.has_more}`);
    }

    this.lastRegistrySync = new Date();

    console.info(`File registry sync complete: ${totalFiles} files indexed`);

    // Optionally trigger cleanup of stale files
    if (cleanupStaleFiles) {
      await this.cleanupStaleFiles(apiKey, 14, arrToDelete);
    }

    return { synced: true, totalFiles, lastSync: this.lastRegistrySync };
  }

  private async markFileAccessed(
    fileId: string,
    dbRecordId: string,
    cacheKey: string
  ) {
    const record = this.fileRegistry.get(fileId);

    let lastCheckedAt: Date | null;

    if (this.assetCache.has(cacheKey)) {
      const { lastCheckedAt: lastCheckedDb } =
        await this.prisma.markProviderLastCheckedAt(dbRecordId, "ANTHROPIC");
      lastCheckedAt = lastCheckedDb;
    } else {
      lastCheckedAt = new Date(Date.now());
    }

    if (record && lastCheckedAt) {
      record.lastAccessedAt = lastCheckedAt;
      this.fileRegistry.set(fileId, record);

      const assetCacheRecord = this.assetCache.get(cacheKey);
      if (assetCacheRecord) {
        assetCacheRecord.lastCheckedAt = lastCheckedAt;
        this.assetCache.set(cacheKey, assetCacheRecord);
      }
    }
  }

  // Clean up files not accessed in the specified period
  private async cleanupStaleFiles(
    apiKey?: string,
    staleThresholdDays = 14,
    providerFiles: AnthropicFileRecord[] = []
  ) {
    const client = this.getClient(apiKey);

    const staleThreshold = new Date(
      Date.now() - staleThresholdDays * 24 * 60 * 60 * 1000
    );
    const filesToDelete: string[] = [];
    const dbRecordsToDelete: string[] = [];
    const fileRegistryTuple = Array.from(this.fileRegistry.entries());

    for (const [fileId, record] of fileRegistryTuple) {
      // If never accessed, use created_at as baseline
      const lastUsed = record.lastAccessedAt ?? new Date(record.created_at);

      if (lastUsed < staleThreshold) {
        filesToDelete.push(fileId);
        // Collect database record IDs if available
        if (record.dbRecordId) {
          dbRecordsToDelete.push(record.dbRecordId);
        }
      }
    }

    if (filesToDelete.length === 0) {
      this.logger.info("No stale files to clean up");
      return;
    }

    this.logger.debug(
      filesToDelete,
      `Cleaning up ${filesToDelete.length} stale files`
    );

    // Delete from database first (in transaction)
    if (dbRecordsToDelete.length > 0) {
      try {
        await this.prisma.deleteStaleIds(dbRecordsToDelete);
        this.logger.debug(
          dbRecordsToDelete,
          `Deleted ${dbRecordsToDelete.length} stale database records`
        );
      } catch (error) {
        this.logger.warn({ error }, "Failed to delete stale database records");
      }
    }

    // Then delete from Anthropic Files API
    for (const fileId of filesToDelete) {
      try {
        const d = await client.beta.files.delete(fileId, {
          betas: ["files-api-2025-04-14"]
        });

        // Remove from registry and cache

        this.fileRegistry.delete(d.id);

        // Also remove from assetCache if present
        for (const [key, value] of this.assetCache) {
          if (value.fileId === d.id) {
            this.assetCache.delete(key);
          }
        }

        this.logger.debug(`Deleted stale file from Anthropic: ${fileId}`);
      } catch (error) {
        this.logger.warn(
          { error, fileId },
          `Failed to delete stale file ${fileId} from Anthropic`
        );
      }
    }

    if (providerFiles.length > 0) {
      try {
        for (const file of providerFiles) {
          const deletion = await client.beta.files.delete(file.id, {
            betas: ["files-api-2025-04-14"]
          });
          const logIt = `id: ${deletion.id}, action: ${deletion.type}`;
          console.info(logIt);
        }
      } catch (error) {
        console.error(this.prisma.safeErrMsg(error));
      }
    }

    this.logger.debug(
      {},
      `Cleanup complete: ${filesToDelete.length} files removed`
    );
  }

  private async uploadFileToAnthropic(
    attachment: AttachmentSingleton<true>,
    model: AnthropicModelIdUnion,
    apiKey?: string
  ) {
    const client = this.getClient(apiKey);
    const { absTmpPath, tmpUniquename } = await this.prisma.fetchRemoteToTmp(
      "ANTHROPIC",
      attachment
    );
    try {
      return await client.beta.files.upload({
        file: createReadStream(absTmpPath),
        betas: this.handleBetaHeaders(model)
      } satisfies Anthropic.Beta.FileUploadParams);
    } finally {
      this.prisma.cleanupTmpPostupload("ANTHROPIC", absTmpPath, tmpUniquename);
    }
  }

  private async ensureAnthropicAssetUploaded(
    attachment: AttachmentSingleton<true>,
    model: AnthropicModelIdUnion,
    keyFingerprint: string,
    keyId?: string,
    apiKey?: string
  ) {
    const cacheKey = `${keyFingerprint}:${attachment.id}`;

    // Check in-memory cache AND verify file exists in authoritative registry
    const cached = this.assetCache.get(cacheKey);
    if (cached?.fileId && cached?.dbRecordId) {
      // Verify the file still exists in the authoritative registry
      const registryEntry = this.fileRegistry.get(cached.fileId);
      if (registryEntry) {
        this.logger.debug(
          {
            dbRecordId: cached.dbRecordId,
            fileId: cached.fileId,
            registrySize: registryEntry.size_bytes
          },
          `Reusing cached & verified Anthropic file: ${attachment.id}`
        );
        // Mark as accessed for cleanup tracking
        void this.markFileAccessed(cached.fileId, cached.dbRecordId, cacheKey);
        return cached.fileId;
      } else {
        // File not in registry, clear from cache as it may have been deleted
        this.logger.warn(
          { fileId: cached.fileId },
          "Cached file not found in registry, clearing cache entry"
        );
        this.assetCache.delete(cacheKey);
      }
    }

    // Check database for existing asset and verify against registry
    const existing = await this.prisma.findActiveAnthropicAsset(
      attachment.id,
      keyFingerprint
    );

    if (existing?.providerRef && existing?.id) {
      // Verify the file exists in the authoritative registry
      const registryEntry = this.fileRegistry.get(existing.providerRef);
      if (registryEntry) {
        this.logger.debug(
          {
            providerRef: existing.providerRef,
            registryFilename: registryEntry.filename
          },
          `Reusing DB file verified in registry: ${attachment.id}`
        );
        this.assetCache.set(cacheKey, {
          fileId: existing.providerRef,
          dbRecordId: existing.id,
          lastCheckedAt: existing.lastCheckedAt
        });
        // Mark as accessed for cleanup tracking
        void this.markFileAccessed(existing.providerRef, existing.id, cacheKey);
        return existing.providerRef;
      } else {
        // File exists in DB but not in registry - it may have been deleted
        this.logger.warn(
          { providerRef: existing.providerRef },
          "DB file not found in registry, will re-upload"
        );
      }
    }

    // Upload file and store in DB with proper error handling
    try {
      const uploadedFile = await this.uploadFileToAnthropic(
        attachment,
        model,
        apiKey
      );

      // Create the mapping and store in DB
      const dbRecord = await this.prisma.upsertAnthropicAssetMapping(
        attachment.id,
        keyFingerprint,
        uploadedFile.mime_type,
        uploadedFile.id,
        keyId,
        BigInt(uploadedFile.size_bytes),
        uploadedFile.created_at
      );

      // Update cache with database record ID for fast lookups
      this.assetCache.set(cacheKey, {
        fileId: uploadedFile.id,
        dbRecordId: dbRecord.id,
        lastCheckedAt: dbRecord.lastCheckedAt // Store the actual DB record ID for fast array searches
      });

      // Add to registry with current access time
      this.fileRegistry.set(uploadedFile.id, {
        id: uploadedFile.id,
        size_bytes: uploadedFile.size_bytes,
        created_at: uploadedFile.created_at,
        filename: uploadedFile.filename,
        mime_type: uploadedFile.mime_type,
        lastAccessedAt: new Date(Date.now()),
        dbRecordId: dbRecord.id
      });

      this.logger.info(
        { dbRecordId: dbRecord.id, fileId: uploadedFile.id },
        `Uploaded to Anthropic Files API: ${uploadedFile.filename}`
      );

      return uploadedFile.id;
    } catch (error) {
      this.logger.error(
        { error, attachmentId: attachment.id },
        "Failed to upload file to Anthropic Files API"
      );
      throw new Error(this.prisma.safeErrMsg(error));
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
    const pdfBudget = this.allocatePdfBudget(msgs);
    if (!isNewChat) {
      const messages = await Promise.all(
        msgs.map(async msg => {
          if (msg.senderType === "USER") {
            let i = 0;

            const content = Array.of<Anthropic.Beta.BetaContentBlockParam>();
            try {
              if (msg.attachments && msg.attachments.length > 0) {
                for (const attachment of msg.attachments) {
                  const {
                    cdnUrl,
                    mime: ogMime,
                    compatStatus,
                    compatCdnUrl,
                    compatMime
                  } = attachment;
                  const url = compatStatus === "ACTIVE" ? compatCdnUrl : cdnUrl;
                  const mime = compatStatus === "ACTIVE" ? compatMime : ogMime;

                  if (url && mime) {
                    if (
                      attachment.assetType === "DOCUMENT" &&
                      mime === "application/pdf"
                    ) {
                      const budget = pdfBudget.get(attachment.id);
                      if (budget?.included) {
                        try {
                          const fileId =
                            await this.ensureAnthropicAssetUploaded(
                              attachment,
                              model,
                              keyFingerprint,
                              msg.userKeyId ?? undefined,
                              apiKey
                            );
                          // anthropic allows for a max of 4 blocks to have a cache_control header set else the request errors
                          if (i < 4) {
                            i++;
                            const docBlock = {
                              type: "document",
                              source: { file_id: fileId, type: "file" },
                              citations: { enabled: true },
                              cache_control: { type: "ephemeral", ttl: "1h" }
                            } as const satisfies Anthropic.Beta.BetaRequestDocumentBlock;
                            content.push(docBlock);
                          }
                          const docBlock = {
                            type: "document",
                            citations: { enabled: true },
                            source: { file_id: fileId, type: "file" }
                          } as const satisfies Anthropic.Beta.BetaRequestDocumentBlock;
                          content.push(docBlock);
                        } catch {
                          if (budget)
                            content.push(this.createPdfReferenceBlock(budget));
                        }
                      } else if (budget) {
                        content.push(this.createPdfReferenceBlock(budget));
                      }
                    } else if (mime === "text/plain") {
                      try {
                        const fileId = await this.ensureAnthropicAssetUploaded(
                          attachment,
                          model,
                          keyFingerprint,
                          msg.userKeyId ?? undefined,
                          apiKey
                        );
                        content.push({
                          type: "document",
                          source: { file_id: fileId, type: "file" },
                          citations: { enabled: true }
                        });
                      } catch {
                        content.push({
                          type: "document",
                          citations: { enabled: true },
                          source: { type: "url", url }
                        });
                      }
                    } else if (attachment.assetType === "IMAGE") {
                      // Use Files API for images >= 1MB for better performance
                      const size = attachment.size;
                      const sizeInMB = size ? size / 1024 / 1024 : 0;

                      if (sizeInMB >= 1) {
                        try {
                          const fileId =
                            await this.ensureAnthropicAssetUploaded(
                              attachment,
                              model,
                              keyFingerprint,
                              msg.userKeyId ?? undefined,
                              apiKey
                            );
                          // Images uploaded to Files API use file_id source
                          const imageBlock = {
                            type: "image",
                            source: {
                              type: "file",
                              file_id: fileId
                            }
                          } as const satisfies Anthropic.Beta.BetaImageBlockParam;
                          content.push(imageBlock);
                        } catch (err) {
                          this.logger.warn(
                            { err, size: sizeInMB },
                            "Failed to upload large user image to Files API, falling back to URL"
                          );
                          // Fallback to URL
                          const imageBlock = {
                            type: "image",
                            source: {
                              type: "url",
                              url
                            }
                          } as const satisfies Anthropic.Beta.BetaImageBlockParam;
                          content.push(imageBlock);
                        }
                      } else {
                        // Smaller images use URLs for faster processing
                        const imageBlock = {
                          type: "image",
                          source: {
                            type: "url",
                            url
                          }
                        } as const satisfies Anthropic.Beta.BetaImageBlockParam;
                        content.push(imageBlock);
                      }
                    }
                  }
                }
              }
            } catch (err) {
              this.logger.warn({ err }, "error in anthropic history workup");
            } finally {
              content.push({
                type: "text",
                text: msg.content
              } as const);
            }

            return {
              role: "user",
              content: content.length > 0 ? content : msg.content
            } as const satisfies Anthropic.Beta.BetaMessageParam;
          } else {
            const content = Array.of<Anthropic.Beta.BetaContentBlockParam>();

            try {
              if (msg.attachments && msg.attachments.length > 0) {
                for (const attachment of msg.attachments) {
                  const {
                    cdnUrl,
                    mime: ogMime,
                    compatStatus,
                    assetType,
                    compatCdnUrl,
                    compatMime
                  } = attachment;
                  const url = compatStatus === "ACTIVE" ? compatCdnUrl : cdnUrl;
                  const mime = compatStatus === "ACTIVE" ? compatMime : ogMime;
                  const size = attachment.size;

                  if (url && mime && size) {
                    if (
                      assetType === "DOCUMENT" &&
                      mime === "application/pdf"
                    ) {
                      const budget = pdfBudget.get(attachment.id);
                      if (budget?.included) {
                        try {
                          const fileId =
                            await this.ensureAnthropicAssetUploaded(
                              attachment,
                              model,
                              keyFingerprint,
                              msg?.userKeyId ?? undefined,
                              apiKey
                            );

                          const docBlock = {
                            type: "document",
                            source: { file_id: fileId, type: "file" },
                            citations: { enabled: true }
                          } as const satisfies Anthropic.Beta.BetaRequestDocumentBlock;
                          content.push(docBlock);
                        } catch {
                          if (budget)
                            content.push(this.createPdfReferenceBlock(budget));
                        }
                      } else if (budget) {
                        content.push(this.createPdfReferenceBlock(budget));
                      }
                    } else if (
                      assetType === "IMAGE" &&
                      mime.startsWith("image/")
                    ) {
                      // Smaller images use URLs for faster processing
                      const imageBlock = {
                        type: "text",
                        text: `\n\n![${attachment.filename}](${url})\n\n`
                      } as const satisfies Anthropic.Beta.BetaContentBlockParam;
                      content.push(imageBlock);
                    } else if (mime.includes("application")) {
                      // Other docs use URLs
                      const docBlock = {
                        type: "document",
                        citations: { enabled: true },
                        source: {
                          type: "url",
                          url
                        }
                      } as const satisfies Anthropic.Beta.BetaContentBlockParam;
                      content.push(docBlock);
                    }
                  }
                }
              }
            } catch (err) {
              this.logger.warn(
                { err },
                "error processing AI attachments in history"
              );
            } finally {
              // Always add the text content with model tags
              const textContent = `<model provider="${msg.provider.toLowerCase()}" name="${msg.model}">\n${msg.content}\n</model>`;
              content.push({
                type: "text",
                text: textContent
              } as const satisfies Anthropic.Beta.BetaTextBlockParam);
            }

            return {
              role: "assistant",
              content:
                content.length > 0
                  ? content
                  : `<model provider="${msg.provider.toLowerCase()}" name="${msg.model}">\n${msg.content}\n</model>`
            } as const satisfies Anthropic.Beta.BetaMessageParam;
          }
        })
      );

      const enhancedSystemPrompt = systemPrompt
        ? `${systemPrompt}\n\nNote: Previous responses may be tagged with their source model for context.`
        : "Previous responses in this conversation may be tagged with their source model for context.";

      return {
        messages,
        system: [
          {
            type: "text",
            text: enhancedSystemPrompt
          }
        ] as const satisfies Anthropic.Beta.BetaTextBlockParam[]
      };
    } else {
      // new chat means only one message exists period -> the first user message
      const userMsg = msgs[0];
      const content = Array.of<Anthropic.Beta.BetaContentBlockParam>();

      if (userMsg) {
        try {
          if (userMsg.attachments && userMsg.attachments.length > 0) {
            let i = 0;
            for (const attachment of userMsg.attachments) {
              const {
                cdnUrl,
                mime: ogMime,
                compatCdnUrl,
                compatMime
              } = attachment;
              const url = compatCdnUrl ?? cdnUrl;
              const mime = compatMime ?? ogMime;

              if (url && mime) {
                // Use Files API for PDFs only
                if (mime === "application/pdf" || mime === "text/plain") {
                  try {
                    const fileId = await this.ensureAnthropicAssetUploaded(
                      attachment,
                      model,
                      keyFingerprint,
                      keyId,
                      apiKey
                    );
                    // anthropic allows for a max of 4 blocks to have a cache_control header set else the request errors
                    if (i < 4) {
                      i++;
                      const docBlock = {
                        type: "document",
                        source: {
                          type: "file",
                          file_id: fileId
                        },
                        cache_control: { type: "ephemeral", ttl: "1h" }
                      } as const satisfies Anthropic.Beta.BetaRequestDocumentBlock;
                      content.push(docBlock);
                    }
                    const docBlock = {
                      type: "document",
                      source: {
                        type: "file",
                        file_id: fileId
                      }
                    } as const satisfies Anthropic.Beta.BetaRequestDocumentBlock;
                    content.push(docBlock);
                  } catch (err) {
                    this.logger.warn(
                      { err },
                      "Failed to upload PDF to Files API, falling back to URL"
                    );
                    // Fallback to URL
                    const docBlock = {
                      type: "document",
                      citations: { enabled: true },
                      source: {
                        type: "url",
                        url
                      }
                    } as const satisfies Anthropic.Beta.BetaContentBlockParam;
                    content.push(docBlock);
                  }
                } else if (mime.startsWith("image/")) {
                  // Images use URLs
                  const imageBlock = {
                    type: "image",
                    source: {
                      type: "url",
                      url
                    }
                  } as const satisfies Anthropic.Beta.BetaContentBlockParam;
                  content.push(imageBlock);
                } else if (mime.includes("application")) {
                  // Other docs use URLs
                  const docBlock = {
                    type: "document",
                    source: {
                      type: "url",
                      url
                    }
                  } as const satisfies Anthropic.Beta.BetaContentBlockParam;
                  content.push(docBlock);
                }
              }
            }
          }
        } catch (err) {
          this.logger.warn(
            { err },
            "error in new chat anthropic history workup"
          );
        } finally {
          content.push({
            type: "text",
            text: userMsg.content
          } as const satisfies Anthropic.Beta.BetaTextBlockParam);
        }
      }

      // never pass the already database persisted user prompt
      const messages = [
        {
          role: "user",
          content: content.length >= 1 ? content : "no user message found"
        }
      ] as const satisfies Anthropic.Beta.BetaMessageParam[];

      if (systemPrompt) {
        return {
          messages,
          system: [
            {
              type: "text",
              text: systemPrompt
            }
          ] as const satisfies Anthropic.Beta.BetaTextBlockParam[]
        };
      } else {
        return {
          messages,
          system: undefined
        };
      }
    }
  }
}

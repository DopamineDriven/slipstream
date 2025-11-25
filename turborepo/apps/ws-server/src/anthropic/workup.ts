import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type {
  AnthropicFileRecord,
  ProviderAnthropicChatRequestEntity
} from "@/anthropic/types.ts";
import type { Logger as PinoLogger } from "pino";
import { ExtractService } from "@/extract/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { Anthropic, toFile } from "@anthropic-ai/sdk";
import type {
  AnthropicModelIdUnion,
  AttachmentSingleton,
  MessageSingleton
} from "@slipstream/types";

export class AnthropicWorkup {
  protected defaultClient: Anthropic;
  protected logger: PinoLogger;
  protected extractor: ExtractService;
  private assetCache = new Map<
    string,
    { fileId: string; dbRecordId: string; lastCheckedAt: Date | null }
  >();
  // Registry of all Anthropic files with access tracking
  private fileRegistry = new Map<string, AnthropicFileRecord>();
  private lastRegistrySync: Date | null = null;
  constructor(
    logger: LoggerService,
    extractor: ExtractService,
    protected prisma: PrismaService,
    protected apiKey: string
  ) {
    this.extractor = extractor;
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

  protected handleBetaHeaders(model: AnthropicModelIdUnion) {
    switch (model) {
      // effort parameter is only supported by claude-opus-4.5
      case "claude-opus-4-20250514": {
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
      case "claude-3-5-haiku-20241022":
      case "claude-3-haiku-20240307":
      case "claude-opus-4-5-20251101":
      case "claude-3-7-sonnet-20250219":
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
      "claude-3-7-sonnet-20250219": 64000
    } as const satisfies Record<
      AnthropicModelIdUnion,
      4096 | 8192 | 32000 | 64000
    >;
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

  public async syncFileRegistry(userId: string, cleanupStaleFiles = false) {
    const hasAnthropicMessages = await this.prisma.hasProviderMessages(
      userId,
      "ANTHROPIC"
    );
    if (!hasAnthropicMessages)
      return { synced: true, totalFiles: 0, lastSync: new Date() };
    const tryApiKey = await this.prisma.handleApiKeyLookup("anthropic", userId);

    this.logger.info(
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
            this.logger.warn(
              {
                providerRef: asset.providerRef,
                attachmentId: asset.attachmentId
              },
              "DB asset not found in Anthropic registry, skipping cache entry"
            );
          }
        }
      }

      this.logger.info(
        `Populated asset cache with ${this.assetCache.size} entries from database`
      );
    } catch (error) {
      this.logger.error(
        { error },
        "Failed to populate asset cache from database"
      );
    }

    // Clear and rebuild registry
    this.fileRegistry.clear();

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
        }
      }

      totalFiles = batch.count;
      this.logger.debug(
        `Synced ${batch.count} files, has_more: ${batch.has_more}`
      );
    }

    this.lastRegistrySync = new Date();

    this.logger.info(
      `File registry sync complete: ${totalFiles} files indexed`
    );

    // Optionally trigger cleanup of stale files
    if (cleanupStaleFiles) {
      await this.cleanupStaleFiles(apiKey);
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
  private async cleanupStaleFiles(apiKey?: string, staleThresholdDays = 14) {
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

    this.logger.debug(
      {},
      `Cleanup complete: ${filesToDelete.length} files removed`
    );
  }

  private urlExtWorkup(attachment: AttachmentSingleton<true>) {
    const urlExtRecord = { url: "", ext: "", mime: "" };
    try {
      if (!attachment.compatStatus)
        throw new Error(
          `no compat status provided in attachment record ${attachment.id}`
        );
      if (
        attachment.compatStatus === "ACTIVE" &&
        attachment.compatExt &&
        attachment.compatCdnUrl &&
        attachment.compatMime
      ) {
        urlExtRecord.ext = attachment.compatExt;
        urlExtRecord.mime = attachment.compatMime;
        urlExtRecord.url = attachment.compatCdnUrl;
      }
      if (
        attachment.compatStatus === "ALIASED" &&
        attachment.ext &&
        attachment.mime &&
        attachment.cdnUrl
      ) {
        urlExtRecord.ext = attachment.ext;
        urlExtRecord.mime = attachment.mime;
        urlExtRecord.url = attachment.cdnUrl;
      }
    } catch (err) {
      throw new Error(
        "error in urlExtWorkup".concat(this.prisma.safeErrMsg(err))
      );
    } finally {
      return urlExtRecord;
    }
  }

  private async toTmpWorkup({
    assetType,
    compatStatus,
    conversationId,
    messageId,
    id,
    userId,
    ...rest
  }: AttachmentSingleton<true>) {
    const { ext, mime, url } = this.urlExtWorkup({
      ...rest,
      assetType,
      compatStatus,
      conversationId,
      messageId,
      id,
      userId
    });

    const tmpPrefix = `anthropic-tmp-${userId}-${id}-${(compatStatus ?? "ALIASED").toLowerCase()}`;
    const tmpName = this.extractor.uniqueTmpName(tmpPrefix, ext);
    const urlObj = new URL(url);

    let usefulName: string;
    if (conversationId && messageId) {
      // will always be defined as message and convoId for incoming assets are database derived and incoming user messages are persisted fully so AI SDKs always receive db-synced data
      usefulName = `${conversationId}-${messageId}-${id}-${assetType.toLowerCase()}.${ext}`;
    } else {
      usefulName = urlObj.pathname.replace(/\//gim, "-");
    }
    const safeFilename = usefulName;
    const absTmpPath = resolve(tmpdir(), tmpName);
    return {
      tmpFilenamePrefix: tmpPrefix,
      tmpUniquename: tmpName,
      absTmpPath,
      ext,
      remoteUrl: url,
      safeFilename,
      mime
    };
  }

  private async remoteToTmp(att: AttachmentSingleton<true>) {
    const workup = await this.toTmpWorkup(att);
    if (!workup) throw new Error("workup not defined");
    const {
      absTmpPath,
      ext,
      tmpUniquename,
      tmpFilenamePrefix,
      safeFilename,
      remoteUrl,
      mime
    } = workup;
    await this.extractor.fetchRemoteWriteLocalLargeFiles(
      remoteUrl,
      absTmpPath,
      false
    );
    if (this.extractor.existsTmp(tmpUniquename)) {
      return {
        tmpUniquename,
        absTmpPath,
        ext,
        tmpFilenamePrefix,
        safeFilename,
        mime
      };
    } else {
      throw new Error(
        `no tmp file exists having filename ${tmpUniquename} at absolute path ${absTmpPath}`
      );
    }
  }

  private async uploadFileToAnthropic(
    attachment: AttachmentSingleton<true>,
    model: AnthropicModelIdUnion,
    apiKey?: string
  ) {
    const client = this.getClient(apiKey);
    const { absTmpPath, mime, tmpUniquename } =
      await this.remoteToTmp(attachment);
    try {
      return await client.beta.files.upload({
        file: (await toFile(createReadStream(absTmpPath), undefined, {
          type: mime
        })) satisfies Anthropic.Beta.FileUploadParams["file"],
        betas: this.handleBetaHeaders(model)
      } satisfies Anthropic.Beta.FileUploadParams);
    } finally {
      try {
        if (this.extractor.exists(absTmpPath)) {
          this.extractor.rmFile(absTmpPath);
          console.log(`cleaned up tmp file ${tmpUniquename}`);
        }
      } catch (err) {
        console.warn(
          `cleanup of tmp file ${tmpUniquename} having path ${absTmpPath} failed following Anthropic file upload.`.concat(
            this.prisma.safeErrMsg(err)
          )
        );
      }
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
                            source: { file_id: fileId, type: "file" },
                            cache_control: { type: "ephemeral", ttl: "1h" }
                          } as const satisfies Anthropic.Beta.BetaRequestDocumentBlock;
                          content.push(docBlock);
                        }
                        const docBlock = {
                          type: "document",
                          source: { file_id: fileId, type: "file" }
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
                          source: {
                            type: "url",
                            url
                          }
                        } as const satisfies Anthropic.Beta.BetaRequestDocumentBlock;
                        content.push(docBlock);
                      }
                    } else if (mime.startsWith("image/")) {
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
                              keyId,
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
                    } else if (mime.includes("application")) {
                      // Other docs use URLs
                      const docBlock = {
                        type: "document",
                        source: {
                          type: "url",
                          url
                        }
                      } as const satisfies Anthropic.Beta.BetaRequestDocumentBlock;
                      content.push(docBlock);
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
                      (assetType === "DOCUMENT" &&
                        mime === "application/pdf") ||
                      mime === "text/plain"
                    ) {
                      try {
                        const fileId = await this.ensureAnthropicAssetUploaded(
                          attachment,
                          model,
                          keyFingerprint,
                          keyId,
                          apiKey
                        );

                        const docBlock = {
                          type: "document",
                          source: { file_id: fileId, type: "file" }
                        } as const satisfies Anthropic.Beta.BetaRequestDocumentBlock;
                        content.push(docBlock);
                      } catch (err) {
                        this.logger.warn(
                          { err },
                          "Failed to upload AI-generated PDF to Files API, falling back to URL"
                        );
                        // Fallback to URL
                        const docBlock = {
                          type: "document",
                          source: {
                            type: "url",
                            url
                          }
                        } as const satisfies Anthropic.Beta.BetaRequestDocumentBlock;
                        content.push(docBlock);
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

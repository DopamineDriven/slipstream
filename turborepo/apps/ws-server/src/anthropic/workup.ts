import type {
  AnthropicFileRecord,
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
  protected defaultClient: Anthropic;
  protected logger: PinoLogger;
  private assetCache = new Map<
    string,
    { fileId: string; dbRecordId: string }
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

  protected handleBetaHeaders(model: AnthropicModelIdUnion) {
    switch (model) {
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
      case "claude-3-7-sonnet-20250219":
      case "claude-opus-4-1-20250805":
      case "claude-opus-4-20250514":
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

  protected async syncFileRegistry(apiKey?: string, cleanupStaleFiles = false) {
    this.logger.info("Starting Anthropic file registry sync");
    let totalFiles = 0;

    // Preserve existing lastAccessedAt data before clearing
    const existingAccessData = new Map<string, Date>();
    for (const [id, record] of this.fileRegistry) {
      if (record.lastAccessedAt) {
        existingAccessData.set(id, record.lastAccessedAt);
      }
    }

    // Clear and rebuild registry
    this.fileRegistry.clear();

    for await (const batch of this.getAllAnthropicFiles(apiKey)) {
      for (const file of batch.data) {
        this.fileRegistry.set(file.id, {
          id: file.id,
          size_bytes: file.size_bytes,
          created_at: file.created_at,
          filename: file.filename,
          mime_type: file.mime_type,
          // Restore existing lastAccessedAt if available
          lastAccessedAt: existingAccessData.get(file.id)
        });
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

  private markFileAccessed(fileId: string) {
    const record = this.fileRegistry.get(fileId);
    if (record) {
      record.lastAccessedAt = new Date();
      this.fileRegistry.set(fileId, record);
    }
  }

  // Get registry stats for monitoring
  protected getFileRegistryStats() {
    const MAX_REGISTRY_SIZE_GB = 100; // Anthropic's max registry size
    const MAX_REGISTRY_SIZE_BYTES = MAX_REGISTRY_SIZE_GB * 1024 * 1024 * 1024;

    const totalFiles = this.fileRegistry.size;
    const totalSize = Array.from(this.fileRegistry.values()).reduce(
      (sum, file) => sum + file.size_bytes,
      0
    );

    const usagePercentage = (totalSize / MAX_REGISTRY_SIZE_BYTES) * 100;
    const remainingBytes = MAX_REGISTRY_SIZE_BYTES - totalSize;

    // Check cache/registry alignment
    let orphanedCacheEntries = 0;
    for (const [_, value] of this.assetCache) {
      if (!this.fileRegistry.has(value.fileId)) {
        orphanedCacheEntries++;
      }
    }

    return {
      totalFiles,
      totalSizeBytes: totalSize,
      totalSizeMB: Math.round(totalSize / 1024 / 1024),
      totalSizeGB: (totalSize / 1024 / 1024 / 1024).toFixed(2),
      maxSizeGB: MAX_REGISTRY_SIZE_GB,
      usagePercentage: usagePercentage.toFixed(2),
      remainingGB: (remainingBytes / 1024 / 1024 / 1024).toFixed(2),
      lastSync: this.lastRegistrySync,
      cacheSize: this.assetCache.size,
      orphanedCacheEntries,  // Entries in cache but not in registry
      cacheHealth: orphanedCacheEntries === 0 ? 'healthy' : 'needs_cleanup'
    };
  }

  // Check if a specific file exists in the registry
  protected isFileInRegistry(fileId: string): boolean {
    return this.fileRegistry.has(fileId);
  }

  // Clean up files not accessed in the specified period
  private async cleanupStaleFiles(apiKey?: string, staleThresholdDays = 14) {
    const client = this.getClient(apiKey);
    const staleThreshold = new Date(
      Date.now() - staleThresholdDays * 24 * 60 * 60 * 1000
    );
    const filesToDelete: string[] = [];
    const dbRecordsToDelete: string[] = [];

    for (const [fileId, record] of this.fileRegistry) {
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

    this.logger.info(`Cleaning up ${filesToDelete.length} stale files`);

    // Delete from database first (in transaction)
    if (dbRecordsToDelete.length > 0) {
      try {
        await this.prisma.deleteStaleIds(dbRecordsToDelete);
        this.logger.debug(
          `Deleted ${dbRecordsToDelete.length} stale database records`
        );
      } catch (error) {
        this.logger.warn({ error }, "Failed to delete stale database records");
      }
    }

    // Then delete from Anthropic Files API
    for (const fileId of filesToDelete) {
      try {
        await client.beta.files.delete(fileId, {
          betas: ["files-api-2025-04-14"]
        });

        // Remove from registry and cache
        this.fileRegistry.delete(fileId);

        // Also remove from assetCache if present
        for (const [key, value] of this.assetCache) {
          if (value.fileId === fileId) {
            this.assetCache.delete(key);
          }
        }

        this.logger.debug(`Deleted stale file from Anthropic: ${fileId}`);
      } catch (error) {
        this.logger.warn(
          { error, fileId },
          "Failed to delete stale file from Anthropic"
        );
      }
    }

    this.logger.info(`Cleanup complete: ${filesToDelete.length} files removed`);
  }

  private async uploadFileToAnthropic(
    attachment: AttachmentSingleton<true>,
    model: AnthropicModelIdUnion,
    apiKey?: string
  ) {
    const client = this.getClient(apiKey);
    let url: string | null;
    if (attachment.compatStatus === "ACTIVE") {
      url = attachment.compatCdnUrl ?? attachment.cdnUrl;
    } else {
      url = attachment.cdnUrl ?? attachment.compatCdnUrl;
    }
    if (!url) throw new Error("No CDN URL available for upload");
    // Fetch the file
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }

    // Upload using Anthropic Files API
    const file = await client.beta.files.upload({
      file: response satisfies Anthropic.Beta.FileUploadParams["file"],
      betas: this.handleBetaHeaders(model)
    } satisfies Anthropic.Beta.FileUploadParams);

    return file;
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
        this.markFileAccessed(cached.fileId);
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
          dbRecordId: existing.id
        });
        // Mark as accessed for cleanup tracking
        this.markFileAccessed(existing.providerRef);
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
        dbRecordId: dbRecord.id // Store the actual DB record ID for fast array searches
      });

      // Add to registry with current access time
      this.fileRegistry.set(uploadedFile.id, {
        id: uploadedFile.id,
        size_bytes: uploadedFile.size_bytes,
        created_at: uploadedFile.created_at,
        filename: uploadedFile.filename,
        mime_type: uploadedFile.mime_type,
        lastAccessedAt: new Date(),
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
            const content = Array.of<Anthropic.Beta.BetaContentBlockParam>();
            try {
              // Process attachments
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
                    if (mime === "application/pdf") {
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
                          source: { file_id: fileId, type: "file" },
                          cache_control: { type: "ephemeral", ttl: "1h" }
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
                          },
                          cache_control: { type: "ephemeral", ttl: "1h" }
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
                            },
                            cache_control: { type: "ephemeral", ttl: "1h" }
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
                            },
                            cache_control: { type: "ephemeral", ttl: "1h" }
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
                          },
                          cache_control: { type: "ephemeral", ttl: "1h" }
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
                text: msg.content,
                cache_control: { type: "ephemeral", ttl: "1h" }
              } as const);
            }

            return {
              role: "user",
              content: content.length > 0 ? content : msg.content
            } as const satisfies Anthropic.Beta.BetaMessageParam;
          } else {
            const content = Array.of<Anthropic.Beta.BetaContentBlockParam>();

            try {
              // Process AI-generated attachments (e.g., from image generation)
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
                          source: { file_id: fileId, type: "file" },
                          cache_control: { type: "ephemeral", ttl: "1h" }
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
                          },
                          cache_control: { type: "ephemeral", ttl: "1h" }
                        } as const satisfies Anthropic.Beta.BetaRequestDocumentBlock;
                        content.push(docBlock);
                      }
                    } else if (
                      assetType === "IMAGE" &&
                      mime.startsWith("image/")
                    ) {
                      // Use Files API for images >= 1MB for better performance with large images
                      const sizeInMB = size / 1024 / 1024;
                      if (sizeInMB >= 1) {
                        try {
                          const fileId =
                            await this.ensureAnthropicAssetUploaded(
                              attachment,
                              model as AnthropicModelIdUnion,
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
                            },
                            cache_control: { type: "ephemeral", ttl: "1h" }
                          } as const satisfies Anthropic.Beta.BetaContentBlockParam;
                          content.push(imageBlock);
                        } catch (err) {
                          this.logger.warn(
                            { err, size: sizeInMB },
                            "Failed to upload large AI image to Files API, falling back to URL"
                          );
                          // Fallback to URL
                          const imageBlock = {
                            type: "image",
                            source: {
                              type: "url",
                              url
                            },
                            cache_control: { type: "ephemeral", ttl: "1h" }
                          } as const satisfies Anthropic.Beta.BetaContentBlockParam;
                          content.push(imageBlock);
                        }
                      } else {
                        // Smaller images use URLs for faster processing
                        const imageBlock = {
                          type: "image",
                          source: {
                            type: "url",
                            url
                          },
                          cache_control: { type: "ephemeral", ttl: "1h" }
                        } as const satisfies Anthropic.Beta.BetaContentBlockParam;
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
                text: textContent,
                cache_control: { type: "ephemeral", ttl: "1h" }
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
            text: enhancedSystemPrompt,
            cache_control: { type: "ephemeral", ttl: "1h" }
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
                if (mime === "application/pdf") {
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
                      source: {
                        type: "file",
                        file_id: fileId
                      },
                      cache_control: { type: "ephemeral", ttl: "1h" }
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
            text: userMsg.content,
            cache_control: { type: "ephemeral", ttl: "1h" }
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
              text: systemPrompt,
              cache_control: { type: "ephemeral", ttl: "1h" }
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

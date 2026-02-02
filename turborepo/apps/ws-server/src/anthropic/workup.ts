import { createReadStream } from "node:fs";
import type {
  AnthropicFileRecord,
  MessageInputParams,
  RequestOptions
} from "@/anthropic/types.ts";
import type { Logger as PinoLogger } from "pino";
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

  private handleBetaHeaders(model: AnthropicModelIdUnion) {
    switch (model) {
      // effort parameter is only supported by claude-opus-4.5
      case "claude-opus-4-5-20251101": {
        return [
          "effort-2025-11-24",
          "files-api-2025-04-14",
          "extended-cache-ttl-2025-04-11",
          "web-fetch-2025-09-10",
          "code-execution-2025-08-25"
        ] satisfies Anthropic.Beta.AnthropicBeta[];
      }
      // context window 1m is only supported by claude-sonnet-4 & claude-sonnet-4.5
      case "claude-sonnet-4-5-20250929":
      case "claude-sonnet-4-20250514": {
        return [
          "files-api-2025-04-14",
          "extended-cache-ttl-2025-04-11",
          "context-1m-2025-08-07",
          "web-fetch-2025-09-10",
          "code-execution-2025-08-25"
        ] satisfies Anthropic.Beta.AnthropicBeta[];
      }
      // output context window expansion 64k->128k is only supported by claude-sonnet-3.7
      case "claude-3-7-sonnet-20250219": {
        return [
          "files-api-2025-04-14",
          "extended-cache-ttl-2025-04-11",
          "output-128k-2025-02-19",
          "web-fetch-2025-09-10",
          "code-execution-2025-08-25"
        ] satisfies Anthropic.Beta.AnthropicBeta[];
      }
      case "claude-3-5-haiku-20241022":
      case "claude-opus-4-20250514":
      case "claude-opus-4-1-20250805":
      case "claude-haiku-4-5-20251001": {
        return [
          "files-api-2025-04-14",
          "extended-cache-ttl-2025-04-11",
          "web-fetch-2025-09-10",
          "code-execution-2025-08-25"
        ] satisfies Anthropic.Beta.AnthropicBeta[];
      }
      case "claude-3-haiku-20240307":
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

  private handleMaxTokensAndThinking(
    mod: AnthropicModelIdUnion,
    max_tokens?: number
  ) {
    return {
      thinking: this.handleThinking(mod, max_tokens),
      max_tokens: this.handleMaxTokens(mod, max_tokens)
    };
  }

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

  private tooling(
    m: AnthropicModelIdUnion,
    user_location:
      | Anthropic.Beta.Messages.BetaWebSearchTool20250305.UserLocation
      | null
      | undefined
  ) {
    if (m === "claude-3-haiku-20240307") {
      return [
        this.webSearchTool(user_location)
      ] satisfies Anthropic.Beta.BetaToolUnion[];
    } else {
      return [
        this.webSearchTool(user_location),
        this.webFetchTool(),
        this.codeExecutionTool()
      ] satisfies Anthropic.Beta.BetaToolUnion[];
    }
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
    let url: string | null;
    if (attachment.compatStatus === "ACTIVE") {
      url = attachment.compatCdnUrl ?? attachment.cdnUrl;
    } else {
      url = attachment.cdnUrl ?? attachment.compatCdnUrl;
    }
    if (!url) throw new Error("No CDN URL available for upload");
    // Fetch the file
    const { absTmpPath, tmpUniquename, mime } =
      await this.prisma.fetchRemoteToTmp("ANTHROPIC", attachment);

    try {
      const file = await toFile(createReadStream(absTmpPath), tmpUniquename, {
        type: mime
      });
      return await client.beta.files.upload({
        file,
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
  protected async createStreamWorkup({
    isNewChat,
    msgs,
    userId,
    apiKey,
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

    const tools = this.tooling(model, user_location);

    const betas = this.handleBetaHeaders(model);
    return {
      params: {
        max_tokens: maxTokens,
        stream: true,
        thinking,
        top_p: topP,
        temperature,
        system,
        model,
        tools,
        tool_choice: { type: "auto" },
        metadata: { user_id: userId },
        messages,
        service_tier: "auto",
        betas
      } satisfies Anthropic.Beta.Messages.MessageCreateParamsStreaming,
      options: { stream: true } satisfies RequestOptions
    };
  }
}

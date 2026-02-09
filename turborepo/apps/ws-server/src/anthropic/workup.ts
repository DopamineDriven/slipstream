import { createReadStream } from "node:fs";
import type { AnthropicFileRecord } from "@/anthropic/types.ts";
import type { CreateLocalStoreRT } from "@/prisma/types.ts";
import type { VoyageEmbeddingService } from "@/voyage/index.ts";
import { AnthropicBaseService } from "@/anthropic/base.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { Anthropic, toFile } from "@anthropic-ai/sdk";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  AnthropicModelIdUnion,
  AttachmentSingleton
} from "@slipstream/types";

export class AnthropicWorkup extends AnthropicBaseService {
  /** userId → full store record (parent-level, not large) */
  protected localStoreCache = new Map<string, CreateLocalStoreRT<true>>();
  /** attachmentId → { docId, provenanceId, state } */
  protected docCache = new Map<
    string,
    {
      docId: string;
      provenanceId: string;
      state: $Enums.LocalStoreDocState | null;
    }
  >();
  protected assetCache = new Map<
    string,
    { fileId: string; dbRecordId: string; lastCheckedAt: Date | null }
  >();
  // Registry of all Anthropic files with access tracking
  protected fileRegistry = new Map<string, AnthropicFileRecord>();
  protected lastRegistrySync: Date | null = null;
  constructor(
    logger: LoggerService,
    voyage: VoyageEmbeddingService,
    prisma: PrismaService,
    apiKey: string
  ) {
    super(logger, voyage, prisma, apiKey);
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

  protected async syncLocalStoreDocs(userId: string) {
    try {
      const localStoreDocs = await this.prisma.findManyLocalStoreDocs(
        "ANTHROPIC",
        userId
      );
      if (localStoreDocs.length > 0) {
        for (const localDoc of localStoreDocs) {
          this.docCache.set(localDoc.attachmentId, {
            docId: localDoc.id,
            provenanceId: localDoc.provenanceId,
            state: localDoc.state
          });
        }
      }
    } catch (err) {
      err;
    }
  }

  public async syncFileRegistry(userId: string, cleanupStaleFiles = true) {
    const [hasAnthropicStoredFiles, hasLocalAnthropicStoreDocs] =
      await Promise.all([
        this.prisma.hasProviderMessages(userId, "ANTHROPIC"),
        this.prisma.hasLocalVectorStoreDocs(userId, "ANTHROPIC")
      ]);
    if (!hasAnthropicStoredFiles && !hasLocalAnthropicStoreDocs) {
      return {
        synced: true,
        totalFiles: 0,
        totalDocs: 0,
        lastSync: new Date()
      };
    }

    // anthropic provider hosted files from attachments
    this.fileRegistry.clear();
    this.assetCache.clear();
    // local vector store document store and documents
    this.docCache.clear();
    this.localStoreCache.clear();

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

  protected async markFileAccessed(
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

  protected async ensureAnthropicAssetUploaded(
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
}

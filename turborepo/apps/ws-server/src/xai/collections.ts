import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type {
  CreateCollectionRequest,
  CreateCollectionResponse,
  DeleteXaiFileResponse,
  DocumentResSingleton,
  FieldDefinition,
  GetDocumentsByCollectionId,
  ListCollectionsResponse,
  PythonBuiltIns,
  UploadFileRT
} from "@/xai/types.ts";
import type { Logger } from "pino";
import { ExtractService } from "@/extract/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { python } from "pythonia";
import type { AttachmentSingleton, XOR } from "@slipstream/types";

export class GrokCollectionsService {
  protected logger: Logger;

  /**
   * Asset cache: attachmentId → file metadata
   * Same key as fileRegistry for smooth interop (mirrors Gemini pattern)
   */
  private assetCache = new Map<
    string,
    {
      attachmentId: string;
      fileId: string; // xAI file_id (e.g., file_a4315326-...)
      collectionId: string; // xAI collection_id
      databaseId: string; // AttachmentProvider.id
      storeDbId: string; // ProviderStore.id
      lastAccessedAt: Date | null;
    }
  >();

  /**
   * File registry: attachmentId → full xAI document metadata
   * Same key as assetCache for smooth interop (mirrors Gemini pattern)
   */
  private fileRegistry = new Map<string, DocumentResSingleton>();

  private lastRegistrySync: Date | null = null;

  /**
   * Collection registry: userId → collection_id
   * Avoids repeated collection lookups per user
   */
  private collectionRegistry = new Map<string, string>();

  /**
   * Store DB registry: userId → ProviderStore.id
   * Quick lookup for database store record
   */
  private storeDbRegistry = new Map<string, string>();

  constructor(
    logger: LoggerService,
    protected extract: ExtractService,
    protected prisma: PrismaService,
    protected xaiKey: string,
    protected xaiManagementKey: string
  ) {
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[grok] " }
      );
  }

  private async *getAllGrokFiles(
    collection_id: string,
    limit = 10,
    managementKey?: string
  ) {
    const mgmtKey = managementKey ?? this.xaiManagementKey;
    let has_more = true;
    let count = 0;
    let pagination_token: string | undefined = undefined;
    let page_number = 0;

    while (has_more) {
      const url = pagination_token
        ? `https://management-api.x.ai/v1/collections/${collection_id}/documents?limit=${limit}&pagination_token=${pagination_token}`
        : `https://management-api.x.ai/v1/collections/${collection_id}/documents?limit=${limit}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mgmtKey}`
        }
      });

      const page = await response.json<GetDocumentsByCollectionId>();

      has_more = typeof page.pagination_token !== "undefined";
      pagination_token = page.pagination_token;
      count += page.documents?.length ?? 0;

      yield {
        data: page.documents,
        count,
        page_number,
        has_more
      };

      page_number += 1;
    }
  }

  private async removeFileFromCollection(
    collection_id: string,
    file_id: string,
    managementKey?: string
  ) {
    const mgmtKey = managementKey ?? this.xaiManagementKey;
    return await fetch(
      `https://management-api.x.ai/v1/collections/${collection_id}/documents/${file_id}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mgmtKey}`
        }
      }
    );
  }

  private async deleteFileWorkup(
    ok: boolean,
    file_id: string,
    apiKey?: string
  ) {
    const key = apiKey ?? this.xaiKey;
    if (ok) {
      return await fetch(`https://api.x.ai/v1/files/${file_id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`
        }
      }).then(d => d.json<DeleteXaiFileResponse>());
    } else {
      throw new Error(
        `removeFileFromCollection error: file_id ${file_id} unable to be unlinked from associated collection, delete file operation aborted`
      );
    }
  }

  private async deleteFileFromXAI(
    collection_id: string,
    file_id: string,
    apiKey?: string,
    managementKey?: string
  ) {
    const mgmtKey = managementKey ?? this.xaiManagementKey;
    const key = apiKey ?? this.xaiKey;
    const {
      promise,
      resolve,
      reject: _reject
    } = Promise.withResolvers<Response>();
    resolve(this.removeFileFromCollection(file_id, collection_id, mgmtKey));
    return promise.then(res => this.deleteFileWorkup(res.ok, file_id, key));
  }

  private get createUserCollectionFieldDefs() {
    return [
      {
        key: "conversationId",
        required: true,
        inject_into_chunk: false,
        unique: false,
        description: "Source conversation ID"
      },
      {
        key: "messageId",
        required: true,
        inject_into_chunk: false,
        unique: false,
        description: "Source message ID"
      },
      {
        key: "attachmentId",
        required: true,
        inject_into_chunk: false,
        unique: true, // Prevent duplicate uploads
        description: "Original attachment ID"
      },
      {
        key: "originalFilename",
        required: true,
        inject_into_chunk: true, // Helps with "which document said X?" queries
        unique: false,
        description: "Human-readable source filename"
      }
    ] as const satisfies FieldDefinition[];
  }

  private createUserCollectionWorkup(userId: string) {
    const fieldDefs = this.createUserCollectionFieldDefs;

    return {
      chunk_configuration: {
        inject_name_into_chunks: true,
        strip_whitespace: true,
        tokens_configuration: {
          chunk_overlap_tokens: 200,
          encoding_name: "o200k_base",
          max_chunk_size_tokens: 1024
        }
      },
      collection_name: userId,
      index_configuration: { model_name: "grok-embedding-small" },
      field_definitions: fieldDefs,
      metric_space: "HNSW_METRIC_COSINE"
    } as const satisfies CreateCollectionRequest;
  }

  private async createUserCollection(userId: string, mgmtKey?: string) {
    const managementKey = mgmtKey ?? this.xaiManagementKey;
    const res = await fetch("https://management-api.x.ai/v1/collections", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managementKey}`
      },
      body: JSON.stringify(this.createUserCollectionWorkup(userId))
    });

    const data = await res.json<CreateCollectionResponse>();

    const prismaCreate = await this.prisma.createVectorStoreGrok(
      userId,
      data.collection_id,
      data.collection_name,
      data.created_at,
      data.documents_count
    );

    this.collectionRegistry.set(userId, data.collection_id);

    return prismaCreate;
  }

  private async resolveCollection(userId: string, mgmtKey?: string) {
    const managementKey = mgmtKey ?? this.xaiManagementKey;
    const fetcher = await fetch(
      `https://management-api.x.ai/v1/collections?filter=collection_name:${userId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managementKey}`
        }
      }
    );
    const json = await fetcher.json<ListCollectionsResponse>();
    const index0 = json.collections?.at(0);

    return index0;
  }

  public async syncFileRegistry(
    userId: string,
    cleanupStaleFiles = false,
    apiKey?: string,
    mgmtKey?: string
  ): Promise<
    XOR<
      {
        readonly synced: true;
        readonly totalFiles: 0;
        readonly lastSync: Date;
        readonly collectionExists: false;
        readonly collectionId: undefined;
      },
      {
        readonly synced: true;
        readonly totalFiles: number;
        readonly lastSync: Date;
        readonly collectionExists: true;
        readonly collectionId: string;
      }
    >
  > {
    const key = apiKey ?? this.xaiKey;
    const hasGrokMessages = await this.prisma.hasProviderMessages(
      userId,
      "GROK"
    );
    if (!hasGrokMessages) {
      return {
        synced: true,
        totalFiles: 0,
        lastSync: new Date(),
        collectionExists: false,
        collectionId: undefined
      } as const;
    }

    const managementKey = mgmtKey ?? this.xaiManagementKey;

    console.info(`Starting xAI file registry sync for user ${userId}`);

    // 1. Resolve collection via exact-match filter
    const collection = (await this.resolveCollection(
      userId,
      managementKey
    )) satisfies CreateCollectionResponse | undefined;
    if (typeof collection?.collection_id === "undefined") {
      return {
        synced: true,
        totalFiles: 0,
        lastSync: new Date(),
        collectionExists: false,
        collectionId: undefined
      } as const;
    }
    this.storeDbRegistry.clear();
    const collectionId = collection.collection_id;
    this.collectionRegistry.set(userId, collectionId);

    // 2. Get store DB info
    const storeInfo = await this.prisma.vectorStoreInfoByProvider(
      userId,
      "GROK"
    );
    if (storeInfo.hasStore) {
      this.storeDbRegistry.set(userId, storeInfo.dbId);
    }

    // 3. Load DB mappings into assetCache
    this.assetCache.clear();
    const providerAssets = await this.prisma.findManyByProvider("GROK", userId);
    const dbRecordsToDelete = Array.of<string>();

    if (providerAssets.length > 0) {
      for (const asset of providerAssets) {
        if (asset.providerRef && !asset.isExpired) {
          dbRecordsToDelete.push(asset.attachmentId);
          this.assetCache.set(asset.attachmentId, {
            attachmentId: asset.attachmentId,
            fileId: asset.providerRef,
            collectionId: asset.storeRef ?? collectionId,
            databaseId: asset.id,
            storeDbId: asset.storeId ?? storeInfo.dbId ?? "",
            lastAccessedAt: asset.lastCheckedAt
          });
        }
      }
    }
    console.info(
      `Populated xAI asset cache with ${this.assetCache.size} entries from database`
    );

    // 4. Rebuild fileRegistry from xAI API, filtered by DB attachmentIds
    this.fileRegistry.clear();
    const totalFiles = { count: 0 };

    for await (const batch of this.getAllGrokFiles(
      collectionId,
      10,
      managementKey
    )) {
      if (batch.data.length > 0) {
        for (const doc of batch.data ?? []) {
          const attachmentId = doc.fields?.attachmentId;
          // Only cache files that exist in our database
          if (attachmentId && dbRecordsToDelete.includes(attachmentId)) {
            this.fileRegistry.set(attachmentId, doc);
          }
        }
      }
      totalFiles.count = batch.count;
    }

    this.lastRegistrySync = new Date();
    console.info(
      `xAI file registry sync complete: ${this.fileRegistry.size} files indexed`
    );

    // 5. Reconcile caches (remove stale entries from either cache)
    if (this.fileRegistry.size !== this.assetCache.size) {
      // Remove assetCache entries not in fileRegistry
      for (const key of this.assetCache.keys()) {
        if (!this.fileRegistry.has(key)) {
          this.assetCache.delete(key);
        }
      }
      // Remove fileRegistry entries not in assetCache
      for (const key of this.fileRegistry.keys()) {
        if (!this.assetCache.has(key)) {
          this.fileRegistry.delete(key);
        }
      }
    }

    // 6. Optionally cleanup stale files (14-day access window)
    if (cleanupStaleFiles) {
      await this.cleanupStaleFiles(collectionId, userId, key, managementKey);
    }

    return {
      synced: true,
      totalFiles: this.fileRegistry.size,
      lastSync: this.lastRegistrySync,
      collectionExists: true,
      collectionId
    } as const;
  }

  private async markFileAccessed(
    attachmentId: string,
    dbRecordId: string,
    _fileId: string
  ) {
    try {
      const { lastCheckedAt } = await this.prisma.markProviderLastCheckedAt(
        dbRecordId,
        "GROK"
      );

      const cached = this.assetCache.get(attachmentId);
      if (cached && lastCheckedAt) {
        this.assetCache.set(attachmentId, {
          ...cached,
          lastAccessedAt: lastCheckedAt
        });
      }
    } catch (error) {
      this.logger.warn(
        { error, attachmentId },
        "Failed to mark xAI file as accessed"
      );
    }
  }

  private async cleanupStaleFiles(
    collectionId: string,
    userId: string,
    apiKey?: string,
    mgmntKey?: string
  ) {
    const managementKey = mgmntKey ?? this.xaiManagementKey;
    const key = apiKey ?? this.xaiKey;
    const STALE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
    const now = Date.now();

    const filesToDelete = Array.of<{
      fileId: string;
      attachmentId: string;
      dbId: string;
    }>();

    for (const [attachmentId, cached] of this.assetCache.entries()) {
      const lastAccessed = cached.lastAccessedAt?.getTime() ?? 0;
      if (now - lastAccessed > STALE_THRESHOLD_MS) {
        filesToDelete.push({
          fileId: cached.fileId,
          attachmentId,
          dbId: cached.databaseId
        });
      }
    }

    if (filesToDelete.length === 0) {
      console.info(`No stale xAI files to clean up for user ${userId}`);
      return;
    }

    console.info(
      `Cleaning up ${filesToDelete.length} stale xAI files for user ${userId}`
    );

    // Delete from database first (in transaction)
    const dbIds = filesToDelete.map(f => f.dbId);
    try {
      await this.prisma.deleteStaleIds(dbIds);
      console.info(`Deleted ${dbIds.length} stale xAI database records`);
    } catch (error) {
      this.logger.warn(
        { error },
        "Failed to delete stale xAI database records"
      );
    }

    // Then delete from xAI collections API (unlink from collection, then delete file)
    for (const { fileId, attachmentId } of filesToDelete) {
      try {
        await this.deleteFileFromXAI(collectionId, fileId, key, managementKey);

        // Clear from caches
        this.assetCache.delete(attachmentId);
        this.fileRegistry.delete(attachmentId);

        this.logger.debug({ fileId, attachmentId }, "Deleted stale xAI file");
      } catch (error) {
        this.logger.warn({ error, fileId }, "Failed to delete stale xAI file");
      }
    }

    console.info(
      `xAI cleanup complete: ${filesToDelete.length} files removed for user ${userId}`
    );
  }

  private async getFileByCollectionIdAndName(
    collectionId: string,
    att: AttachmentSingleton<true>,
    managementKey?: string
  ) {
    const mgmtKey = managementKey ?? this.xaiManagementKey;
    const name = this.toXaiFilename(att);
    return await fetch(
      `https://management-api.x.ai/v1/collections/${collectionId}/documents?filter=name:${name}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mgmtKey}`
        }
      }
    ).then(res => res.json<GetDocumentsByCollectionId>());
  }

  /**
   * Ensures an attachment is uploaded to xAI and cached.
   * Uses the same cache key pattern as Gemini (attachmentId).
   *
   * Flow:
   * 1. Check in-memory cache + verify in fileRegistry
   * 2. Resolve/create user's collection
   * 3. Check xAI via exact-match filter (O(1) lookup)
   * 4. If not found, upload via stepwise approach (upload file → promote to collection)
   * 5. Persist to database and update both caches
   */
  protected async ensureXaiAssetUploaded(
    attachment: AttachmentSingleton<true>,
    keyFingerprint: string,
    keyId?: string,
    apiKey?: string,
    mgmtKey?: string
  ) {
    const cacheKey = attachment.id; // Same key for both caches
    const managementKey = mgmtKey ?? this.xaiManagementKey;

    // 1. Check in-memory cache AND verify in fileRegistry
    const cached = this.assetCache.get(cacheKey);
    if (cached?.fileId) {
      const registryEntry = this.fileRegistry.get(cacheKey);
      if (registryEntry && registryEntry.status !== "DOCUMENT_STATUS_FAILED") {
        this.logger.debug(
          { cacheKey, fileId: cached.fileId },
          `Reusing cached & verified xAI file: ${attachment.id}`
        );
        // Mark as accessed in background (don't await)
        void this.markFileAccessed(cacheKey, cached.databaseId, cached.fileId);
        return cached.fileId;
      }
      // Stale cache entry - clear both
      this.assetCache.delete(cacheKey);
      this.fileRegistry.delete(cacheKey);
    }

    // 2. Resolve or create user's collection
    let collectionId = this.collectionRegistry.get(attachment.userId);
    let storeDbId = this.storeDbRegistry.get(attachment.userId);

    if (!collectionId) {
      const collection = await this.resolveCollection(
        attachment.userId,
        managementKey
      );
      if (collection) {
        collectionId = collection.collection_id;
        this.collectionRegistry.set(attachment.userId, collectionId);
        // Also lookup/cache store DB ID
        const storeInfo = await this.prisma.vectorStoreInfoByProvider(
          attachment.userId,
          "GROK"
        );
        if (storeInfo.hasStore) {
          storeDbId = storeInfo.dbId;
          this.storeDbRegistry.set(attachment.userId, storeDbId);
        }
      } else {
        // Create new collection for user
        const createRes = await this.createUserCollection(
          attachment.userId,
          managementKey
        );
        collectionId = createRes.storeRef;
        storeDbId = createRes.id;
        this.storeDbRegistry.set(attachment.userId, storeDbId);
      }
    }

    // 3. Check if document exists via exact-match filter (O(1) lookup)
    const existingDoc = await this.getFileByCollectionIdAndName(
      collectionId,
      attachment,
      managementKey
    );
    const doc = existingDoc.documents.at(0);

    if (existingDoc.documents.length > 0 && doc) {
      // Found! Persist to database and update caches
      const dbRecord = await this.prisma.upsertGrokAssetMapping(
        attachment.userId,
        attachment.id,
        storeDbId ?? "",
        collectionId,
        keyFingerprint,
        doc.file_metadata.content_type,
        doc.file_metadata.file_id,
        // No TTL for xAI, use 14-day window from now for tracking
        new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        keyId,
        BigInt(Number.parseInt(doc.file_metadata.size_bytes)),
        doc.file_metadata.created_at
      );

      this.assetCache.set(cacheKey, {
        attachmentId: cacheKey,
        fileId: doc.file_metadata.file_id,
        collectionId,
        databaseId: dbRecord.id,
        storeDbId: storeDbId ?? "",
        lastAccessedAt: new Date()
      });

      this.fileRegistry.set(cacheKey, doc);

      this.logger.debug(
        { cacheKey, fileId: doc.file_metadata.file_id },
        "Found via exact-match filter, cached"
      );

      return doc.file_metadata.file_id;
    }

    // 4. Not found → upload via stepwise approach
    try {
      const uploadResult = await this.uploadFileAndPromoteToCollection(
        attachment,
        keyFingerprint,
        apiKey,
        managementKey
      );

      if (!uploadResult?.id) {
        throw new Error("Upload failed: no file ID returned");
      }

      // 5. Update caches
      this.assetCache.set(cacheKey, {
        attachmentId: cacheKey,
        fileId: uploadResult.id,
        collectionId,
        databaseId: "", // Populated by upsertGrokAssetMapping in uploadFileAndPromoteToCollection
        storeDbId: storeDbId ?? "",
        lastAccessedAt: new Date()
      });

      // Construct fileRegistry entry from upload result
      this.fileRegistry.set(cacheKey, {
        file_metadata: {
          file_id: uploadResult.id,
          name: this.toXaiFilename(attachment),
          size_bytes: String(uploadResult.bytes),
          content_type:
            attachment.compatStatus === "ACTIVE"
              ? (attachment.compatMime ?? "application/octet-stream")
              : (attachment.mime ?? "application/octet-stream"),
          created_at: String(uploadResult.created_at),
          expires_at: null,
          hash: "",
          upload_status: "UPLOAD_STATUS_COMPLETED",
          processing_status: "DOCUMENT_STATUS_PROCESSING",
          file_path: ""
        },
        fields: {
          conversationId: attachment.conversationId ?? "new-chat",
          messageId: attachment.messageId ?? "new-message",
          attachmentId: attachment.id,
          originalFilename: attachment.filename ?? "content"
        },
        status: "DOCUMENT_STATUS_PROCESSING"
      });

      this.logger.info(
        { cacheKey, fileId: uploadResult.id },
        `Uploaded new file to xAI collection`
      );

      return uploadResult.id;
    } catch (error) {
      this.logger.error(
        { error, attachmentId: attachment.id },
        "Failed to upload file to xAI"
      );
      throw new Error(this.prisma.safeErrMsg(error));
    }
  }

  private urlExtWorkup(attachment: AttachmentSingleton<true>) {
    const urlExtRecord = { url: "", ext: "", mime: "", xaiFilename: "" };
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
        urlExtRecord.xaiFilename = this.toXaiFilename(attachment);
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
        urlExtRecord.xaiFilename = this.toXaiFilename(attachment);
      }
    } catch (err) {
      throw new Error(
        "error in urlExtWorkup ".concat(this.prisma.safeErrMsg(err))
      );
    } finally {
      return urlExtRecord;
    }
  }
  /**
   * all cdnUrls have a final path prefixed with a timestamp (ms), eg:
   *
   * `https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758334065329-IMG_6695.png`
   *
   *  -> `pathname.slice(14)` simply excises the predictably prefixed `1758334065329-` from the filename
   *
   * that said, converted (comapt) attachments lack the timestamp and have the following shape instead:
   *
   * `https://assets.aicoalesce.com/upload/converted/att_wtywhioyfurelljpivpbgdk3.pdf`
   *
   * so we don't slice when `compatStatus === "ACTIVE"`, we just take the top-level pathname as is
   */
  private filenameToHexExtTuple(
    url: string,
    compatStatus: ("FAILED" | "PENDING" | "ACTIVE" | "ALIASED") | null
  ) {
    const urlObj = new URL(url);

    const path = urlObj.pathname;

    const pathname = path.slice(path.lastIndexOf("/") + 1);

    const filename = compatStatus === "ACTIVE" ? pathname : pathname.slice(14);

    const dbFile = filename ?? `file.pdf`;

    const withoutExt = dbFile.slice(0, dbFile.lastIndexOf("."));

    const ext = dbFile.slice(dbFile.lastIndexOf(".") + 1);

    return [Buffer.from(withoutExt, "utf-8").toString("hex"), ext] as const;
  }

  private toXaiFilename(att: AttachmentSingleton<true>) {
    let url: string;
    if (att.compatStatus === "ACTIVE" && att.compatCdnUrl) {
      url = att.compatCdnUrl;
    } else if (att.compatStatus === "ALIASED" && att.cdnUrl) {
      url = att.cdnUrl;
    } else {
      url = "";
    }
    const [filename, ext] = this.filenameToHexExtTuple(url, att.compatStatus);
    if (att.conversationId && att.messageId) {
      return `${att.conversationId}-${att.messageId}-${att.id}-${filename}.${ext}`;
    } else {
      throw new Error(`no conversationId or messageId set for ${att.id}`);
    }
  }

  private async assetToTmpWorkup({
    assetType,
    compatStatus,
    conversationId,
    messageId,
    id,
    userId,
    ...rest
  }: AttachmentSingleton<true>) {
    const { ext, mime, url, xaiFilename } = this.urlExtWorkup({
      ...rest,
      assetType,
      compatStatus,
      conversationId,
      messageId,
      id,
      userId
    });

    const toTmpWorkupObj = {
      absTmpPath: "",
      tmpPrefix: "",
      tmpName: "",
      safeFilename: ""
    };

    toTmpWorkupObj.tmpPrefix = `xai-tmp-${userId}-${id}-${(compatStatus ?? "ALIASED").toLowerCase()}`;

    toTmpWorkupObj.tmpName = this.extract.uniqueTmpName(
      toTmpWorkupObj.tmpPrefix,
      ext
    );

    const urlObj = new URL(url);

    let usefulName: string;

    if (conversationId && messageId) {
      // will always be defined as message and convoId for incoming assets are
      // database derived and incoming user messages are persisted fully so AI SDKs always receive db-synced data
      usefulName = xaiFilename;
    } else {
      usefulName = urlObj.pathname.replace(/\//gim, "-");
    }
    toTmpWorkupObj.safeFilename = usefulName;
    toTmpWorkupObj.absTmpPath = resolve(tmpdir(), toTmpWorkupObj.tmpName);
    return {
      tmpFilenamePrefix: toTmpWorkupObj.tmpPrefix,
      tmpUniquename: toTmpWorkupObj.tmpName,
      absTmpPath: toTmpWorkupObj.absTmpPath,
      ext,
      remoteUrl: url,
      safeFilename: toTmpWorkupObj.safeFilename,
      mime
    };
  }

  private async remoteToTmpWorkup(att: AttachmentSingleton<true>) {
    const {
      absTmpPath,
      ext,
      tmpUniquename,
      tmpFilenamePrefix,
      safeFilename,
      remoteUrl,
      mime: mimeType
    } = await this.assetToTmpWorkup(att);

    await this.extract.fetchRemoteWriteLocalLargeFiles(
      remoteUrl,
      absTmpPath,
      false
    );
    if (this.extract.exists(absTmpPath)) {
      return {
        tmpUniquename,
        absTmpPath,
        ext,
        tmpFilenamePrefix,
        safeFilename,
        mimeType
      };
    } else {
      throw new Error(
        `no tmp file exists having filename ${tmpUniquename} at absolute path ${absTmpPath}`
      );
    }
  }

  private cleanupTmpPostupload(absTmpPath: string, tmpUniquename: string) {
    try {
      if (this.extract.exists(absTmpPath)) {
        this.extract.rmFile(absTmpPath);
        console.log(
          `cleaned up tmp file ${tmpUniquename} following xAI file upload.`
        );
      }
    } catch (err) {
      console.warn(
        `cleanup of tmp file ${tmpUniquename} having path ${absTmpPath} failed following xAI file upload.`.concat(
          this.prisma.safeErrMsg(err)
        )
      );
    }
  }

  private canParseFilename(filename: string) {
    return /^(?:[a-z0-9]+-){3}[a-f0-9]+\.[a-z0-9]+$/.test(filename);
  }

  private parseFilename(filename: string) {
    if (!this.canParseFilename(filename))
      throw new Error(
        "always guard parseFilename with its canParseFilename helper!"
      );

    const [conversationId, messageId, attachmentId, fileNameExt] =
      filename.split("-") as [string, string, string, string];

    const [fileNameHex, extension] = [
      fileNameExt.slice(0, fileNameExt.lastIndexOf(".")),
      fileNameExt.slice(fileNameExt.lastIndexOf(".") + 1)
    ];

    const fileName = Buffer.from(fileNameHex, "hex").toString("utf-8");

    return {
      conversationId,
      messageId,
      attachmentId,
      fileName,
      extension
    };
  }

  private async uploadFile(formData: FormData, apiKey?: string) {
    const key = apiKey ?? this.xaiKey;
    return await fetch("https://api.x.ai/v1/files?purpose=assistants", {
      headers: {
        Authorization: `Bearer ${key}`
      },
      method: "POST",
      body: formData
    });
  }

  private async streamUploadFileWorkup(
    att: AttachmentSingleton<true>,
    apiKey?: string,
    keyId?: string
  ) {
    const key = apiKey ?? this.xaiKey;
    const {
      absTmpPath,
      tmpUniquename,
      mimeType: mime,
      safeFilename
    } = await this.remoteToTmpWorkup(att);
    try {
      const formData = new FormData();

      const arr = Array.of<Buffer>();

      const rs = createReadStream(absTmpPath);

      const iterate = rs.iterator() as NodeJS.AsyncIterator<Buffer>;

      for await (const chunk of iterate) {
        arr.push(chunk);
      }

      const buf = Buffer.concat(arr);

      const file = new File([buf], safeFilename, { type: mime });

      formData.set("file", file, safeFilename);

      const { promise, resolve } = Promise.withResolvers<Response>();

      resolve(this.uploadFile(formData, key));

      return promise.then(res => ({ ...res.json<UploadFileRT>(), keyId }));
    } catch (err) {
      console.error(this.prisma.safeErrMsg(err));
      throw new Error(this.prisma.safeErrMsg(err));
    } finally {
      this.cleanupTmpPostupload(absTmpPath, tmpUniquename);
    }
  }

  private async promoteToCollection(
    documentId: string,
    collectionId: string,
    xaiFilename: string,
    mgmtKey?: string
  ) {
    const key = mgmtKey ?? this.xaiManagementKey;
    const {
      attachmentId,
      conversationId,
      fileName: originalFilename,
      messageId
    } = this.parseFilename(xaiFilename);
    return await fetch(
      `https://management-api.x.ai/v1/collections/${collectionId}/documents/${documentId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          fields: {
            conversationId,
            messageId,
            attachmentId,
            originalFilename
          }
        })
      }
    );
  }

  private async uploadFileAndPromoteToCollection(
    att: AttachmentSingleton<true>,
    keyFingerprint: string,
    apiKey?: string,
    mgmtKey?: string
  ) {
    const managementKey = mgmtKey ?? this.xaiManagementKey;
    const collectionObj = { storeRef: undefined, dbId: "" } as {
      storeRef: string | undefined;
      dbId: string;
    };
    const key = apiKey ?? this.xaiKey;

    const toFilename = this.toXaiFilename(att);

    const res = await this.streamUploadFileWorkup(att, key, keyFingerprint);

    if (!res?.id) throw new Error("no id returned with results");
    collectionObj.storeRef = this.collectionRegistry.get(att.userId);
    if (!collectionObj.storeRef) {
      const collection = await this.resolveCollection(
        att.userId,
        managementKey
      );
      if (collection) {
        this.collectionRegistry.set(att.userId, collection.collection_id);
        collectionObj.storeRef = collection.collection_id;
      } else {
        const createRes = await this.createUserCollection(att.userId, mgmtKey);
        collectionObj.storeRef = createRes.storeRef;
        collectionObj.dbId = createRes.id;
      }
    }

    try {
      const fetcher = await this.promoteToCollection(
        res.id,
        collectionObj.storeRef,
        toFilename,
        managementKey
      );

      if (fetcher.ok) {
        await this.prisma.upsertGrokAssetMapping(
          att.userId,
          att.id,
          collectionObj.dbId,
          collectionObj.storeRef,
          keyFingerprint,
          att.compatStatus === "ACTIVE"
            ? (att.compatMime ?? "application/octet-stream")
            : (att.mime ?? "application/octet-stream"),
          res.id,
          new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          keyFingerprint,
          att.size ? BigInt(att.size) : undefined,
          new Date(res.created_at).toISOString()
        );
      }
    } catch (err) {
      throw new Error(this.prisma.safeErrMsg(err));
    } finally {
      return res;
    }
  }

  private pythonScript(
    xaiCollectionId: string,
    displayFilename: string,
    absTmpPath: string,
    mimeType: string,
    conversationId: string,
    messageId: string,
    attachmentId: string,
    originalFilename: string,
    apiKey?: string,
    mgmtKey?: string
  ) {
    const key = apiKey ?? this.xaiKey;
    const managementKey = mgmtKey ?? this.xaiManagementKey;
    // prettier-ignore
    return  `import asyncio
import os
from xai_sdk import AsyncClient

async def main():
  try:
      client = AsyncClient(
          api_key="${key}",
          management_api_key="${managementKey}"
      )

      file_path = r"${absTmpPath}"

      if not os.path.exists(file_path):
          return {"error": f"File not found at {file_path}"}

      with open(file_path, "rb") as file:
          data = file.read()

      print(f"[Python] Uploading {len(data)} bytes from disk to xAI collection...")

      fields = {
          "conversationId": "${conversationId}",
          "messageId": "${messageId}",
          "attachmentId": "${attachmentId}",
          "originalFilename": "${originalFilename}"
      }

      # Upload document
      result = await client.collections.upload_document(
          collection_id="${xaiCollectionId}",
          name="${displayFilename}",
          data=data,
          content_type="${mimeType}",
          fields=fields
      )

      await client.close()

      # --- SNEK TRANSLATION LAYER ---
      # Node can't read snek's protobuf -- extract protobuf to return readable JSON

      meta = result.file_metadata
      print(f"[Python] upload result {meta}")
      return {
          "file_id": meta.file_id,
          "name": meta.name,
          "size_bytes": meta.size_bytes,
          "content_type": meta.content_type,
          "created_at": meta.created_at.seconds, # Extract raw timestamp
          "hash": meta.hash,
          "created_at_nanos": meta.created_at.nanos,
          "status": result.status
      }
  except Exception as e:
      return {"error": str(e)}
# Run the upload
upload_result = asyncio.run(main())
`;
  }

  /**
   * NOTE DO NOT USE THIS METHOD
   * IT IMPROPERLY INDEXES FILES -- MUST USE THE `uploadFileAndPromoteToCollection` method instead
   */
  private async uploadFileToCollection(
    xaiCollectionId: string,
    att: AttachmentSingleton<true>,
    apiKey?: string
  ) {
    const key = apiKey ?? this.xaiKey;
    const { tmpUniquename, safeFilename, mimeType, absTmpPath } =
      await this.remoteToTmpWorkup(att);

    const file = this.toXaiFilename(att);
    const { fileName } = this.parseFilename(file);

    const uploadScript = this.pythonScript(
      xaiCollectionId,
      safeFilename,
      absTmpPath,
      mimeType,
      att.conversationId ?? "new-chat",
      att.messageId ?? "new-message",
      att.id,
      fileName ?? `content`,
      key
    );

    try {
      const builtins = (await python("builtins")) as PythonBuiltIns;

      const exec_func = await builtins.exec;

      const globals_func = await builtins.globals;

      const global_dict = await globals_func();

      await exec_func(uploadScript, global_dict);

      const doc = await global_dict.upload_result;

      if (!doc) {
        throw new Error("xAI Upload file to collections error (SNEK Bridge)");
      } else {
        return doc;
      }
    } catch (err) {
      console.error(this.prisma.safeErrMsg(err));
      throw err;
    } finally {
      this.cleanupTmpPostupload(absTmpPath, tmpUniquename);
    }
  }
}

import type {
  ContentBlockUnion,
  FileContentBlock,
  ImageContentBlock,
  ResponsesContentInputSingleton,
  ResponsesContentWorkup,
  TextContentBlock,
  ToolChoiceUnion
} from "@/xai/responses-types.ts";
import type {
  CreateCollectionResponse,
  DocumentResSingleton,
  GrokProviderChatRequestEntity
} from "@/xai/types.ts";
import type { Logger } from "pino";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { ResponsesStreamParser } from "@/xai/response-sse.ts";
import { GrokWorkupService } from "@/xai/workup.ts";
import type {
  AttachmentSingleton,
  GrokModelIdUnion,
  MessageSingleton
} from "@slipstream/types";

export class GrokCollectionsService extends GrokWorkupService {
  protected logger: Logger;

  protected readonly baseUrl = "https://api.x.ai/v1/responses";
  protected readonly baseImgGenUrl = "https://api.x.ai/v1/images/generations";

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
    prisma: PrismaService,
    xaiKey: string,
    xaiManagementKey: string
  ) {
    super(prisma, xaiKey, xaiManagementKey);
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[grok] " }
      );
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

    this.storeDbRegistry.set(userId, prismaCreate.id);

    this.collectionRegistry.set(userId, data.collection_id);

    return { dbData: prismaCreate, xaiData: data };
  }

  public async syncFileRegistry(
    userId: string,
    cleanupStaleFiles = false,
    mgmtKey?: string
  ) {
    this.collectionRegistry.clear();
    this.storeDbRegistry.clear();
    this.assetCache.clear();
    this.fileRegistry.clear();

    let key: string;

    const managementKey = mgmtKey ?? this.xaiManagementKey;
    let [collectionData, storeDbData] = await Promise.all([
      this.resolveCollection(userId, managementKey),
      this.prisma.vectorStoreInfoByProvider(userId, "GROK")
    ]);

    // 2. Ensure collection exists (create if needed)
    if (!collectionData) {
      const created = await this.createUserCollection(userId, managementKey);
      collectionData = created.xaiData;
      storeDbData = {
        dbId: created.dbData.id,
        fileCount: created.dbData.fileCount,
        hasStore: true,
        provider: "GROK",
        storeName: created.xaiData.collection_name,
        storeRef: created.xaiData.collection_id
      };
    }

    // 3. Ensure DB store exists (adopt collection if needed)
    if (!storeDbData?.dbId) {
      const dbData = await this.prisma.createVectorStoreGrok(
        userId,
        collectionData.collection_id,
        collectionData.collection_name,
        collectionData.created_at,
        collectionData.documents_count
      );
      storeDbData = {
        dbId: dbData.id,
        fileCount: dbData.fileCount,
        hasStore: true,
        provider: "GROK",
        storeName: collectionData.collection_name,
        storeRef: collectionData.collection_id
      };
      this.storeDbRegistry.set(userId, dbData.id);
      this.collectionRegistry.set(userId, collectionData.collection_id);
    }
    const collectionId = collectionData.collection_id;
    const storeDbId = storeDbData.dbId;

    this.collectionRegistry.set(userId, collectionId);
    this.storeDbRegistry.set(userId, storeDbId);

    const tryApiKey = await this.prisma.handleApiKeyLookup("grok", userId);
    if (tryApiKey.apiKey) {
      key = tryApiKey.apiKey;
    } else {
      key = this.xaiKey;
    }

    console.info(`Starting xAI file registry sync for user ${userId}`);

    // reset in-memory caches/registries on new session init (immediately following connection_established event)

    this.collectionRegistry.set(userId, collectionId);

    // get store DB info
    const storeInfo = storeDbData;

    if (storeInfo.hasStore) {
      this.storeDbRegistry.set(userId, storeInfo.dbId);
    }

    // load DB mappings into assetCache
    const providerAssets = await this.prisma.findManyByProvider("GROK", userId);

    if (providerAssets.length > 0) {
      for (const asset of providerAssets) {
        if (asset.providerRef) {
          this.assetCache.set(asset.attachmentId, {
            attachmentId: asset.attachmentId,
            fileId: asset.providerRef,
            collectionId: collectionId,
            databaseId: asset.id,
            storeDbId: storeDbId,
            lastAccessedAt: asset.lastCheckedAt
          });
        }
      }
    }
    console.info(
      `Populated xAI asset cache with ${this.assetCache.size} entries from database`
    );

    // rebuild fileRegistry from xAI API, filtered by DB attachmentIds
    const totalFiles = { count: 0 };

    for await (const batch of this.getAllGrokFiles(
      collectionId,
      10,
      managementKey
    )) {
      if (batch.data.length > 0) {
        for (const doc of batch.data) {
          const attachmentId = doc.fields?.attachmentId;
          this.fileRegistry.set(attachmentId, doc);
        }
      }
      totalFiles.count = batch.count;
    }

    this.lastRegistrySync = new Date();
    console.info(
      `xAI file registry sync complete: ${this.fileRegistry.size} files indexed`
    );

    // reconcile caches (remove stale entries from either cache)
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

    // optionally cleanup stale files (14-day access window)
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
    keyFingerprint = "server",
    keyId?: string,
    xaiApiKey?: string,
    mgmtKey?: string
  ) {
    const apiKey = xaiApiKey ?? this.xaiKey;
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
        collectionId = createRes.xaiData.collection_id;
        storeDbId = createRes.dbData.id;
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

      // caches are updated in uploadFileAndPromoteToCollection flow

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

  /**
   * TANDEM->
   * STEP ONE + STEP TWO
   */
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

    const res = await this.streamUploadFileWorkup(att, key);
    console.log(res);
    if (!res?.id)
      throw new Error(
        "no id returned with results".concat(JSON.stringify(res, null, 2))
      );
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
        this.collectionRegistry.set(
          att.userId,
          createRes.xaiData.collection_id
        );
        collectionObj.storeRef = createRes.xaiData.collection_id;
        collectionObj.dbId = createRes.dbData.id;
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
        const upsertRes = await this.prisma.upsertGrokAssetMapping(
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
        this.assetCache.set(att.id, {
          attachmentId: att.id,
          fileId: res.id,
          collectionId: collectionObj.storeRef,
          databaseId: upsertRes.id, // Populated by upsertGrokAssetMapping in uploadFileAndPromoteToCollection
          storeDbId: upsertRes.storeId ?? "",
          lastAccessedAt: upsertRes.lastCheckedAt
        });

        // Construct fileRegistry entry from upload result

        const richFileData = await this.getFileByCollectionIdAndName(
          collectionObj.storeRef,
          att,
          managementKey
        );

        const index0 = richFileData.documents.at(0);
        if (index0) {
          this.fileRegistry.set(att.id, index0);
        } else {
          const { url, mime } = this.urlExtWorkup(att);
          const urlObj = new URL(url);

          const path = urlObj.pathname;

          const pathname = path.slice(path.lastIndexOf("/") + 1);

          const filename =
            att.compatStatus === "ACTIVE" ? pathname : pathname.slice(14);

          const dbFile = filename ?? `file.pdf`;
          this.fileRegistry.set(att.id, {
            file_metadata: {
              file_id: res.id,
              name: this.toXaiFilename(att),
              size_bytes: String(res.bytes),
              content_type: mime,
              created_at: new Date(res.created_at).toISOString(),
              expires_at: null,
              hash: "",
              upload_status: "UPLOAD_STATUS_COMPLETED",
              processing_status: "DOCUMENT_STATUS_PROCESSING",
              file_path: ""
            },
            fields: {
              conversationId: att.conversationId ?? "new-chat",
              messageId: att.messageId ?? "new-message",
              attachmentId: att.id,
              originalFilename: dbFile
            },
            status: "DOCUMENT_STATUS_PROCESSING"
          });
        }
      }
    } catch (err) {
      throw new Error(this.prisma.safeErrMsg(err));
    } finally {
      return res;
    }
  }

  protected get hasActiveCollection() {
    return this.collectionRegistry.size > 0;
  }

  protected getUserCollectionId(userId: string) {
    return this.collectionRegistry.get(userId);
  }

  protected async getUserCollectionIdWithFallback(
    userId: string,
    mgmtApiKey?: string
  ) {
    const mgmtKey = mgmtApiKey ?? this.xaiManagementKey;
    try {
      const inMemory = this.collectionRegistry.get(userId);
      if (inMemory) {
        return inMemory;
      } else {
        const collection = await this.resolveCollection(userId, mgmtKey);
        if (collection?.collection_id) {
          if (!this.collectionRegistry.has(userId)) {
            this.collectionRegistry.set(userId, collection.collection_id);
          }
          return collection.collection_id;
        }
      }
    } catch (err) {
      this.logger.info(err);
    }
  }

  protected getProviderStoreDbId(userId: string) {
    return this.storeDbRegistry.get(userId);
  }

  protected hasFileSearchCapability(userId: string) {
    return this.collectionRegistry.has(userId);
  }

  protected async createResponsesStream(
    {
      msgs,
      userId,
      isNewChat,
      keyId,
      apiKey,
      max_tokens,
      temperature,
      topP: top_p,
      model: m,
      systemPrompt,
      management_api_key
    }: GrokProviderChatRequestEntity,
    collectionId?: string,
    tool_choice_input: ToolChoiceUnion = "auto",
    logprobs = false,
    imgDetail?: ImageContentBlock["detail"],
    enableFileSearch = true,
    fileSearchMaxResults = 5,
    enableCodeInterpreter = true,
    enableWebSearch = true,
    enableXSearch = false,
    web_enable_image_understanding = true,
    x_enable_image_understanding = true,
    x_enable_video_understanding = true
  ) {
    const key = apiKey ?? this.xaiKey;

    const mgmtApiKey = management_api_key ?? this.xaiManagementKey;
    const collection_id = this.collectionRegistry.get(userId);
    const cId = collection_id ?? collectionId;
    const {
      input,
      instructions,
      max_output_tokens,
      model,
      parallel_tool_calls,
      tool_choice,
      store,
      stream,
      tools,
      user
    } = await this.getResponsesApiInputWorkup(
      isNewChat,
      (m ?? "grok-4-1-fast-reasoning") as GrokModelIdUnion,
      userId,
      msgs,
      keyId ?? "server",
      systemPrompt,
      max_tokens,
      tool_choice_input,
      imgDetail,
      keyId ?? undefined,
      apiKey,
      mgmtApiKey,
      cId,
      enableFileSearch,
      fileSearchMaxResults,
      enableCodeInterpreter,
      enableWebSearch,
      enableXSearch,
      web_enable_image_understanding,
      x_enable_image_understanding,
      x_enable_video_understanding,
      ["reasoning.encrypted_content"]
    );

    const requestBody = {
      model,
      input,
      store,
      stream,
      instructions,
      temperature,
      user,
      top_p,
      logprobs,
      max_output_tokens,
      tools,
      include: ["reasoning.encrypted_content"],
      tool_choice,
      parallel_tool_calls
    } satisfies ResponsesContentWorkup;

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `xAI Responses API error (${response.status}, ${response.statusText}): ${errorText}`
      );
    }

    return ResponsesStreamParser.createXAIResponsesParser(response);
  }

  protected async formatxAIMsgHistory(
    msgs: MessageSingleton<true>[],
    model: GrokModelIdUnion,
    userId: string,
    imgDetail?: ImageContentBlock["detail"],
    keyFingerprint = "server",
    keyId?: string,
    xaiApiKey?: string,
    xaiMgmntKey?: string
  ) {
    const mgmtKey = xaiMgmntKey ?? this.xaiManagementKey;

    const apiKey = xaiApiKey ?? this.xaiKey;

    const formatted = Array.of<ResponsesContentInputSingleton>();

    const lastIndex = msgs.findLastIndex(
      m => m.provider === "GROK" && m.senderType === "AI"
    );

    const isFirstGrokMsg = lastIndex === -1;
    const content = Array.of<ContentBlockUnion>();
    const textParts = Array.of<string>();
    for (const [msgIndex, msg] of msgs.entries()) {
      const isFreshContext = isFirstGrokMsg || msgIndex > lastIndex;
      const isCurrentUserMsg = msgIndex === msgs.length - 1;
      const collectionId =
        this.getUserCollectionId(userId) ??
        (await this.resolveCollection(userId, mgmtKey))?.collection_id ??
        null;
      if (msg.senderType === "USER") {
        try {
          if (
            msg.attachments &&
            msg.attachments.length > 0 &&
            (this.canViewDocs(model) || this.canViewImgs(model))
          ) {
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
                const [filename, ext] = this.filenameToHexExtTuple(
                  url,
                  attachment.compatStatus,
                  false
                );

                const name = `${filename}.${ext}`;

                if (
                  attachment.assetType === "DOCUMENT" &&
                  this.canViewDocs(model)
                ) {
                  try {
                    if (isFreshContext) {
                      try {
                        const fileId = await this.ensureXaiAssetUploaded(
                          attachment,
                          keyFingerprint,
                          keyId,
                          apiKey,
                          mgmtKey
                        );
                        if (!isCurrentUserMsg) {
                          if (collectionId) {
                            textParts.push(
                              `[${name}](collections://${collectionId}/files/${fileId})`
                            );
                          }
                        } else {
                          const docBlock = {
                            type: "input_file",
                            file_id: fileId
                          } satisfies FileContentBlock;
                          content.push(docBlock);
                        }
                      } catch {
                        const cached = this.assetCache.get(attachment.id);

                        if (cached?.collectionId) {
                          textParts.push(
                            `[${name}](collections://${cached.collectionId}/files/${cached.fileId})`
                          );
                        } else {
                          this.logger.info({
                            fresh_context_attachment_error_xai: `Fresh doc upload for userId ${userId} attachment ${attachment.id} of url ${url} failed`
                          });
                        }
                      }
                    } else {
                      const cached = this.assetCache.get(attachment.id);
                      if (cached && collectionId) {
                        textParts.push(
                          `[${name}](collections://${collectionId}/files/${cached.fileId})`
                        );
                      } else if (collectionId) {
                        // Not in cache - ensure it's uploaded for future reference
                        try {
                          const fileId = await this.ensureXaiAssetUploaded(
                            attachment,
                            keyFingerprint,
                            keyId,
                            apiKey,
                            mgmtKey
                          );

                          textParts.push(
                            `[${name}](collections://${collectionId}/files/${fileId})`
                          );
                        } catch {
                          // silent fail for already processed context, not critical
                        }
                      }
                    }
                  } catch (err) {
                    this.logger.warn(
                      { err: this.prisma.safeErrMsg(err) },
                      `Failed to upload PDF to Collections/Files API of collectionId ${collectionId}.`
                    );
                  }
                } else if (
                  attachment.assetType === "IMAGE" &&
                  this.canViewImgs(model)
                ) {
                  if (isFreshContext && isCurrentUserMsg) {
                    const imgBlock = {
                      type: "input_image",
                      image_url: url,
                      detail: imgDetail ?? "auto"
                    } satisfies ImageContentBlock;
                    content.push(imgBlock);
                  } else {
                    textParts.push(`![${name}](${url})`);
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error(this.prisma.safeErrMsg(err));
        } finally {
          textParts.push(msg.content);
        }
        content.push({
          type: "input_text",
          text: textParts.join("\n\n")
        } satisfies TextContentBlock);
        formatted.push({
          role: "user",
          content: content
        } as const satisfies ResponsesContentInputSingleton);
      } else {
        const modelIdentifier = `[${msg.provider.toLowerCase()}/${msg.model ?? "model"}]`;
        try {
          if (msg.attachments && msg.attachments.length > 0) {
            for (const att of msg.attachments) {
              const {
                cdnUrl,
                mime: ogMime,
                compatStatus,
                assetType,
                compatCdnUrl,
                compatMime
              } = att;
              const url = compatStatus === "ACTIVE" ? compatCdnUrl : cdnUrl;
              const mime = compatStatus === "ACTIVE" ? compatMime : ogMime;

              if (url && mime) {
                const [filename, ext] = this.filenameToHexExtTuple(
                  url,
                  att.compatStatus,
                  false
                );

                const name = `${filename}.${ext}`;

                if (assetType === "DOCUMENT" && this.canViewDocs(model)) {
                  try {
                    if (isFreshContext) {
                      try {
                        const fileId = await this.ensureXaiAssetUploaded(
                          att,
                          keyFingerprint,
                          keyId,
                          apiKey,
                          mgmtKey
                        );
                        if (collectionId) {
                          textParts.push(
                            `[${name}](collections://${collectionId}/files/${fileId})`
                          );
                        }
                      } catch {
                        const cached = this.assetCache.get(att.id);
                        if (cached?.collectionId) {
                          textParts.push(
                            `${modelIdentifier}\n[${name}](collections://${cached?.collectionId}/files/${cached.fileId})`
                          );
                        } else {
                          this.logger.info({
                            fresh_context_attachment_error_xai: `Fresh doc upload for ${modelIdentifier} attachment ${att.id} of url ${url} failed`
                          });
                        }
                      }
                    } else {
                      const cached = this.assetCache.get(att.id);
                      if (cached && collectionId) {
                        textParts.push(
                          `${modelIdentifier}\n[${name}](collections://${collectionId}/files/${cached.fileId})`
                        );
                      } else if (collectionId) {
                        // Not in cache - ensure it's uploaded for future reference
                        try {
                          const fileId = await this.ensureXaiAssetUploaded(
                            att,
                            keyFingerprint,
                            keyId,
                            apiKey,
                            mgmtKey
                          );

                          textParts.push(
                            `${modelIdentifier}\n[${name}](collections://${collectionId}/files/${fileId})`
                          );
                        } catch {
                          // silent fail for already processed context, not critical
                        }
                      }
                    }
                  } catch (err) {
                    this.logger.warn(
                      { err: this.prisma.safeErrMsg(err) },
                      `Failed to upload PDF to Collections/Files API of collectionId ${collectionId}.`
                    );
                  }
                  // can have image attachments from image gen models in multi-provider/multi-model convos
                } else if (assetType === "IMAGE" && this.canViewImgs(model)) {
                  textParts.push(`${modelIdentifier}\n![${name}](${url})`);
                }
              }
            }
          }
        } catch (err) {
          console.error(this.prisma.safeErrMsg(err));
        } finally {
          textParts.push(`${modelIdentifier}\n\n${msg.content}`);
        }
        content.push({
          type: "input_text",
          text: textParts.join(`\n\n`)
        } satisfies TextContentBlock);
        formatted.push({
          role: "assistant",
          content
        } as const satisfies ResponsesContentInputSingleton);
      }
    }
    return formatted;
  }

  private async getResponsesApiInputWorkup(
    isNewChat: boolean,
    model: GrokModelIdUnion,
    userId: string,
    msgs: MessageSingleton<true>[],
    keyFingerprint: string,
    systemPrompt?: string,
    max_output_tokens?: number,
    tool_choice: ToolChoiceUnion = "auto",
    detail?: ImageContentBlock["detail"],
    keyId?: string,
    xaiKey?: string,
    mgmtKey?: string,
    collectionId?: string,
    enableFileSearch = true,
    fileSearchMaxResults = 5,
    enableCodeInterpreter = true,
    enableWebSearch = true,
    enableXSearch = false,
    web_enable_image_understanding = true,
    x_enable_image_understanding = true,
    x_enable_video_understanding = true,
    include = ["reasoning.encrypted_content"]
  ) {
    const apiKey = xaiKey ?? this.xaiKey;
    const managementKey = mgmtKey ?? this.xaiManagementKey;
    const systemInstruction = this.formatSystemInstruction(
      isNewChat,
      systemPrompt
    );
    const tooling = this.handleTooling(
      model,
      userId,
      collectionId,
      enableFileSearch,
      fileSearchMaxResults,
      enableCodeInterpreter,
      enableWebSearch,
      enableXSearch,
      web_enable_image_understanding,
      x_enable_image_understanding,
      x_enable_video_understanding
    );

    const history = await this.formatxAIMsgHistory(
      msgs,
      model,
      userId,
      detail,
      keyFingerprint,
      keyId,
      apiKey,
      managementKey
    );

    return {
      input: history,
      model,
      instructions: systemInstruction,
      tools: tooling,
      tool_choice: tooling
        ? tooling.length > 0
          ? "auto"
          : tool_choice
        : "none",
      store: false,
      include,
      stream: true,
      parallel_tool_calls: true,
      max_output_tokens,
      user: userId
    } as const;
  }
}

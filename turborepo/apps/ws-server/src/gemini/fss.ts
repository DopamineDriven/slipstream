import type {
  AssetCacheProps,
  DbDocsCacheProps,
  DocCountProps,
  EphemeralFile,
  FssDoc,
  FssImportFileParams,
  FssRecordProps
} from "@/gemini/types.ts";
import type {
  DocumentState,
  File,
  FileSearchStore,
  UploadFileParameters
} from "@google/genai";
import type { Logger } from "pino";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { GoogleGenAI } from "@google/genai";
import type { AttachmentSingleton } from "@slipstream/types";

export class FileSearchStoreService {
  private defaultClient: GoogleGenAI;
  protected logger: Logger;
  protected apiVersion = "v1alpha" as const;
  /**
   * uses attachmentId as a key->maps to googles 40-char max [a-z0-9] filename requirements
   * all attachmentIds (and all database generated ids for that matter) are 24-char CUID2 ids
   * ***HOWEVER*** the key itself is prepended with `files/` to match the fileRef on google (the official filename)
   * `files/${attachment.id}`;
   * this also corresponds to the fileRegistry.name field and, equivalently, to the providerAttachment.providerRef field in the database
   */
  protected assetCache = new Map<string, AssetCacheProps>();
  protected dbDocsCache = new Map<string, DbDocsCacheProps>();
  /**
   * key is equal to `files/${attachment.id}`;
   */
  protected fileRegistry = new Map<string, EphemeralFile>();

  protected fssDocRegistry = new Map<string, FssDoc>();
  /**
   * Store DB registry: userId is the key → retrieve ProviderStore.id
   * Quick lookup for database store id
   */
  protected storeDbRegistry: Map<string, string> = new Map<string, string>();
  /**
   * File Search Store Registry: userId is the key → storeRef
   * Avoids repeated fss lookups per user
   */
  protected fssRegistry: Map<string, string> = new Map<string, string>();

  protected lastRegistrySync: Date | null = null;
  constructor(
    logger: LoggerService,
    protected prisma: PrismaService,
    protected apiKey: string
  ) {
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[gemini] " }
      );
    this.defaultClient = new GoogleGenAI({
      apiKey: this.apiKey,
      apiVersion: this.apiVersion
    });
  }

  protected getClient(overrideKey?: string) {
    if (overrideKey) {
      return new GoogleGenAI({
        apiKey: overrideKey,
        apiVersion: this.apiVersion
      });
    }
    return this.defaultClient;
  }

  protected dbToFssState = {
    STATE_ACTIVE: "ACTIVE",
    STATE_FAILED: "FAILED",
    STATE_PENDING: "PROCESSING",
    STATE_UNSPECIFIED: "PENDING"
  } as const;

  protected toDbState(state: keyof typeof DocumentState) {
    return this.dbToFssState[state];
  }

  protected async createFss(userId: string, apiKey = this.apiKey) {
    const genai = this.getClient(apiKey);
    const displayName = this.prisma.vectorStoreDisplayName(userId);

    const fss = await genai.fileSearchStores.create({
      config: { displayName }
    });
    if (fss.name && fss.displayName && fss.createTime) {
      const prismaCreate = await this.prisma.createVectorStoreGemini(
        userId,
        fss.name,
        fss.displayName,
        fss.createTime,
        0
      );

      this.storeDbRegistry.set(userId, prismaCreate.id);

      this.fssRegistry.set(userId, fss.name);

      return {
        dbData: prismaCreate,
        fssData: {
          displayName: fss.displayName,
          name: fss.name,
          createTime: fss.createTime,
          totalDocs: prismaCreate.docs.length
        }
      };
    } else {
      throw new Error("something went wrong while creating the FSS...");
    }
  }
  /**
   * list all documents  from ephemeral 48 hr TTL flat namespace tied to apiKey
   */
  protected async *getEphemeralFiles(apiKey?: string, pageSize = 10) {
    const genai = this.getClient(apiKey);

    const pager = await genai.files.list({
      config: { pageSize }
    });
    let has_more = true,
      count = 0,
      page_number = 0,
      page = pager.page;
    while (has_more) {
      has_more = pager.hasNextPage();
      count += page.length;

      yield {
        page,
        count,
        has_more,
        page_number
      };
      page_number += 1;
      if (!has_more) {
        break;
      }
      page = await pager.nextPage();
    }
  }
  /**
   * list all documents within a FSS
   */
  private async *getIndexedDocsFSS(
    /**
     * the FSS (resource) name (*not display name*)
     */
    parent: string,
    apiKey = this.apiKey,
    pageSize = 20
  ) {
    const genai = this.getClient(apiKey);

    const pager = await genai.fileSearchStores.documents.list({
      parent,
      config: { pageSize }
    });
    let has_more = true,
      count = 0,
      page_number = 0,
      page = pager.page;
    while (has_more) {
      has_more = pager.hasNextPage();
      count += page.length;

      yield {
        page,
        count,
        has_more,
        page_number
      };

      page_number += 1;
      if (!has_more) {
        break;
      }
      page = await pager.nextPage();
    }
  }
  /**
   * list all file search stores
   */
  protected async *listAllFss(apiKey = this.apiKey, pageSize = 20) {
    const genai = this.getClient(apiKey);

    const pager = await genai.fileSearchStores.list({ config: { pageSize } });
    let has_more = true,
      count = 0,
      page_number = 0,
      page = pager.page;
    while (has_more) {
      has_more = pager.hasNextPage();
      count += page.length;

      yield {
        page,
        count,
        has_more,
        page_number
      };

      page_number += 1;
      if (!has_more) {
        break;
      }
      page = await pager.nextPage();
    }
  }

  // Note: markFileAccessed is not needed for Google's TTL-based system
  // Files automatically expire after 48 hours regardless of access patterns

  private async cleanupStaleFiles(apiKey: string) {
    const client = this.getClient(apiKey);
    const filesToDelete = Array.of<string>();
    const dbRecordsToDelete = Array.of<string>();
    const toTuple = Array.from(this.fileRegistry.entries());
    const assetCacheFileNames = Array.from(this.assetCache.keys());
    for (const [name, record] of toTuple) {
      // Check if file has expired (Google Files have 48-hour TTL)
      if (record.expirationTime) {
        const expired = new Date(record.expirationTime).getTime();

        if (expired < Date.now()) {
          filesToDelete.push(name);
          // Collect database record IDs if available
          if (record.name && assetCacheFileNames.includes(record.name)) {
            const dbId = this.assetCache.get(record.name)?.databaseId;
            const expires = this.assetCache.get(record.name)?.expiresAt;
            if (dbId && expires && expires.getTime() < Date.now()) {
              dbRecordsToDelete.push(dbId);
            }
          }
        }
      }
    }

    if (filesToDelete.length === 0) {
      console.info("No stale files to clean up from google files api");
      return;
    }

    // Delete from database first (in transaction)

    if (dbRecordsToDelete.length > 0) {
      try {
        await this.prisma.deleteStaleIds(dbRecordsToDelete);
        this.logger.debug(
          dbRecordsToDelete,
          `Deleted ${dbRecordsToDelete.length} stale database records`
        );
        console.info(
          `cleaned up ${dbRecordsToDelete.length} files in cleanupStaleFiles for GEMINI - target -> database`
        );
      } catch (error) {
        this.logger.warn(
          { error },
          "Failed to delete stale files in cleanupStaleFiles for GEMINI - target -> database"
        );
      }
    }
    console.info(
      `no files to delete in cleanupStaleFiles for GEMINI - target -> database`
    );

    // Then delete from Google Files API
    for (const name of filesToDelete) {
      try {
        await client.files.delete({ name });
        // Remove from registry and cache
        this.fileRegistry.delete(name);
        // Also remove from assetCache if present (cache key matches the file name)
        if (this.assetCache.has(name)) {
          this.assetCache.delete(name);
        }
        console.info(
          filesToDelete,
          `Cleaned up ${filesToDelete.length} stale files for GEMINI - target->google files api`
        );
      } catch (error) {
        this.logger.warn(
          { error, name },
          `Failed to delete stale file ${name} for GEMINI - target->google files api`
        );
      }
    }
    console.log(
      `Cleanup complete: ${filesToDelete.length} files removed for GEMINI - target->google files api`
    );
  }

  private parseCount<const T extends keyof DocCountProps = keyof DocCountProps>(
    target: T,
    props: FileSearchStore
  ) {
    const t = target as keyof DocCountProps;
    if (t in props && typeof props[t] !== "undefined")
      return Number.parseInt(props[t]);
    else return 0;
  }

  private getDocCounts(fssRecord: FssRecordProps, store: FileSearchStore) {
    const x = [
      "activeDocumentsCount",
      "failedDocumentsCount",
      "pendingDocumentsCount"
    ] as const;
    for (const key of x) {
      fssRecord.totalDocuments += this.parseCount(key, store);
    }
    return fssRecord;
  }

  private async pullFssRecord(userId: string, key = this.apiKey) {
    const fssRecord = {
      hasStore: false,
      storeRef: "",
      storeDisplayName: "",
      createdAt: "",
      updatedAt: "",
      totalDocuments: 0
    };
    const displayName = this.prisma.vectorStoreDisplayName(userId);
    for await (const fss of this.listAllFss(key)) {
      for (const store of fss.page) {
        // these four props are always defined on create; the others are not.
        if (
          store.displayName &&
          store.name &&
          store.createTime &&
          store.updateTime
        ) {
          if (displayName === store.displayName) {
            fssRecord.hasStore = true;
            fssRecord.createdAt = store.createTime;
            fssRecord.storeDisplayName = store.displayName;
            fssRecord.storeRef = store.name;
            fssRecord.updatedAt = store.updateTime;
            this.getDocCounts(fssRecord, store);
          }
        }
      }
    }
    return fssRecord;
  }

  private async syncEphemeralRegistry(apiKey = this.apiKey) {
    let totalFiles = 0;
    // Populate file registry cache but cross-compare with asset-cache entries before persisting (ensure database-existence for user before adding--
    // if a user is using the default server api key there will be many files not relevant to the user in the google files api)
    for await (const batch of this.getEphemeralFiles(apiKey)) {
      for (const file of batch.page) {
        if (file.name && file.expirationTime && file.uri && file.sizeBytes) {
          if (this.assetCache.has(file.name)) {
            this.fileRegistry.set(file.name, file);
          }
        }
      }

      totalFiles = batch.count;
      console.debug(
        `Synced ${batch.count} Gemini files, has_more: ${batch.has_more}`
      );
    }
    return totalFiles;
  }

  private async syncFssDocs(fssRef: string, apiKey = this.apiKey) {

    for await (const s of this.getIndexedDocsFSS(fssRef, apiKey, 20)) {
      if (s.page.length > 0) {
        for (const doc of s.page) {
          let attachmentId: string | null = null;
          if (
            doc.customMetadata &&
            doc.displayName &&
            doc.name &&
            doc.createTime &&
            doc.updateTime &&
            doc.customMetadata.length > 0
          ) {
            attachmentId = doc.displayName;
            for (const meta of doc.customMetadata) {
              if (meta.key && meta.key === "attachmentId" && meta.stringValue) {
                attachmentId = meta.stringValue;
                this.fssDocRegistry.set(`files/${attachmentId}`, doc);
              }
            }
          }
        }
      }
    }
  }

  private async syncAssetCache(
    userId: string,
    fssRef: string,
    storeDbId: string
  ) {
    try {
      const providerAssets = await this.prisma.findManyByProvider(
        "GEMINI",
        userId
      );
      // Populate asset cache with active database mappings (gated by environment (database) and api key (user-key vs default server key))
      if (providerAssets.length > 0) {
        for (const asset of providerAssets) {
          if (asset.providerUri && asset.expiresAt && !asset.isExpired) {
            this.assetCache.set(asset.providerRef, {
              expiresAt: asset.expiresAt,
              fileUri: asset.providerUri,
              databaseId: asset.id,
              storeDbId,
              storeRef: fssRef
            });
          }
        }
      }

      console.info(
        `Populated Gemini asset cache with ${this.assetCache.size} entries from database`
      );
    } catch (error) {
      console.error({ error }, "Failed to populate asset cache from database");
    }
  }

  private ephemeralRegistryEq(
    fileRegistry: Map<string, File>,
    assetCache: Map<string, AssetCacheProps>
  ) {
    if (fileRegistry.size !== assetCache.size) {
      if (fileRegistry.size > assetCache.size) {
        for (const fileKey of Array.from(fileRegistry.keys())) {
          if (!assetCache.has(fileKey)) {
            fileRegistry.delete(fileKey);
          }
        }
      }
      if (assetCache.size > fileRegistry.size) {
        for (const dbKey of Array.from(assetCache.keys())) {
          if (!fileRegistry.has(dbKey)) {
            assetCache.delete(dbKey);
          }
        }
      }
    }
  }

  public async syncFileRegistry(userId: string, cleanupStaleFiles = false) {
    this.fssRegistry.clear();
    this.fssDocRegistry.clear();
  
    this.storeDbRegistry.clear();
    this.assetCache.clear();
    this.fileRegistry.clear();

    const key = await this.prisma.resolveApiKey(userId, this.apiKey, "gemini");

    let [fssRecord, storeDbData] = await Promise.all([
      this.pullFssRecord(userId, key),
      this.prisma.vectorStoreInfoByProvider(userId, "GEMINI")
    ]);

    if (fssRecord.hasStore === false) {
      const { dbData, fssData } = await this.createFss(userId, key);
      storeDbData = {
        dbId: dbData.id,
        totalBytes: dbData.totalBytes ?? 0,
        fileCount: dbData.fileCount,
        hasStore: true,
        provider: "GEMINI",
        storeName: fssData.displayName,
        storeRef: fssData.name
      };
    }

    if (!storeDbData.dbId) {
      const dbData = await this.prisma.createVectorStoreGemini(
        userId,
        fssRecord.storeRef,
        fssRecord.storeDisplayName,
        fssRecord.createdAt,
        fssRecord.totalDocuments
      );
      storeDbData = {
        dbId: dbData.id,
        totalBytes: dbData.totalBytes ?? 0,
        fileCount: dbData.fileCount,
        hasStore: true,
        provider: "GEMINI",
        storeName: fssRecord.storeDisplayName,
        storeRef: fssRecord.storeRef
      };
      this.storeDbRegistry.set(userId, dbData.id);
      this.fssRegistry.set(userId, fssRecord.storeRef);
    }

    const fssRef = fssRecord.storeRef;
    const storeDbId = storeDbData.dbId;

    this.storeDbRegistry.set(userId, storeDbId);
    this.fssRegistry.set(userId, fssRef);

    const providerAssets = await this.prisma.findManyByProvider(
      "GEMINI",
      userId
    );

    if (providerAssets.length > 0) {
      for (const asset of providerAssets) {
        if (asset.providerRef && asset.expiresAt) {
          this.assetCache.set(asset.attachmentId, {
            fileUri: asset.providerRef,
            expiresAt: asset.expiresAt,
            storeDbId,
            databaseId: asset.id,
            storeRef: fssRef
          });
        }
      }
    }

    const hasGeminiMessages = await this.prisma.hasProviderMessages(
      userId,
      "GEMINI"
    );

    if (!hasGeminiMessages) {
      return { synced: true, totalFiles: 0, lastSync: new Date() };
    }

    let totalFiles = 0;

    await this.syncAssetCache(userId, fssRef, storeDbId);

    totalFiles = await this.syncEphemeralRegistry(key);

    this.lastRegistrySync = new Date();
    console.info(
      `File registry and Asset cache sync complete for Gemini: ${totalFiles} files indexed`
    );

    // Optionally trigger cleanup of stale files
    if (cleanupStaleFiles) {
      await this.cleanupStaleFiles(key);
    }

    this.ephemeralRegistryEq(this.fileRegistry, this.assetCache);

    return { synced: true, totalFiles, lastSync: this.lastRegistrySync };
  }

  private fssImportConfig(
    displayName: string,
    {
      attachmentId,
      conversationId,
      extension,
      fileName,
      messageId
    }: {
      conversationId: string;
      messageId: string;
      attachmentId: string;
      fileName: string;
      extension: string;
    }
  ) {
    return {
      chunkingConfig: {
        whiteSpaceConfig: {
          /**
           * internally capped at 512 as of 2025-12-29
           */
          maxTokensPerChunk: 512,
          /**
           * internally capped at 128 as of 2025-12-29
           */
          maxOverlapTokens: 128
        }
      },
      customMetadata: [
        { key: "displayName", stringValue: displayName },
        { key: "attachmentId", stringValue: attachmentId },
        { key: "conversationId", stringValue: conversationId },
        { key: "messageId", stringValue: messageId },
        { key: "originalFilename", stringValue: `${fileName}.${extension}` }
      ]
    };
  }

  protected async fssDocPersistBackground() {}

  protected async uploadRemoteAssetToGoogle(
    attachment: AttachmentSingleton<true>,
    apiKey = this.apiKey
  ) {
    const { absTmpPath, mime, tmpUniquename } =
      await this.prisma.fetchRemoteToTmp("GEMINI", attachment);
    const displayName = this.prisma.toVectorStoreFilename(attachment);
    const mimeType = mime === "application/text" ? "text/markdown" : mime;
    const fileName = `files/${attachment.id}` as const;
    const fileSearchStoreName = this.fssRegistry.get(attachment.userId);
    try {
      const ai = this.getClient(apiKey);
      const uploadedFile = await ai.files.upload({
        file: absTmpPath,
        config: {
          mimeType,
          name: fileName,
          displayName
        }
      } satisfies UploadFileParameters);
      if (
        attachment.assetType === "DOCUMENT" &&
        !this.fssDocRegistry.has(fileName) &&
        fileSearchStoreName
      ) {
        const config = this.fssImportConfig(
          displayName,
          this.prisma.parseFilename(displayName)
        );
        const fssImportParams = {
          fileName,
          fileSearchStoreName,
          config
        } satisfies FssImportFileParams;

        let operation = await ai.fileSearchStores.importFile(fssImportParams);

        // Poll until completion
        while (!operation.done) {
          await new Promise(resolve => setTimeout(resolve, 10000));
          operation = await ai.operations.get({
            operation
          });
        }

        if (!operation.response?.documentName)
          throw new Error("no fss doc name");
        const name =
          `${fileSearchStoreName}/documents/${operation.response.documentName}` as const;

        void (await ai.fileSearchStores.documents.get({
          name
        }));
        return uploadedFile;
      } else {
        return uploadedFile;
      }
    } catch (error) {
      this.logger.error(
        `Error uploading file to Google for attachment: ${attachment.id} - ${this.prisma.safeErrMsg(error)}`
      );
      throw new Error(
        error instanceof Error
          ? error.message
          : "Failed to upload file to Google Files API" +
              this.prisma.safeErrMsg(error)
      );
    } finally {
      this.prisma.cleanupTmpPostupload("GEMINI", absTmpPath, tmpUniquename);
    }
  }

  protected promoteUploadedDocFss() {}

  protected importDocumentFssWorkup() {}
}

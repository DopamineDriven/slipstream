import type {
  AssetCacheProps,
  DocCountProps,
  EphemeralFile,
  FssDoc,
  FssDocSurfacedMeta,
  FssRecordProps,
  StoreDocDbRegistryProps
} from "@/gemini/types.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type {
  DocumentState,
  File,
  FileSearchStore,
  UploadToFileSearchStoreParameters
} from "@google/genai";
import type { Logger } from "pino";
import { GoogleGenAI } from "@google/genai";
import type { AttachmentSingleton } from "@slipstream/types";
import * as $Enums from "@slipstream/db/enums-node";

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

  /**
   * fss db document registry
   */
  protected storeDocDbRegistry = new Map<string, StoreDocDbRegistryProps>();

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

  protected fssToDbState = {
    STATE_ACTIVE: "ACTIVE",
    STATE_FAILED: "FAILED",
    STATE_PENDING: "PROCESSING",
    STATE_UNSPECIFIED: "PENDING"
  } as const satisfies Record<
    keyof typeof DocumentState,
    keyof typeof $Enums.ProviderDocState
  >;

  protected dbToFssState = {
    ACTIVE: "STATE_ACTIVE",
    FAILED: "STATE_FAILED",
    PROCESSING: "STATE_PENDING",
    PENDING: "STATE_UNSPECIFIED"
  } as const satisfies Record<
    keyof typeof $Enums.ProviderDocState,
    keyof typeof DocumentState
  >;

  protected async createFssRemote(genai: GoogleGenAI, userId: string) {
    const displayName = this.prisma.vectorStoreDisplayName(userId);
    return await genai.fileSearchStores.create({ config: { displayName } });
  }

  protected async getFssRemote(genai: GoogleGenAI, fssRef: string) {
    return await genai.fileSearchStores.get({ name: fssRef });
  }

  protected async createDbFssViaFssRemote(
    genai: GoogleGenAI,
    fssRef: string,
    userId: string
  ) {
    const fss = await this.getFssRemote(genai, fssRef);
    const {
      name,
      displayName,
      createTime,
      updateTime,
      sizeBytes,
      activeDocumentsCount,
      ...rest
    } = fss;
    if (name && displayName && createTime && updateTime) {
      let totalBytes = 0n;
      let counts = 0;
      if (sizeBytes) totalBytes = BigInt(Number.parseInt(sizeBytes));
      if (activeDocumentsCount) counts = Number.parseInt(activeDocumentsCount);
      const prismaCreate = await this.prisma.createProviderVectorStore(
        "GEMINI",
        userId,
        name,
        displayName,
        createTime,
        updateTime,
        counts,
        totalBytes
      );

      this.storeDbRegistry.set(userId, prismaCreate.id);

      this.fssRegistry.set(userId, name);

      return {
        dbData: prismaCreate,
        fssData: {
          name,
          displayName,
          createTime,
          updateTime,
          sizeBytes: Number(totalBytes).toString(),
          activeDocumentsCount: counts.toString(),
          ...rest
        }
      };
    } else {
      throw new Error(
        "something went wrong while creating the database FSS via the remote FSS..."
      );
    }
  }

  protected async createFss(genai: GoogleGenAI, userId: string) {
    const fss = await this.createFssRemote(genai, userId);
    const { name, displayName, createTime, updateTime, ...rest } = fss;
    if (name && displayName && createTime && updateTime) {
      const prismaCreate = await this.prisma.createProviderVectorStore(
        "GEMINI",
        userId,
        name,
        displayName,
        createTime,
        updateTime,
        0,
        0n
      );

      this.storeDbRegistry.set(userId, prismaCreate.id);

      this.fssRegistry.set(userId, name);

      return {
        dbData: prismaCreate,
        fssData: { name, displayName, createTime, updateTime, ...rest }
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
     * the FSS (resource) name
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
  // IMPORTANT: THIS IS ONLY FOR EPHEMERAL (NON-STORE-EMBEDDED) FILES

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

  private surfaceCustomMetaSingleton(data: FssDoc) {
    const t = data;
    const { customMetadata, ...rest } = t;
    const tuples = Array.of<readonly [string, string]>();
    let metaObj: {
      attachmentId: string;
      conversationId: string;
      messageId: string;
      originalFilename: string;
    };
    if (t.displayName) {
      const { attachmentId, conversationId, extension, fileName, messageId } =
        this.prisma.parseDocname(t.displayName);
      const originalFilename = `${fileName}.${extension}`;
      metaObj = {
        attachmentId,
        messageId,
        conversationId,
        originalFilename
      };
      return {
        ...rest,
        ...metaObj
      } satisfies FssDocSurfacedMeta;
    } else {
      if (customMetadata && customMetadata.length > 0) {
        for (const { key, stringValue } of customMetadata) {
          if (key && stringValue) tuples.push([key, stringValue] as const);
        }
      }
      metaObj = Object.fromEntries(tuples) as {
        attachmentId: string;
        conversationId: string;
        messageId: string;
        originalFilename: string;
      };
      return {
        ...rest,
        ...metaObj
      } satisfies FssDocSurfacedMeta;
    }
  }

  private restoreOriginalFssDoc(data: FssDocSurfacedMeta) {
    const {
      attachmentId,
      conversationId,
      messageId,
      originalFilename,
      ...rest
    } = data;
    return {
      ...rest,
      customMetadata: [
        { key: `attachmentId`, stringValue: attachmentId },
        { key: "conversationId", stringValue: conversationId },
        { key: "messageId", stringValue: messageId },
        { key: "originalFilename", stringValue: originalFilename }
      ]
    } satisfies FssDoc as FssDoc;
  }

  private restoreCustomMeta(data: FssDocSurfacedMeta): FssDoc;
  private restoreCustomMeta(data: FssDocSurfacedMeta[]): FssDoc[];
  private restoreCustomMeta(data: FssDocSurfacedMeta[] | FssDocSurfacedMeta) {
    if (Array.isArray(data)) {
      return data.map(t => this.restoreOriginalFssDoc(t));
    } else return this.restoreOriginalFssDoc(data);
  }

  private surfaceCustomMeta(data: FssDoc[]): FssDocSurfacedMeta[];
  private surfaceCustomMeta(data: FssDoc): FssDocSurfacedMeta;
  private surfaceCustomMeta(data: FssDoc[] | FssDoc) {
    if (Array.isArray(data)) {
      return data.map(t => this.surfaceCustomMetaSingleton(t));
    } else return this.surfaceCustomMetaSingleton(data);
  }
  private fssDocEpimerize(data: FssDocSurfacedMeta[]): FssDoc[];
  private fssDocEpimerize(data: FssDocSurfacedMeta): FssDoc;
  private fssDocEpimerize(data: FssDoc[]): FssDocSurfacedMeta[];
  private fssDocEpimerize(data: FssDoc): FssDocSurfacedMeta;
  private fssDocEpimerize(
    data: (FssDoc | FssDocSurfacedMeta)[] | (FssDoc | FssDocSurfacedMeta)
  ) {
    if (Array.isArray(data)) {
      return data.map(t => {
        if ("attachmentId" in t) {
          return this.restoreCustomMeta(t);
        } else return this.surfaceCustomMeta(t);
      });
    } else {
      if ("attachmentId" in data) {
        return this.restoreCustomMeta(data);
      } else return this.surfaceCustomMeta(data);
    }
  }

  private async syncProviderStoreDocs(userId: string) {
    try {
      const providerStoreDocs = (await this.prisma.findManyProviderStoreDocs(
        "GEMINI",
        userId
      )) satisfies StoreDocDbRegistryProps[];
      if (providerStoreDocs.length > 0) {
        for (const providerDoc of providerStoreDocs) {
          this.storeDocDbRegistry.set(
            `files/${providerDoc.attachmentId}`,
            providerDoc
          );
        }
      }

      console.info(
        `Populated Gemini provider store docs cache with ${this.storeDocDbRegistry.size} entries from database`
      );
    } catch (err) {
      console.info(
        `Failed to populate Gemini provider store docs cache from database: ${this.prisma.safeErrMsg(err)}`
      );
    }
  }

  private async syncFssDocs(fssRef: string, apiKey = this.apiKey) {
    try {
      for await (const s of this.getIndexedDocsFSS(fssRef, apiKey, 20)) {
        if (s.page.length > 0) {
          const arrOfEpimerizedOutput = this.fssDocEpimerize(s.page);
          const backToOriginal = this.fssDocEpimerize(arrOfEpimerizedOutput);
          for (const doc of s.page) {
            if (doc.displayName && doc.name) {
              const { attachmentId } = this.fssDocEpimerize(doc);
              this.fssDocRegistry.set(`files/${attachmentId}`, doc);
            }
          }
        }
      }
      console.info(
        `Populated Gemini fss doc registry cache with ${this.fssDocRegistry.size} entries from store ${fssRef}`
      );
    } catch (err) {
      console.info(
        `Failed to populate Gemini fss doc registry cache targeting store ${fssRef}: ${this.prisma.safeErrMsg(err)}`
      );
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

  private async documentRegistriesEq(
    genai: GoogleGenAI,
    userId: string,
    storeId: string,
    fssRef: string,
    storeDocDbRegistry: Map<string, StoreDocDbRegistryProps>,
    fssDocRegistry: Map<string, FssDoc>
  ) {
    if (storeDocDbRegistry.size !== fssDocRegistry.size) {
      if (storeDocDbRegistry.size < fssDocRegistry.size) {
        const fssDocsToSync = Array.of<FssDoc>();
        for (const [fileKey, fssDoc] of Array.from(fssDocRegistry.entries())) {
          if (!storeDocDbRegistry.has(fileKey)) {
            const { attachmentId } = this.fssDocEpimerize(fssDoc);
            const hasDocVerified = await this.prisma.hasProviderStoreDocument(
              attachmentId,
              fssRef,
              storeId,
              "GEMINI"
            );
            if (
              !hasDocVerified &&
              fssDoc.name !==
                "fileSearchStores/devnrr6h4r4480f6kviycyo1zhf-ms61ejujh04k/documents/iuwtduxwu10r4xyrzfxl5hq1l2e-y41oga3z1sht"
            )
              fssDocsToSync.push(fssDoc);
          }
        }
        this.logger.debug(fssDocsToSync, "docs to sync");
        const res = await this.prisma.createManyProviderStoreDocsGemini(
          fssDocsToSync,
          storeId,
          userId
        );
        for (const doc of res.docs) {
          const { attachment: _att, store: _store, ...rest } = doc;
          storeDocDbRegistry.set(`files/${doc.attachmentId}`, rest);
        }
      }
      if (storeDocDbRegistry.size > fssDocRegistry.size) {
        const fssDocsToIndex = Array.of<string>();
        for (const storeDoc of Array.from(storeDocDbRegistry.values())) {
          if (
            storeDoc.attachmentId &&
            !fssDocRegistry.has(`files/${storeDoc.attachmentId}`)
          ) {
            fssDocsToIndex.push(storeDoc.attachmentId);
          }
        }

        const getAttachments =
          await this.prisma.getManyAttachments(fssDocsToIndex);
        const cleanupAgg = Array.of<readonly [string, string]>();
        for (const attachment of getAttachments) {
          try {
            const { absTmpPath, mime, tmpUniquename } =
              await this.prisma.fetchRemoteToTmp("GEMINI", attachment);
            cleanupAgg.push([absTmpPath, tmpUniquename]);
            const displayName = this.prisma.toVectorStoreFilename(attachment);
            const fssDoc = await this.fssUploadDirect(
              genai,
              fssRef,
              absTmpPath,
              displayName,
              mime,
              3000,
              20
            );
            fssDocRegistry.set(`files/${attachment.id}`, fssDoc);
          } catch (err) {
            console.info(
              `error in documentRegistriesEq when uploading direct to FSS ${this.prisma.safeErrMsg(err)}`
            );
          }
        }
        if (cleanupAgg.length > 0) {
          for (const [absTmpPath, tmpUniquename] of cleanupAgg) {
            this.prisma.cleanupTmpPostupload(
              "GEMINI",
              absTmpPath,
              tmpUniquename
            );
          }
        }
      }
    }
  }

  public async syncFileRegistry(userId: string, cleanupStaleFiles = false) {
    this.fssRegistry.clear();
    this.fssDocRegistry.clear();
    this.storeDocDbRegistry.clear();

    this.storeDbRegistry.clear();
    this.assetCache.clear();
    this.fileRegistry.clear();

    const key = await this.prisma.resolveApiKey(userId, this.apiKey, "gemini");
    const genai = this.getClient(key);
    let [fssRecord, storeDbData] = await Promise.all([
      this.pullFssRecord(userId, key),
      this.prisma.vectorStoreInfoByProvider(userId, "GEMINI")
    ]);

    if (fssRecord.hasStore === false && storeDbData.hasStore === false) {
      const { dbData, fssData } = await this.createFss(genai, userId);
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

    if (fssRecord.hasStore === true && storeDbData.hasStore === false) {
      const { dbData } = await this.createDbFssViaFssRemote(
        genai,
        fssRecord.storeRef,
        userId
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
    }

    const fssRef = fssRecord.storeRef;
    // definitely has it by this point
    const storeDbId = storeDbData.dbId ?? "";

    this.storeDbRegistry.set(userId, storeDbId);
    this.fssRegistry.set(userId, fssRef);

    const [hasGeminiMessages, hasGeminiStoreDocs] = await Promise.all([
      this.prisma.hasProviderMessages(userId, "GEMINI"),
      this.prisma.hasProviderStoreDocs(userId, "GEMINI")
    ]);

    if (hasGeminiStoreDocs) {
      await this.syncProviderStoreDocs(userId);
    }
    if (fssRecord.totalDocuments > 0) {
      await this.syncFssDocs(fssRef, key);
    }
    if (hasGeminiMessages) {
      await this.syncAssetCache(userId, fssRef, storeDbId);
    }

    let totalFiles = 0;

    totalFiles = await this.syncEphemeralRegistry(key);

    this.lastRegistrySync = new Date();
    console.info(
      `File registry and Asset cache sync complete for Gemini: ${totalFiles} files indexed`
    );

    // Optionally trigger cleanup of stale files
    if (cleanupStaleFiles) {
      void this.cleanupStaleFiles(key);
    }

    await this.documentRegistriesEq(
      genai,
      userId,
      storeDbId,
      fssRef,
      this.storeDocDbRegistry,
      this.fssDocRegistry
    );

    this.ephemeralRegistryEq(this.fileRegistry, this.assetCache);

    return { synced: true, totalFiles, lastSync: this.lastRegistrySync };
  }

  private fssUploadDirectParams(
    fileSearchStoreName: string,
    absPath: string,
    displayName: string,
    mimeType?: string
  ) {
    const { attachmentId, conversationId, messageId, extension, fileName } =
      this.prisma.parseDocname(displayName);
    return {
      file: absPath,
      fileSearchStoreName,
      config: {
        /**can be up to 512 chars in length */
        displayName,
        mimeType,
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
          { key: "attachmentId", stringValue: attachmentId },
          { key: "conversationId", stringValue: conversationId },
          { key: "messageId", stringValue: messageId },
          {
            key: "originalFilename",
            stringValue: `${fileName}.${extension}`
          }
        ]
      }
    } satisfies UploadToFileSearchStoreParameters;
  }
  /**
   * `name` must have the following shape
   *
   * ```ts
   * const name = `files/${attachmentId}`
   * ```
   */
  private async uploadDirect(
    genai: GoogleGenAI,
    absTmpPath: string,
    name: string,
    mimeType: string,
    /**can be up to 512 chars in length */
    displayName: string
  ) {
    return await genai.files.upload({
      file: absTmpPath,
      config: {
        name,
        mimeType,
        displayName
      }
    });
  }

  private async getNewlyIndexedDoc(genai: GoogleGenAI, docRef: string) {
    return await genai.fileSearchStores.documents.get({
      name: docRef
    });
  }

  private async fssUploadDirect(
    genai: GoogleGenAI,
    fileSearchStoreName: string,
    absPath: string,
    displayName: string,
    mimeType: string,
    pollIntervalMs = 3000,
    maxAttempts = 20
  ) {
    let operation = await genai.fileSearchStores.uploadToFileSearchStore(
      this.fssUploadDirectParams(
        fileSearchStoreName,
        absPath,
        displayName,
        mimeType
      )
    );

    let attempts = 0;
    /**
     * `operation.name` is always defined contrary to its conditional type definition;
     * the operations api (polling) would break if `operation.name` resolved to undefined
     */
    const opName = operation.name ?? "";
    /**
     * plucked from `operation.name`
     *
     * Upload Direct: `"fileSearchStores/devnrr6h4r4480f6kviycyo1zhf-ms61ejujh04k/upload/operations/ddgx0syru0mkkomaqc0q6q4qwog-en33z6nn50mm"`
     *
     * Import (Promote): `"fileSearchStores/devnrr6h4r4480f6kviycyo1zhf-ms61ejujh04k/operations/ddgx0syru0mkkomaqc0q6q4qwog-en33z6nn50mm"`
     */
    const docId = opName.slice(opName.lastIndexOf("/") + 1);

    const docRef = `${fileSearchStoreName}/documents/${docId}`;

    while (!operation.done) {
      if (operation.error) {
        throw new Error(
          `FSS upload direct failed: ${this.prisma.safeErrMsg(operation.error)}`
        );
      }

      attempts++;

      if (attempts >= maxAttempts) {
        throw new Error(
          `FSS upload direct timed out after ${maxAttempts} attempts`
        );
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      operation = await genai.operations.get({
        operation
      });
    }

    const doc = await this.getNewlyIndexedDoc(genai, docRef);

    return doc;
  }

  private async shouldIndexDocCheck(
    genai: GoogleGenAI,
    absTmpPath: string,
    displayName: string,
    attachmentId: string,
    assetType: "DOCUMENT" | "IMAGE" | "VIDEO" | "AUDIO" | "UNKNOWN",
    mimeType: string,
    userId: string,
    fileSearchStoreName?: string
  ) {
    if (assetType !== "DOCUMENT") return;
    if (!fileSearchStoreName) return;
    const cacheKey = `files/${attachmentId}`;
    if (
      this.fssDocRegistry.has(cacheKey) &&
      this.storeDocDbRegistry.has(cacheKey)
    )
      return;

    const storeId = this.storeDbRegistry.get(userId);
    const storeRef = fileSearchStoreName;
    if (
      this.fssDocRegistry.has(cacheKey) &&
      !this.storeDocDbRegistry.has(cacheKey)
    ) {
      const fssDoc = this.fssDocRegistry.get(cacheKey);
      if (
        fssDoc &&
        storeId &&
        fssDoc.name &&
        fssDoc.displayName &&
        fssDoc.state &&
        fssDoc.mimeType &&
        fssDoc.sizeBytes &&
        fssDoc.sizeBytes &&
        fssDoc.updateTime
      ) {
        const record = {
          userId,
          attachmentId,
          storeId,
          docRef: fssDoc.name,
          docUri: `https://generativelanguage.googleapis.com/v1beta/${fssDoc.name}`,
          storeRef,
          filename: fssDoc.displayName,
          indexedAt: new Date(fssDoc.updateTime),
          mimeType: fssDoc.mimeType,
          state: this.fssToDbState[fssDoc.state],
          size: BigInt(Number.parseInt(fssDoc.sizeBytes))
        };
        const toDb = await this.prisma.createGeminiStoreDoc(record);
        this.storeDocDbRegistry.set(cacheKey, toDb);
      }
    }
    if (
      !this.fssDocRegistry.has(cacheKey) &&
      !this.storeDocDbRegistry.has(cacheKey) &&
      storeId &&
      storeRef
    ) {
      const fss = await this.fssUploadDirect(
        genai,
        fileSearchStoreName,
        absTmpPath,
        displayName,
        mimeType
      );
      this.fssDocRegistry.set(cacheKey, fss);
      if (
        fss.state &&
        fss.createTime &&
        fss.displayName &&
        fss.name &&
        fss.sizeBytes &&
        fss.mimeType &&
        fss.updateTime
      ) {
        const record = {
          userId,
          attachmentId,
          storeId,
          docRef: fss.name,
          docUri: `https://generativelanguage.googleapis.com/v1beta/${fss.name}`,
          storeRef,
          filename: fss.displayName,
          indexedAt: new Date(fss.updateTime),
          mimeType: fss.mimeType,
          state: this.fssToDbState[fss.state],
          size: BigInt(Number.parseInt(fss.sizeBytes))
        };
        const toDb = await this.prisma.createGeminiStoreDoc(record);
        this.storeDocDbRegistry.set(cacheKey, toDb);
      }
    }
  }
  /**
   * standalone one-off to handle indexing docs that might already be uploaded remotely
   * due to implementing this feature and conversation histories having pre-existing docs
   * that aren't yet indexed
   */
  protected async indexFssDocWithGoogle(
    attachment: AttachmentSingleton<true>,
    apiKey = this.apiKey
  ) {
    const { absTmpPath, mime, tmpUniquename } =
      await this.prisma.fetchRemoteToTmp("GEMINI", attachment);
    const displayName = this.prisma.toVectorStoreFilename(attachment);
    const mimeType = mime === "application/text" ? "text/markdown" : mime;
    const fileSearchStoreName = this.fssRegistry.get(attachment.userId);
    try {
      const ai = this.getClient(apiKey);
      await this.shouldIndexDocCheck(
        ai,
        absTmpPath,
        displayName,
        attachment.id,
        attachment.assetType,
        mimeType,
        attachment.userId,
        fileSearchStoreName
      );
    } catch (err) {
      throw new Error(
        `failed to index fss doc with google store ${fileSearchStoreName} ${this.prisma.safeErrMsg(err)}`
      );
    } finally {
      this.prisma.cleanupTmpPostupload("GEMINI", absTmpPath, tmpUniquename);
    }
  }

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
      const uploadedFile = await this.uploadDirect(
        ai,
        absTmpPath,
        fileName,
        mimeType,
        displayName
      );

      await this.shouldIndexDocCheck(
        ai,
        absTmpPath,
        displayName,
        attachment.id,
        attachment.assetType,
        mime,
        attachment.userId,
        fileSearchStoreName
      );

      return uploadedFile;
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
}

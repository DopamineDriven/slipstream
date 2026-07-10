import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type {
  CreatManyGrokProviderStoreDocSingleton,
  xAIDocDbRegistryProps
} from "@/xai/types.ts";
import { GrokApiMethodsService } from "@/xai/api-methods.ts";

export class GrokSyncService extends GrokApiMethodsService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    xaiKey: string,
    xaiManagementKey: string
  ) {
    super(logger, prisma, xaiKey, xaiManagementKey);
  }

  protected async syncFilesRegistry(apiKey = this.xaiKey) {
    let totalFiles = 0;
    for await (const batch of this.getAllFilesxAI(apiKey)) {
      for (const file of batch.data) {
        if (file.filename && file.id && file.bytes) {
          totalFiles += 1;
          const { attachmentId } = this.prisma.parseDocname(file.filename);
          this.fileCache.set(attachmentId, file);
        }
      }
    }
    console.debug(`Synced ${totalFiles} Grok files to fileCache.`);
    return totalFiles;
  }

  protected async syncFilesDbRegistry(userId: string) {
    try {
      const attachmentProviderFiles = await this.prisma.findManyByProvider(
        "GROK",
        userId
      );
      if (attachmentProviderFiles.length > 0) {
        for (const providerDoc of attachmentProviderFiles) {
          const { ...rest } = providerDoc;
          this.fileDbRegistry.set(providerDoc.attachmentId, { ...rest });
        }
      }

      console.info(
        `Populated Grok fileDbRegistry with ${this.fileDbRegistry.size} entries from database`
      );
    } catch (err) {
      console.info(
        `Failed to populate Grok fileDbRegistry from database: ${this.prisma.safeErrMsg(err)}`
      );
    }
  }

  protected async syncProviderStoreDbDocs(userId: string) {
    try {
      const providerStoreDocs = (await this.prisma.findManyProviderStoreDocs(
        "GROK",
        userId
      )) satisfies xAIDocDbRegistryProps[];
      if (providerStoreDocs.length > 0) {
        for (const providerDoc of providerStoreDocs) {
          this.storeDbDocRegistry.set(providerDoc.attachmentId, providerDoc);
        }
      }

      console.info(
        `Populated Grok storeDbDocRegistry with ${this.storeDbDocRegistry.size} entries from database`
      );
    } catch (err) {
      console.info(
        `Failed to populate Grok storeDbDocRegistry from database: ${this.prisma.safeErrMsg(err)}`
      );
    }
  }

  protected async syncCollectionDocs(
    collectionId: string,
    mgmntKey = this.xaiManagementKey
  ) {
    try {
      for await (const s of this.getAllCollectionDocuments(
        collectionId,
        20,
        mgmntKey
      )) {
        if (s.data.length > 0) {
          for (const doc of s.data) {
            if (doc.file_metadata.file_id && doc.file_metadata.name) {
              const { attachmentId } = this.prisma.parseDocname(
                doc.file_metadata.name
              );
              this.docCache.set(attachmentId, doc);
            }
          }
        }
      }
      console.info(
        `Populated Grok docs cache with ${this.docCache.size} entries from store ${collectionId}`
      );
    } catch (err) {
      console.info(
        `Failed to populate Grok docs cache targeting store ${collectionId}: ${this.prisma.safeErrMsg(err)}`
      );
    }
  }

  protected fileRegistriesEq() {
    if (this.fileCache.size !== this.fileDbRegistry.size) {
      if (this.fileCache.size > this.fileDbRegistry.size) {
        for (const fileKey of Array.from(this.fileCache.keys())) {
          if (!this.fileDbRegistry.has(fileKey)) {
            this.fileCache.delete(fileKey);
          }
        }
      }
      if (this.fileDbRegistry.size > this.fileCache.size) {
        for (const dbKey of Array.from(this.fileDbRegistry.keys())) {
          if (!this.fileCache.has(dbKey)) {
            this.fileDbRegistry.delete(dbKey);
          }
        }
      }
    }

    console.info(
      `Grok fileRegistriesEquality complete: fileDbRegistry: ${this.fileDbRegistry.size}, fileCache: ${this.fileCache.size}`
    );
  }

  protected async docRegistriesEq(
    userId: string,
    storeRef: string,
    storeDbId: string,
    apiKey = this.xaiKey,
    managementKey = this.xaiManagementKey
  ) {
    if (this.storeDbDocRegistry.size !== this.docCache.size) {
      if (this.storeDbDocRegistry.size < this.docCache.size) {
        let totalBytes = 0n;
        const newDocArr = Array.of<CreatManyGrokProviderStoreDocSingleton>();
        for (const [cacheKey, doc] of Array.from(this.docCache.entries())) {
          if (!this.storeDbDocRegistry.has(cacheKey)) {
            const indexedAt = doc.last_indexed_at
              ? new Date(doc.last_indexed_at)
              : new Date(doc.file_metadata.created_at);
            const size = BigInt(Number.parseInt(doc.file_metadata.size_bytes));
            const docUri = this.xaiURI(storeRef, doc.file_metadata.file_id);
            const state = this.xaiToDbState[doc.status];
            totalBytes += size;
            newDocArr.push({
              attachmentId: doc.fields.attachmentId,
              docRef: doc.file_metadata.file_id,
              docUri,
              filename: doc.file_metadata.name,
              indexedAt,
              lastAccessed: indexedAt,
              mimeType: doc.file_metadata.content_type,
              state,
              storeId: storeDbId,
              provider: "GROK",
              size
            } satisfies CreatManyGrokProviderStoreDocSingleton);
          }
        }
        const res = await this.prisma.createManyGrokProviderDocs({
          data: newDocArr,
          storeRef,
          totalBytes,
          userId
        });
        for (const dbDoc of res) {
          this.storeDbDocRegistry.set(dbDoc.attachmentId, dbDoc);
        }
      }
      if (this.storeDbDocRegistry.size > this.docCache.size) {
        const xaiDocsToIndex = Array.of<xAIDocDbRegistryProps>();
        for (const [storeKey, storeDoc] of Array.from(
          this.storeDbDocRegistry.entries()
        )) {
          if (!this.docCache.has(storeKey)) {
            xaiDocsToIndex.push(storeDoc);
          }
        }
        const exists = Array.of<{ attId: string; file_id: string }>();
        // ensure xai actually has the record on file before executing promotion
        for (const dbDoc of xaiDocsToIndex) {
          const res = await this.getFileById(dbDoc.docRef, apiKey);
          if (res.ok) {
            exists.push({ attId: dbDoc.attachmentId, file_id: res.file.id });
          } else {
            // else it returns an error in the response, no regular xai file exists
            // purge db stores and in memory caches
            if (this.fileCache.has(dbDoc.attachmentId)) {
              this.fileCache.delete(dbDoc.attachmentId);
            }
            if (this.fileDbRegistry.has(dbDoc.attachmentId)) {
              const fileDb = this.fileDbRegistry.get(dbDoc.attachmentId);
              if (fileDb?.id) {
                await this.prisma.removeFileAttachmentProvider(fileDb.id);
                this.fileDbRegistry.delete(dbDoc.attachmentId);
              }
            }
            await this.prisma.removeDocFromProviderStore("GROK", userId, dbDoc);
            this.storeDbDocRegistry.delete(dbDoc.attachmentId);
          }
        }
        if (exists.length > 0) {
          for (const rec of exists) {
            // double check *to be 100% certain* before trying to promote a file that may already be indexed
            const getAtt = await this.prisma.getTargetedAtt(rec.attId);
            const findByName = await this.getDocByCollectionAndName(
              storeRef,
              getAtt,
              managementKey
            );
            const isInArr =
              findByName.documents.findLastIndex(
                t => t.file_metadata.file_id === rec.file_id
              ) === -1;
            if (isInArr) {
              const retrieveFile = await this.getDocByCollectionAndId(
                storeRef,
                rec.file_id,
                managementKey
              );
              this.docCache.set(rec.attId, retrieveFile);
            } else {
              const displayName = this.prisma.toVectorStoreFilename(getAtt);
              const promoteAndGo = await this.promoteDocWithPolling(
                storeRef,
                userId,
                rec.file_id,
                displayName,
                true,
                managementKey
              );
              this.docCache.set(rec.attId, promoteAndGo.doc);
            }
          }
        }
      }
    }
  }

  protected async ensureUserCollection(
    userId: string,
    managementKey = this.xaiManagementKey
  ) {
    let collectionId = this.collectionRegistry.get(userId);
    let storeDbId = this.storeDbRegistry.get(userId);
    if (collectionId && storeDbId) {
      return {
        collectionId,
        storeDbId
      };
    }

    const collection = await this.resolveCollection(userId, managementKey);

    if (collection.hasStore) {
      collectionId = collection.store.collection_id;
      this.collectionRegistry.set(userId, collectionId);

      const storeInfo = await this.prisma.vectorStoreInfoByProvider(
        userId,
        "GROK"
      );
      if (storeInfo.hasStore) {
        storeDbId = storeInfo.dbId;
      } else {
        const dbStore = await this.prisma.createProviderVectorStore(
          "GROK",
          userId,
          collectionId,
          collection.store.collection_name,
          collection.store.created_at,
          collection.store.created_at,
          0,
          0n
        );
        storeDbId = dbStore.id;
      }
      this.storeDbRegistry.set(userId, storeDbId);
      return { collectionId, storeDbId };
    }
    const { dbData, xaiData } = await this.createUserCollection(
      userId,
      managementKey
    );
    return {
      collectionId: xaiData.collection_id,
      storeDbId: dbData.id
    };
  }

  protected async getUserCollectionIdWithFallback(
    userId: string,
    mgmtApiKey = this.xaiManagementKey
  ) {
    try {
      const d = await this.ensureUserCollection(userId, mgmtApiKey);
      const collectionId = d.collectionId;
      return collectionId;
    } catch (err) {
      throw new Error(this.prisma.safeErrMsg(err));
    }
  }

  public async syncGrokWithGuard(
    userId: string,
    mgmtKey = this.xaiManagementKey
  ) {
    let o = true;
    try {
      for await (const x of this.getAllCollections(10, mgmtKey)) {
        if (x.data.length > 0) o = true;
        else {
          this.logger.info(
            "xAI syncWithGuard no collections returned, aborting..."
          );
          o = false;
        }
        break;
      }
    } catch (err) {
      this.logger.error(err, "err in xAI syncWithGuard");
    }
    if (o === true) {
      return await this.syncFileRegistry(userId, false, mgmtKey);
    } else return;
  }

  public async syncFileRegistry(
    userId: string,
    cleanupStaleFiles = false,
    mgmtKey = this.xaiManagementKey
  ) {
    this.collectionRegistry.clear();
    this.storeDbRegistry.clear();
    this.docCache.clear();
    this.fileCache.clear();
    this.fileDbRegistry.clear();
    this.storeDbDocRegistry.clear();

    const key = await this.prisma.resolveApiKey(userId, this.xaiKey, "grok");
    let collection_id: string;
    let storeDbId: string;
    let [collectionData, storeDbData] = await Promise.all([
      this.resolveCollection(userId, mgmtKey),
      this.prisma.vectorStoreInfoByProvider(userId, "GROK")
    ]);

    if (collectionData.hasStore === false) {
      const { dbData, xaiData } = await this.createUserCollection(
        userId,
        mgmtKey
      );
      collectionData.store = xaiData;
      collection_id = xaiData.collection_id;
      storeDbData = {
        totalBytes: 0,
        dbId: dbData.id,
        fileCount: dbData.fileCount,
        hasStore: true,
        provider: "GROK",
        storeName: xaiData.collection_name,
        storeRef: xaiData.collection_id
      };
    } else {
      collection_id = collectionData.store.collection_id;
      this.collectionRegistry.set(userId, collection_id);
    }

    if (!storeDbData?.dbId) {
      if (collectionData.hasStore) {
        const dbData = await this.prisma.createProviderVectorStore(
          "GROK",
          userId,
          collectionData.store.collection_id,
          collectionData.store.collection_name,
          collectionData.store.created_at,
          collectionData.store.created_at,
          collectionData.store.documents_count,
          0n
        );
        collection_id = collectionData.store.collection_id;
        storeDbId = dbData.id;
        storeDbData = {
          totalBytes: dbData.totalBytes ?? 0,
          dbId: dbData.id,
          fileCount: dbData.fileCount,
          hasStore: true,
          provider: "GROK",
          storeName: collectionData.store.collection_name,
          storeRef: collection_id
        };
        this.storeDbRegistry.set(userId, dbData.id);
        this.collectionRegistry.set(userId, collection_id);
      } else {
        const { dbData, xaiData } = await this.createUserCollection(
          userId,
          mgmtKey
        );
        storeDbId = dbData.id;
        collectionData.store = xaiData;
        collection_id = xaiData.collection_id;
        storeDbData = {
          totalBytes: 0,
          dbId: dbData.id,
          fileCount: dbData.fileCount,
          hasStore: true,
          provider: "GROK",
          storeName: xaiData.collection_name,
          storeRef: collection_id
        };
      }
    } else {
      storeDbId = storeDbData.dbId;
      this.storeDbRegistry.set(userId, storeDbId);
    }

    if (storeDbData.hasStore) {
      this.storeDbRegistry.set(userId, storeDbData.dbId);
    }

    const [hasProviderFiles, hasProviderStoreDocs] = await Promise.all([
      this.prisma.hasProviderMessages(userId, "GROK"),
      this.prisma.hasProviderStoreDocs(userId, "GROK")
    ]);
    if (hasProviderFiles) {
      await Promise.all([
        this.syncFilesDbRegistry(userId),
        this.syncFilesRegistry(key)
      ]);
      this.fileRegistriesEq();
    }
    if (hasProviderStoreDocs) {
      await Promise.all([
        this.syncProviderStoreDbDocs(userId),
        this.syncCollectionDocs(collection_id, mgmtKey)
      ]);
      await this.docRegistriesEq(
        userId,
        collection_id,
        storeDbId,
        key,
        mgmtKey
      );
    }

    this.lastRegistrySync = new Date();
    console.info(
      `xAI in memory cache sync complete: \n FileCache: ${this.fileCache.size} \n FileDbCache: ${this.fileDbRegistry.size} \n DocCache: ${this.docCache.size} \n DocDbCache: ${this.storeDbDocRegistry.size}`
    );

    // do not use until refactored
    if (cleanupStaleFiles) {
      void this.cleanupStaleFiles(collection_id, userId, key, mgmtKey);
    }

    return {
      synced: true,
      totalFiles: this.fileCache.size,
      totalDbFiles: this.fileDbRegistry.size,
      titalDocs: this.docCache.size,
      totalDbDocs: this.storeDbDocRegistry.size,
      lastSync: this.lastRegistrySync,
      collectionExists: true,
      collection_id
    } as const;
  }

  /**
   * TODO
   *
   * massively overhaul this method once db migration is complete
   * following attachment provider <-> provider store decoupling
   */
  private async cleanupStaleFiles(
    collectionId: string,
    userId: string,
    key = this.xaiKey,
    managementKey = this.xaiManagementKey
  ) {
    const STALE_THRESHOLD_MS = 120 * 365.25 * 24 * 60 * 60 * 1000; // 120 years
    const now = Date.now();

    const filesToDelete = Array.of<{
      fileId: string;
      attachmentId: string;
      dbId: string;
    }>();

    for (const [attachmentId, cached] of this.fileDbRegistry.entries()) {
      const lastAccessed = cached.lastCheckedAt?.getTime() ?? 0;
      if (now - lastAccessed > STALE_THRESHOLD_MS) {
        filesToDelete.push({
          fileId: cached.providerRef,
          attachmentId,
          dbId: cached.id
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

    // Then delete from xAI collections API (unlink from collection, then delete file)
    for (const { fileId, attachmentId } of filesToDelete) {
      await this.unlinkDocFromStoreAndDeleteFileFromRemote(
        userId,
        attachmentId,
        collectionId,
        fileId,
        key,
        managementKey
      );
    }

    console.info(
      `xAI cleanup complete: ${filesToDelete.length} files removed for user ${userId}`
    );
  }
}

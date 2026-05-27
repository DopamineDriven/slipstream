import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type {
  FilesDbRegistryProps,
  xAIDocDbRegistryProps
} from "@/xai/types.ts";
import { GrokSyncService } from "@/xai/sync.ts";
import type { AttachmentSingleton } from "@slipstream/types";

export class GrokCollectionsService extends GrokSyncService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    xaiKey: string,
    xaiManagementKey: string
  ) {
    super(logger, prisma, xaiKey, xaiManagementKey);
  }

  protected async ensureXaiFile(
    att: AttachmentSingleton<true>,
    keyFingerprint = "server",
    xaiApiKey = this.xaiKey
  ) {
    const xaiFileCache = this.fileCache.get(att.id);
    const dbFileCache = this.fileDbRegistry.get(att.id);
    if (dbFileCache && xaiFileCache) return xaiFileCache.id;
    else if (dbFileCache && !xaiFileCache) {
      const file_id = dbFileCache.providerRef;
      const checkApi = await this.getFileById(file_id, xaiApiKey);
      if (checkApi.ok) {
        this.fileCache.set(att.id, checkApi.file);
        return checkApi.file.id;
      } else {
        // remove from db (Does not Exist Remotely)
        await this.prisma.removeFileAttachmentProvider(dbFileCache.id);
        this.fileDbRegistry.delete(att.id);
        const createFileXai = await this.streamUploadFileWorkup(att, xaiApiKey);
        this.fileCache.set(att.id, createFileXai);
        const { mime } = this.prisma.urlExtWorkupEmbeddings(att);
        const createAttProviderFile = await this.prisma.upsertGrokAssetMapping(
          att.id,
          keyFingerprint,
          mime,
          createFileXai.id,
          keyFingerprint,
          BigInt(createFileXai.bytes),
          new Date(createFileXai.created_at)
        );
        const rec = {
          ...createAttProviderFile,
          isExpired: false,
          providerRef: createFileXai.id
        } satisfies FilesDbRegistryProps;
        this.fileDbRegistry.set(att.id, rec);
        return createFileXai.id;
      }
    } else if (xaiFileCache && !dbFileCache) {
      const dbExists = await this.prisma.hasProviderAttachmentFile(
        att.id,
        xaiFileCache.id,
        "GROK"
      );
      if (dbExists) {
        const getFile = await this.prisma.getProviderAttachmentFile(
          att.id,
          keyFingerprint,
          "GROK"
        );
        const rec = {
          ...getFile,
          isExpired: false,
          providerRef: xaiFileCache.id
        } satisfies FilesDbRegistryProps;
        this.fileDbRegistry.set(att.id, rec);
        return xaiFileCache.id;
      } else {
        const { mime } = this.prisma.urlExtWorkupEmbeddings(att);
        const createFile = await this.prisma.upsertGrokAssetMapping(
          att.id,
          keyFingerprint,
          mime,
          xaiFileCache.id,
          keyFingerprint,
          BigInt(xaiFileCache.bytes),
          new Date(xaiFileCache.created_at)
        );
        const rec = {
          ...createFile,
          isExpired: false,
          providerRef: xaiFileCache.id
        } satisfies FilesDbRegistryProps;
        this.fileDbRegistry.set(att.id, rec);
        return xaiFileCache.id;
      }
    } else {
      const file = await this.streamUploadFileWorkup(att, xaiApiKey);
      this.fileCache.set(att.id, file);
      const { mime } = this.prisma.urlExtWorkupEmbeddings(att);
      const createFile = await this.prisma.upsertGrokAssetMapping(
        att.id,
        keyFingerprint,
        mime,
        file.id,
        keyFingerprint,
        BigInt(file.bytes),
        new Date(file.created_at)
      );
      const rec = {
        ...createFile,
        isExpired: false,
        providerRef: file.id
      } satisfies FilesDbRegistryProps;
      this.fileDbRegistry.set(att.id, rec);
      return file.id;
    }
  }

  protected async ensureXaiDoc(
    att: AttachmentSingleton<true>,
    collection_id: string,
    storeDbId: string,
    file_id: string,
    xaiManagementKey = this.xaiManagementKey
  ) {
    const xaiDocCache = this.docCache.get(att.id);
    const dbDocCache = this.storeDbDocRegistry.get(att.id);
    const dbExists = await this.prisma.hasProviderStoreDocument(
      att.id,
      file_id,
      storeDbId,
      "GROK"
    );
    if (!xaiDocCache && !dbDocCache) {
      const probeWithName = await this.getDocByCollectionAndName(
        collection_id,
        att,
        xaiManagementKey
      );
      const fileIndex = probeWithName.documents.findLastIndex(
        o => o.file_metadata.file_id === file_id
      );

      if (fileIndex === -1) {
        const { docDb, docXai } = await this.promoteFileBgAndCreateDbDoc(
          att,
          collection_id,
          storeDbId,
          file_id,
          xaiManagementKey
        );
        return this.xaiURI(docDb.storeRef, docXai.file_metadata.file_id);
      } else {
        const retrievedFile = probeWithName.documents.at(fileIndex);
        if (retrievedFile) {
          this.docCache.set(att.id, retrievedFile);
          if (dbExists) {
            const rec = await this.prisma.getProviderStoreDoc(
              att.id,
              storeDbId
            );
            const obj = {
              ...rec,
              storeRef: collection_id,
              storeId: storeDbId
            } satisfies xAIDocDbRegistryProps;
            this.storeDbDocRegistry.set(att.id, obj);
            return this.xaiURI(collection_id, file_id);
          }
          const rec = await this.prisma.upsertGrokProviderDoc({
            attachmentId: att.id,
            docRef: retrievedFile.file_metadata.file_id,
            docUri: this.xaiURI(
              collection_id,
              retrievedFile.file_metadata.file_id
            ),
            filename: retrievedFile.file_metadata.name,
            last_indexed_at: retrievedFile.last_indexed_at
              ? new Date(retrievedFile.last_indexed_at)
              : new Date(retrievedFile.file_metadata.created_at),
            mimeType: retrievedFile.file_metadata.content_type,
            state: this.xaiToDbState[retrievedFile.status],
            storeId: storeDbId,
            storeRef: collection_id,
            userId: att.userId,
            size: BigInt(
              Number.parseInt(retrievedFile.file_metadata.size_bytes)
            )
          });
          this.storeDbDocRegistry.set(att.id, rec);
          return this.xaiURI(collection_id, file_id);
        }
      }
    }
    if (xaiDocCache && !dbDocCache) {
      if (dbExists) {
        const rec = await this.prisma.getProviderStoreDoc(att.id, storeDbId);
        const obj = {
          ...rec,
          storeRef: collection_id,
          storeId: storeDbId
        } satisfies xAIDocDbRegistryProps;
        this.storeDbDocRegistry.set(att.id, obj);
        return this.xaiURI(collection_id, file_id);
      } else {
        const rec = await this.prisma.upsertGrokProviderDoc({
          attachmentId: att.id,
          docRef: xaiDocCache.file_metadata.file_id,
          docUri: this.xaiURI(collection_id, xaiDocCache.file_metadata.file_id),
          filename: xaiDocCache.file_metadata.name,
          last_indexed_at: xaiDocCache.last_indexed_at
            ? new Date(xaiDocCache.last_indexed_at)
            : new Date(Date.now()),
          mimeType: xaiDocCache.file_metadata.content_type,
          state: this.xaiToDbState[xaiDocCache.status],
          storeId: storeDbId,
          storeRef: collection_id,
          userId: att.userId,
          size: BigInt(Number.parseInt(xaiDocCache.file_metadata.size_bytes))
        });
        this.storeDbDocRegistry.set(att.id, rec);
        return this.xaiURI(collection_id, file_id);
      }
    }
    if (!xaiDocCache && dbDocCache) {
      const probeWithName = await this.getDocByCollectionAndName(
        collection_id,
        att,
        xaiManagementKey
      );
      const fileIndex = probeWithName.documents.findLastIndex(
        o => o.file_metadata.file_id === file_id
      );

      if (fileIndex === -1) {
        const { docDb, docXai } = await this.promoteFileBgAndCreateDbDoc(
          att,
          collection_id,
          storeDbId,
          file_id,
          xaiManagementKey
        );
        return this.xaiURI(docDb.storeRef, docXai.file_metadata.file_id);
      }
    }
    if (!xaiDocCache && dbDocCache) {
      // stale record
      if (dbExists) {
        const rec = await this.prisma.getProviderStoreDoc(att.id, storeDbId);
        const obj = {
          ...rec,
          storeRef: collection_id,
          storeId: storeDbId
        } satisfies xAIDocDbRegistryProps;
        await this.prisma.removeDocFromProviderStore("GROK", att.userId, obj);
        this.storeDbDocRegistry.delete(att.id);
        const { docDb, docXai } = await this.promoteFileBgAndCreateDbDoc(
          att,
          collection_id,
          storeDbId,
          file_id,
          xaiManagementKey
        );
        return this.xaiURI(docDb.storeRef, docXai.file_metadata.file_id);
      } else {
        this.storeDbDocRegistry.delete(att.id);
        const { docDb, docXai } = await this.promoteFileBgAndCreateDbDoc(
          att,
          collection_id,
          storeDbId,
          file_id,
          xaiManagementKey
        );
        return this.xaiURI(docDb.storeRef, docXai.file_metadata.file_id);
      }
    }
    return this.xaiURI(collection_id, file_id);
  }

  protected async ensureXaiAssetUploaded(
    attachment: AttachmentSingleton<true>,
    keyFingerprint = "server",
    _keyId = keyFingerprint,
    xaiApiKey = this.xaiKey,
    mgmtKey = this.xaiManagementKey
  ) {
    const fileId = await this.ensureXaiFile(
      attachment,
      keyFingerprint,
      xaiApiKey
    );

    const { collectionId, storeDbId } = await this.ensureUserCollection(
      attachment.userId,
      mgmtKey
    );

    void this.ensureXaiDoc(
      attachment,
      collectionId,
      storeDbId,
      fileId,
      mgmtKey
    ).catch(err => {
      this.logger.warn(
        { attachmentId: attachment.id, err: this.prisma.safeErrMsg(err) },
        "Background xAI doc indexing failed"
      );
    });

    const fileDb = this.fileDbRegistry.get(attachment.id);
    if (fileDb?.id) {
      void this.markFileAccessed(attachment.id, fileDb.id, fileId);
    }

    return { fileId, docUri: this.xaiURI(collectionId, fileId) };
  }
}

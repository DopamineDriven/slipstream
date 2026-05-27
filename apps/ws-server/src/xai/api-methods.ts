import { createReadStream } from "node:fs";
import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { CollectionDocument, UploadFileRT } from "@/xai/types.ts";
import type { AttachmentSingleton } from "@slipstream/types";
import { GrokApiWorkupService } from "./api-workup.ts";

export class GrokApiMethodsService extends GrokApiWorkupService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    xaiKey: string,
    xaiManagementKey: string
  ) {
    super(logger, prisma, xaiKey, xaiManagementKey);
  }
  protected async pollDocumentIndexing(
    collectionId: string,
    userId: string,
    file_id: string,
    managementKey = this.xaiManagementKey,
    pollIntervalMs = 3000,
    maxAttempts = 20
  ) {
    let attempts = 1;
    let doc = await this.getDocByCollectionAndId(
      collectionId,
      file_id,
      managementKey
    );
    // set cache immediately, update after polling (regardless of stash'n'dash or nice'n'slow)
    this.docCache.set(doc.fields.attachmentId, doc);
    while (!this.isTerminalDocStatus(doc.status) && attempts < maxAttempts) {
      await new Promise(resolve =>
        setTimeout(resolve, this.pollingDelay(pollIntervalMs, attempts))
      );

      doc = await this.getDocByCollectionAndId(
        collectionId,
        file_id,
        managementKey
      );

      attempts++;
    }
    this.docCache.set(doc.fields.attachmentId, doc);
    const result = doc;
    const storeDbId = this.storeDbRegistry.get(userId);
    if (storeDbId) {
      const dbUpsert = await this.prisma.upsertGrokProviderDoc({
        attachmentId: doc.fields.attachmentId,
        docRef: doc.file_metadata.file_id,
        docUri: this.xaiURI(collectionId, result.file_metadata.file_id),
        filename: doc.file_metadata.name,
        last_indexed_at: doc.last_indexed_at
          ? new Date(doc.last_indexed_at)
          : new Date(doc.file_metadata.created_at),
        mimeType: doc.file_metadata.content_type,
        state: this.xaiToDbState[doc.status],
        storeId: storeDbId,
        storeRef: collectionId,
        userId: userId,
        size: BigInt(Number.parseInt(doc.file_metadata.size_bytes))
      });
      this.storeDbDocRegistry.set(dbUpsert.attachmentId, dbUpsert);
    }
    if (doc.status === "DOCUMENT_STATUS_FAILED") {
      return {
        ok: false,
        doc
      } as const;
    } else {
      return {
        ok: true,
        doc
      } as const;
    }
  }

  protected async promoteDocWithPolling(
    collectionId: string,
    userId: string,
    file_id: string,
    xaiFilename: string,
    fireAndForget: true,
    managementKey?: string,
    pollIntervalMs?: number,
    maxAttempts?: number
  ): Promise<{
    readonly ok: true;
    readonly doc: CollectionDocument;
  }>;
  protected async promoteDocWithPolling(
    collectionId: string,
    userId: string,
    file_id: string,
    xaiFilename: string,
    fireAndForget: false,
    managementKey?: string,
    pollIntervalMs?: number,
    maxAttempts?: number
  ): Promise<
    | {
        readonly ok: true;
        readonly doc: CollectionDocument;
      }
    | {
        readonly ok: false;
        readonly doc: CollectionDocument;
      }
  >;
  protected async promoteDocWithPolling(
    collectionId: string,
    userId: string,
    file_id: string,
    xaiFilename: string,
    fireAndForget: boolean,
    managementKey = this.xaiManagementKey,
    pollIntervalMs = 3000,
    maxAttempts = 20
  ) {
    try {
      await this.promoteToCollection(
        file_id,
        collectionId,
        xaiFilename,
        managementKey
      );
    } catch (err) {
      throw new Error(this.prisma.safeErrMsg(err));
    } finally {
      if (fireAndForget === true) {
        const doc = await this.getDocByCollectionAndId(collectionId, file_id);
        this.docCache.set(doc.fields.attachmentId, doc);
        void this.pollDocumentIndexing(
          collectionId,
          userId,
          file_id,
          managementKey,
          pollIntervalMs,
          maxAttempts
        );
        return {
          ok: true,
          doc
        } as const;
      } else {
        return await this.pollDocumentIndexing(
          collectionId,
          userId,
          file_id,
          managementKey,
          pollIntervalMs,
          maxAttempts
        );
      }
    }
  }

  protected async streamUploadFileWorkup(
    att: AttachmentSingleton<true>,
    key = this.xaiKey
  ) {
    const { absTmpPath, tmpUniquename } = await this.prisma.fetchRemoteToTmp(
      "GROK",
      att
    );
    try {
      const formData = new FormData();

      const arr = Array.of<Buffer>();

      const rs = createReadStream(absTmpPath);

      const iterate = rs.iterator() as NodeJS.AsyncIterator<
        Buffer,
        undefined,
        any
      >;

      const displayName = this.prisma.toVectorStoreFilename(att);

      for await (const chunk of iterate) {
        arr.push(chunk);
      }

      const buf = Buffer.concat(arr);

      formData.append("file", new Blob([buf]), displayName);

      formData.append("purpose", "assistants");

      const { promise, resolve } = Promise.withResolvers<Response>();

      resolve(this.uploadFile(formData, key));

      return promise.then(async res => {
        console.log(res.ok);
        const data = await res.json<UploadFileRT>();
        return data;
      });
    } catch (err) {
      console.error(this.prisma.safeErrMsg(err));
      throw new Error(this.prisma.safeErrMsg(err));
    } finally {
      this.prisma.cleanupTmpPostupload("GROK", absTmpPath, tmpUniquename);
    }
  }

  protected async uploadFileAndPromoteToCollection(
    att: AttachmentSingleton<true>,
    apiKey = this.xaiKey,
    mgmtKey = this.xaiManagementKey
  ) {
    const collectionObj = { storeRef: undefined, dbId: "" } as {
      storeRef: string | undefined;
      dbId: string;
    };

    const toFilename = this.prisma.toVectorStoreFilename(att);

    const res = await this.streamUploadFileWorkup(att, apiKey);

    if (!res?.id) {
      throw new Error(
        "no id returned with results ".concat(JSON.stringify(res, null, 2))
      );
    }

    this.fileCache.set(att.id, res);

    const keyId = await this.prisma.getUserKeyIdByProvider(att.userId, "GROK");
    const { mime } = this.prisma.urlExtWorkupEmbeddings(att);
    const fileDbSync = await this.prisma.upsertGrokAssetMapping(
      att.id,
      keyId,
      mime,
      res.id,
      keyId,
      BigInt(res.bytes),
      new Date(res.created_at)
    );
    this.fileDbRegistry.set(att.id, {
      ...fileDbSync,
      provider: "GROK",
      isExpired: false,
      providerRef: res.id
    });

    collectionObj.storeRef = this.collectionRegistry.get(att.userId);
    if (!collectionObj.storeRef) {
      const collection = await this.resolveCollection(att.userId, mgmtKey);
      if (collection.hasStore === true) {
        this.collectionRegistry.set(att.userId, collection.store.collection_id);
        collectionObj.storeRef = collection.store.collection_id;
      } else {
        const createRes = await this.createUserCollection(att.userId, mgmtKey);
        collectionObj.storeRef = createRes.xaiData.collection_id;
        collectionObj.dbId = createRes.dbData.id;
      }
    }

    try {
      const result = await this.promoteDocWithPolling(
        collectionObj.storeRef,
        att.userId,
        res.id,
        toFilename,
        true,
        mgmtKey
      );
      if (result.ok === true && collectionObj.storeRef) {
        this.docCache.set(att.id, result.doc);
        const dbDocData = await this.prisma.upsertGrokProviderDoc({
          attachmentId: att.id,
          docRef: result.doc.file_metadata.file_id,
          docUri: this.xaiURI(
            collectionObj.storeRef,
            result.doc.file_metadata.file_id
          ),
          filename: result.doc.file_metadata.name,
          last_indexed_at: result.doc.last_indexed_at
            ? new Date(result.doc.last_indexed_at)
            : new Date(result.doc.file_metadata.created_at),
          mimeType: result.doc.file_metadata.content_type,
          state: this.xaiToDbState[result.doc.status],
          storeId: collectionObj.dbId,
          storeRef: collectionObj.storeRef,
          userId: att.userId,
          size: BigInt(Number.parseInt(result.doc.file_metadata.size_bytes))
        });
        this.storeDbDocRegistry.set(att.id, dbDocData);
      }
    } catch (err) {
      throw new Error(this.prisma.safeErrMsg(err));
    } finally {
      return res;
    }
  }

  protected async unlinkDocFromStoreAndDeleteFileFromRemote(
    userId: string,
    attachmentId: string,
    collectionId: string,
    fileId: string,
    key = this.xaiKey,
    managementKey = this.xaiManagementKey
  ) {
    try {
      const deleteRes = await this.deleteFileFromXAI(
        userId,
        attachmentId,
        collectionId,
        fileId,
        key,
        managementKey
      );

      if (deleteRes.deleted && this.fileCache.has(attachmentId)) {
        this.fileCache.delete(attachmentId);
        const dbId = this.fileDbRegistry.get(attachmentId);

        if (dbId?.id) {
          const hasFile = await this.prisma.hasProviderAttachmentFile(
            attachmentId,
            deleteRes.id,
            "GROK"
          );
          if (hasFile) {
            await this.prisma.removeFileAttachmentProvider(dbId.id);
            this.fileDbRegistry.delete(attachmentId);
          }
        }
      }
      this.logger.debug({ fileId, attachmentId }, "Deleted xAI file");
      return {
        id: fileId,
        success: true
      } as const;
    } catch (error) {
      this.logger.warn({ error, fileId }, "Failed to delete xAI file");
      return {
        id: fileId,
        success: false
      } as const;
    }
  }

  protected async promoteFileBgAndCreateDbDoc(
    att: AttachmentSingleton<true>,
    collection_id: string,
    storeDbId: string,
    file_id: string,
    xaiManagementKey = this.xaiManagementKey
  ) {
    const displayName = this.prisma.toVectorStoreFilename(att);

    const promoteDocBg = await this.promoteDocWithPolling(
      collection_id,
      att.userId,
      file_id,
      displayName,
      // (true==="stash'n'dash") | (false==="soft'n'slow")
      true,
      xaiManagementKey
    );

    this.docCache.set(att.id, promoteDocBg.doc);

    const {
      name,
      file_id: fileId,
      created_at,
      size_bytes,
      content_type
    } = promoteDocBg.doc.file_metadata;

    const rec = await this.prisma.upsertGrokProviderDoc({
      attachmentId: att.id,
      docRef: fileId,
      docUri: this.xaiURI(collection_id, fileId),
      filename: name,
      last_indexed_at: promoteDocBg.doc.last_indexed_at
        ? new Date(promoteDocBg.doc.last_indexed_at)
        : new Date(created_at),
      mimeType: content_type,
      state: this.xaiToDbState[promoteDocBg.doc.status],
      storeId: storeDbId,
      storeRef: collection_id,
      userId: att.userId,
      size: BigInt(Number.parseInt(size_bytes))
    });
    this.storeDbDocRegistry.set(att.id, rec);
    return { docDb: rec, docXai: promoteDocBg.doc };
  }
}

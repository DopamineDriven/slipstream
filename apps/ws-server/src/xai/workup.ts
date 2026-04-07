import { createReadStream } from "node:fs";
import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type {
  Collection,
  CollectionDocument,
  CreateCollectionRequest,
  CreatManyGrokProviderStoreDocSingleton,
  DeleteXaiFileResponse,
  DocumentStatus,
  FieldDefinition,
  FileErrorRT,
  FilesDbRegistryProps,
  GetDocumentsByCollectionId,
  GetFilesRT,
  ListCollectionsResponse,
  UploadFileRT,
  xAIDocDbRegistryProps
} from "@/xai/types.ts";
import type { Logger } from "pino";
import type { ProviderDocState } from "@slipstream/db/enums-node";
import type { AttachmentSingleton, GrokModelIdUnion } from "@slipstream/types";

export class GrokWorkupService {
  protected logger: Logger;
  protected readonly baseUrl = "https://api.x.ai/v1/responses";
  protected readonly baseImgGenUrl = "https://api.x.ai/v1/images/generations";

  /**
   * use if image attachments detected -- for grok-imagine-image and grok-imagine-image-pro only
   */
  protected readonly baseImgEditsUrl = "https://api.x.ai/v1/images/edits";
  protected storeDbDocRegistry = new Map<string, xAIDocDbRegistryProps>();
  protected fileDbRegistry = new Map<string, FilesDbRegistryProps>();
  protected fileCache = new Map<string, UploadFileRT>();
  protected docCache = new Map<string, CollectionDocument>();
  protected lastRegistrySync: Date | null = null;
  protected collectionRegistry = new Map<string, string>();
  protected storeDbRegistry = new Map<string, string>();
  constructor(
    logger: LoggerService,
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

  protected xaiURI(collection_id: string, file_id: string) {
    return `collections://${collection_id}/files/${file_id}` as const;
  }
  protected xaiToDbState = {
    DOCUMENT_STATUS_FAILED: "FAILED",
    DOCUMENT_STATUS_PROCESSED: "ACTIVE",
    DOCUMENT_STATUS_PROCESSING: "PROCESSING",
    DOCUMENT_STATUS_UNKNOWN: "PENDING"
  } as const satisfies Record<DocumentStatus, ProviderDocState>;

  protected isMultiAgent(m: GrokModelIdUnion) {
    return m === "grok-4.20-multi-agent-0309";
  }

  protected canUseFunctionTools(m: GrokModelIdUnion) {
    return !this.isMultiAgent(m);
  }

  protected is420BetaModel(m: GrokModelIdUnion) {
    return (
      m === "grok-4.20-0309-reasoning" ||
      m === "grok-4.20-0309-non-reasoning" ||
      this.isMultiAgent(m)
    );
  }

  protected isGrok4Model(m: GrokModelIdUnion) {
    return (
      m === "grok-4-1-fast-non-reasoning" ||
      m === "grok-4-1-fast-reasoning" ||
      m === "grok-4-fast-reasoning" ||
      m === "grok-4-fast-non-reasoning"
    );
  }

  protected isNativeImgModel(m: GrokModelIdUnion) {
    return m === "grok-imagine-image" || m === "grok-imagine-image-pro";
  }

  protected isNativeVideoModel(m: GrokModelIdUnion) {
    return m === "grok-imagine-video";
  }

  protected canViewImgs(model: GrokModelIdUnion) {
    return (
      this.isNativeImgModel(model) ||
      this.isNativeVideoModel(model) ||
      this.isGrok4Model(model) ||
      this.is420BetaModel(model)
    );
  }

  protected canViewDocs(model: GrokModelIdUnion) {
    return this.isGrok4Model(model) || this.is420BetaModel(model);
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

  private async fetchPage(url: URL | string | Request, apiKey = this.xaiKey) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${txt}`);
    }
    return await res.json<GetFilesRT>();
  }

  /**
   * 2026-01-01
   * xai's pagination_token is broken.
   * paginates in place despite passing in the proper `pagination_token`...
   * this results in infinite looping
   *
   * Temporary workaround: set limit to n=2000 and handle defensively
   *
   * using a Set to track pagination_tokens
   *
   * break if previous_pagination_token = current_pagination_token between two consecutive fetches
   */
  private async *getAllFilesxAI(apiKey = this.xaiKey, limit = 2000) {
    let token: string | null = null;
    const seenTokens = new Set<string>();

    for (let pageNumber = 0; ; pageNumber++) {
      const url = new URL("https://api.x.ai/v1/files");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("sort_by", "created_at");
      url.searchParams.set("order", "desc");
      if (token) url.searchParams.set("pagination_token", token);

      const page = await this.fetchPage(url, apiKey);
      const next = page.pagination_token;

      const firstId = page.data?.[0]?.id;
      const lastId = page.data?.[page.data.length - 1]?.id;
      this.logger.info(
        {
          pageNumber,
          token,
          next,
          n: page.data.length,
          firstId,
          lastId
        },
        "xaiFetchAllFiles"
      );

      yield page;

      if (next == null) break;
      if (next === token) break;
      if (seenTokens.has(next)) break;
      if (page.data.length === 0) break;

      seenTokens.add(next);
      token = next;
    }
  }

  protected async *getAllCollections(
    limit = 10,
    mgmtKey = this.xaiManagementKey
  ) {
    let has_more = true;
    let count = 0;
    let pagination_token: string | undefined = undefined;
    let page_number = 0;

    while (has_more) {
      const url = pagination_token
        ? `https://management-api.x.ai/v1/collections?limit=${limit}&pagination_token=${pagination_token}`
        : `https://management-api.x.ai/v1/collections?limit=${limit}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mgmtKey}`
        }
      });

      const page = await response.json<ListCollectionsResponse>();

      has_more = typeof page.pagination_token !== "undefined";
      pagination_token = page.pagination_token;
      count += page.collections?.length ?? 0;

      yield {
        data: page.collections,
        count,
        page_number,
        has_more
      };

      page_number += 1;
    }
  }

  protected async *getAllCollectionDocuments(
    collection_id: string,
    limit = 10,
    mgmtKey = this.xaiManagementKey
  ) {
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

  protected async removeDocFromCollection(
    userId: string,
    attachmentId: string,
    collection_id: string,
    file_id: string,
    managementKey = this.xaiManagementKey
  ) {
    const softDelete = await fetch(
      `https://management-api.x.ai/v1/collections/${collection_id}/documents/${file_id}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managementKey}`
        }
      }
    );
    const dbDoc = this.storeDbDocRegistry.get(attachmentId);
    if (softDelete.ok && dbDoc?.id) {
      this.docCache.delete(attachmentId);
      const existsInDb = await this.prisma.hasProviderStoreDocument(
        dbDoc.attachmentId,
        dbDoc.docRef,
        dbDoc.storeId,
        "GROK"
      );
      if (existsInDb) {
        await this.prisma.removeDocFromProviderStore("GROK", userId, dbDoc);
      }
      this.storeDbDocRegistry.delete(attachmentId);
    }
    return softDelete;
  }

  protected async hardDeleteFileRemote(
    ok: boolean,
    file_id: string,
    apiKey = this.xaiKey
  ) {
    if (ok) {
      return await fetch(`https://api.x.ai/v1/files/${file_id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        }
      }).then(d => d.json<DeleteXaiFileResponse>());
    } else {
      throw new Error(
        `removeDocFromCollection error: file_id ${file_id} unable to be unlinked from associated collection, delete file operation aborted`
      );
    }
  }

  protected async deleteFileFromXAI(
    userId: string,
    attachmentId: string,
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
    resolve(
      this.removeDocFromCollection(
        userId,
        attachmentId,
        collection_id,
        file_id,
        mgmtKey
      )
    );
    return promise.then(res => this.hardDeleteFileRemote(res.ok, file_id, key));
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
        unique: true,
        description: "Original attachment ID"
      },
      {
        key: "originalFilename",
        required: true,
        inject_into_chunk: true,
        unique: false,
        description: "Human-readable source filename"
      }
    ] as const satisfies FieldDefinition[];
  }

  protected createUserCollectionWorkup(userId: string) {
    const fieldDefs = this.createUserCollectionFieldDefs;
    const collection_name = this.prisma.vectorStoreDisplayName(userId);
    return {
      chunk_configuration: {
        inject_name_into_chunks: true,
        strip_whitespace: true,
        tokens_configuration: {
          chunk_overlap_tokens: 256,
          encoding_name: "o200k_base",
          max_chunk_size_tokens: 1024
        }
      },
      collection_name,
      index_configuration: { model_name: "grok-embedding-small" },
      field_definitions: fieldDefs,
      metric_space: "HNSW_METRIC_COSINE"
    } as const satisfies CreateCollectionRequest;
  }

  protected async createUserCollection(
    userId: string,
    mgmtKey = this.xaiManagementKey
  ) {
    const res = await fetch("https://management-api.x.ai/v1/collections", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mgmtKey}`
      },
      body: JSON.stringify(this.createUserCollectionWorkup(userId))
    });

    const data = await res.json<Collection>();

    const prismaCreate = await this.prisma.createProviderVectorStore(
      "GROK",
      userId,
      data.collection_id,
      data.collection_name,
      data.created_at,
      data.created_at,
      data.documents_count,
      0n
    );

    this.storeDbRegistry.set(userId, prismaCreate.id);

    this.collectionRegistry.set(userId, data.collection_id);

    return { dbData: prismaCreate, xaiData: data };
  }

  private async pullCollectionRecord(
    userId: string,
    key = this.xaiManagementKey
  ) {
    const displayName = this.prisma.vectorStoreDisplayName(userId);
    for await (const collection of this.getAllCollections(10, key)) {
      for (const store of collection.data) {
        if (store.collection_id && store.collection_name) {
          if (displayName === store.collection_name) {
            return {
              hasStore: true,
              store
            } as const;
          }
        }
      }
    }
    return {
      hasStore: false,
      store: undefined
    } as const as { hasStore: false; store: undefined | Collection };
  }

  protected async resolveCollection(
    userId: string,
    mgmtKey = this.xaiManagementKey
  ) {
    return await this.pullCollectionRecord(userId, mgmtKey);
  }

  private isTerminalDocStatus(status: DocumentStatus) {
    return (
      status === "DOCUMENT_STATUS_FAILED" ||
      status === "DOCUMENT_STATUS_PROCESSED"
    );
  }

  private pollingDelay(pollIntervalMs: number, attempts: number) {
    return Math.min(pollIntervalMs * Math.pow(1.5, attempts), 30000);
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

  protected async getFileById(file_id: string, apiKey = this.xaiKey) {
    const res = await fetch(`https://api.x.ai/v1/files/${file_id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      }
    });
    if (res.ok) {
      const file = await res.json<UploadFileRT>();
      return {
        ok: true,
        file
      } as const;
    } else {
      const file = await res.json<FileErrorRT>();
      return {
        ok: false,
        file
      } as const;
    }
  }

  protected async getDocByCollectionAndName(
    collectionId: string,
    att: AttachmentSingleton<true>,
    managementKey = this.xaiManagementKey
  ) {
    const name = this.prisma.toVectorStoreFilename(att);
    return await fetch(
      `https://management-api.x.ai/v1/collections/${collectionId}/documents?filter=name:${name}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managementKey}`
        }
      }
    ).then(res => res.json<GetDocumentsByCollectionId>());
  }

  protected async getDocByCollectionAndId(
    collectionId: string,
    file_id: string,
    managementKey = this.xaiManagementKey
  ) {
    return await fetch(
      `https://management-api.x.ai/v1/collections/${collectionId}/documents/${file_id}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managementKey}`
        }
      }
    ).then(t => t.json<CollectionDocument>());
  }

  protected async regenerateDocumentIndices(
    collection_id: string,
    file_id: string,
    managementApiKey = this.xaiManagementKey
  ) {
    const res = await fetch(
      `https://management-api.x.ai/v1/collections/${collection_id}/documents/${file_id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${managementApiKey}`
        }
      }
    );
    return await res.json<{}>();
  }

  private async uploadFile(formData: FormData, apiKey = this.xaiKey) {
    return await fetch("https://api.x.ai/v1/files?purpose=assistants", {
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      method: "POST",
      body: formData
    });
  }

  private async updateFilename(
    file_id: string,
    filename: string,
    apiKey = this.xaiKey
  ) {
    const fd = new FormData();
    fd.append("filename", filename);
    return await fetch(`https://api.x.ai/v1/files/${file_id}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      method: "PUT",
      body: fd
    });
  }

  protected async streamUploadFileWorkup(
    att: AttachmentSingleton<true>,
    key = this.xaiKey
  ) {
    const { absTmpPath, tmpUniquename, mime } =
      await this.prisma.fetchRemoteToTmp("GROK", att);
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

      const file = new File([buf], displayName, { type: mime });

      formData.append("file", file);

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

  protected async promoteToCollection(
    documentId: string,
    collectionId: string,
    provenanceId: string,
    mgmtKey = this.xaiManagementKey
  ) {
    const { attachmentId, conversationId, fileName, extension, messageId } =
      this.prisma.parseDocname(provenanceId);
    return await fetch(
      `https://management-api.x.ai/v1/collections/${collectionId}/documents/${documentId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mgmtKey}`
        },
        body: JSON.stringify({
          fields: {
            conversationId,
            messageId,
            attachmentId,
            originalFilename: `${fileName}.${extension}`
          }
        })
      }
    );
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
      const { collectionId } = await this.ensureUserCollection(
        userId,
        mgmtApiKey
      );
      return collectionId;
    } catch (err) {
      throw new Error(this.prisma.safeErrMsg(err));
    }
  }

  protected async markFileAccessed(
    attachmentId: string,
    dbRecordId: string,
    _fileId: string
  ) {
    try {
      const cached = this.fileDbRegistry.get(attachmentId);
      if (cached) {
        const { lastCheckedAt } = await this.prisma.markProviderLastCheckedAt(
          dbRecordId,
          "GROK"
        );
        this.fileDbRegistry.set(attachmentId, {
          ...cached,
          lastCheckedAt
        });
      }
    } catch (error) {
      console.warn(
        `Failed to mark xAI file as accessed ${this.prisma.safeErrMsg(error)}`
      );
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

import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type {
  Collection,
  CollectionDocument,
  CreateCollectionRequest,
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
import { GrokBaseService } from "@/xai/base.ts";
import type { AttachmentSingleton } from "@slipstream/types";

export class GrokApiWorkupService extends GrokBaseService {
  protected logger: Logger;
  protected storeDbDocRegistry = new Map<string, xAIDocDbRegistryProps>();
  protected fileDbRegistry = new Map<string, FilesDbRegistryProps>();
  protected fileCache = new Map<string, UploadFileRT>();
  protected docCache = new Map<string, CollectionDocument>();
  protected lastRegistrySync: Date | null = null;
  protected collectionRegistry = new Map<string, string>();
  protected storeDbRegistry = new Map<string, string>();
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    protected xaiKey: string,
    protected xaiManagementKey: string
  ) {
    super(prisma);
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[grok] " }
      );
  }
  protected async fetchPage(url: URL | string | Request, apiKey = this.xaiKey) {
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
  protected async *getAllFilesxAI(apiKey = this.xaiKey, limit = 2000) {
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

      const page =
        (await response.json<ListCollectionsResponse>()) as ListCollectionsResponse;

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
        ? `${this.managementUrl}/${collection_id}/documents?limit=${limit}&pagination_token=${pagination_token}`
        : `${this.managementUrl}/${collection_id}/documents?limit=${limit}`;

      const response = await fetch(url as string, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mgmtKey}`
        }
      });

      const page = (await response.json()) as GetDocumentsByCollectionId;

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

  protected async getDocByCollectionAndId(
    collectionId: string,
    file_id: string,
    managementKey = this.xaiManagementKey
  ) {
    return await fetch(
      `${this.managementUrl}/${collectionId}/documents/${file_id}`,
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
      `${this.managementUrl}/${collection_id}/documents/${file_id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${managementApiKey}`
        }
      }
    );
    return await res.json<{}>();
  }

  protected async uploadFile(formData: FormData, apiKey = this.xaiKey) {
    return await fetch("https://api.x.ai/v1/files?purpose=assistants", {
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      method: "POST",
      body: formData
    });
  }

  protected async updateFilename(
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

  protected async removeDocFromCollection(
    userId: string,
    attachmentId: string,
    collection_id: string,
    file_id: string,
    managementKey = this.xaiManagementKey
  ) {
    const softDelete = await fetch(
      `${this.managementUrl}/${collection_id}/documents/${file_id}`,
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

  protected async promoteToCollection(
    documentId: string,
    collectionId: string,
    provenanceId: string,
    mgmtKey = this.xaiManagementKey
  ) {
    const { attachmentId, conversationId, fileName, extension, messageId } =
      this.prisma.parseDocname(provenanceId);
    return await fetch(
      `${this.managementUrl}/${collectionId}/documents/${documentId}`,
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
    const res = await fetch(this.managementUrl, {
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

  protected async pullCollectionRecord(
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

  protected async getDocByCollectionAndName(
    collectionId: string,
    att: AttachmentSingleton<true>,
    managementKey = this.xaiManagementKey
  ) {
    const name = this.prisma.toVectorStoreFilename(att);
    return await fetch(
      `${this.managementUrl}/${collectionId}/documents?filter=name:${name}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managementKey}`
        }
      }
    ).then(res => res.json<GetDocumentsByCollectionId>());
  }

  protected isTerminalDocStatus(status: DocumentStatus) {
    return (
      status === "DOCUMENT_STATUS_FAILED" ||
      status === "DOCUMENT_STATUS_PROCESSED"
    );
  }

  protected pollingDelay(pollIntervalMs: number, attempts: number) {
    return Math.min(pollIntervalMs * Math.pow(1.5, attempts), 30000);
  }
}

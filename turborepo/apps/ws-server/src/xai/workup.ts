import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { xAIResponses } from "@/xai/event-types.ts";
import type {
  CodeInterpreterTool,
  FileSearchTool,
  ResponsesContentInputSingleton,
  ToolUnion,
  WebSearchTool,
  XSearchTool
} from "@/xai/responses-types.ts";
import type {
    AssetCache,
  CollectionDocument,
  CreateCollectionRequest,
  DeleteXaiFileResponse,
  DocumentResSingleton,
  FieldDefinition,
  GetDocumentsByCollectionId,
  GetFilesRT,
  ListCollectionsResponse,
  UploadFileRT
} from "@/xai/types.ts";
import { PrismaService } from "@/prisma/index.ts";
import type {
  AttachmentSingleton,
  CTR,
  GrokModelIdUnion
} from "@slipstream/types";
import type { Logger } from "pino";
import { LoggerService } from "@/logger/index.ts";
export class GrokWorkupService {
  protected logger: Logger;
    protected readonly baseUrl = "https://api.x.ai/v1/responses";
    protected readonly baseImgGenUrl = "https://api.x.ai/v1/images/generations";

    /**
     * Asset cache: attachmentId → file metadata
     * Same key as fileRegistry for smooth interop (mirrors Gemini pattern)
     */
    protected assetCache = new Map<string, AssetCache>();

    /**
     * File registry: attachmentId → full xAI document metadata
     * Same key as assetCache for smooth interop (mirrors Gemini pattern)
     */
    protected fileRegistry = new Map<
      string,
      DocumentResSingleton
    >();

    protected lastRegistrySync: Date | null = null;

    /**
     * env: "dev" | "prod"
     * Collection registry: (collection_name=env-userId) userId  → collection_id
     * Avoids repeated collection lookups per user
     */
    protected collectionRegistry = new Map<string, string>();

    /**
     * env: "dev" | "prod"
     * Store DB registry: (collection_name=env-userId) userId → ProviderStore.id
     * Quick lookup for database store record
     */
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

  protected getEnv(isProd: boolean) {
    return isProd === true ? ("prod" as const) : ("dev" as const);
  }

  protected canViewImgs(model: GrokModelIdUnion) {
    return (
      model === "grok-2-vision-1212" ||
      model === "grok-4-0709" ||
      model === "grok-4-1-fast-non-reasoning" ||
      model === "grok-4-fast-reasoning" ||
      model === "grok-4-fast-non-reasoning" ||
      model === "grok-4-1-fast-reasoning"
    );
  }

  protected canViewDocs(model: GrokModelIdUnion) {
    return this.canViewImgs(model);
  }

  protected isImgGenModel(model: GrokModelIdUnion) {
    return model === "grok-2-image-1212";
  }

  protected async assetToTmpWorkup({
    assetType,
    compatStatus,
    conversationId,
    messageId,
    id,
    userId,
    ...rest
  }: AttachmentSingleton<true>) {
    const {
      ext,
      mime,
      url,
      embeddedFilename: xaiFilename
    } = this.prisma.urlExtWorkupEmbeddings({
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

    toTmpWorkupObj.tmpName = this.prisma.extractor.uniqueTmpName(
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

  protected async remoteToTmpWorkup(att: AttachmentSingleton<true>) {
    const {
      absTmpPath,
      ext,
      tmpUniquename,
      tmpFilenamePrefix,
      safeFilename,
      remoteUrl,
      mime: mimeType
    } = await this.assetToTmpWorkup(att);

    await this.prisma.extractor.fetchRemoteWriteLocalLargeFiles(
      remoteUrl,
      absTmpPath,
      false
    );
    if (this.prisma.extractor.exists(absTmpPath)) {
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

  protected cleanupTmpPostupload(absTmpPath: string, tmpUniquename: string) {
    try {
      if (this.prisma.extractor.exists(absTmpPath)) {
        this.prisma.extractor.rmFile(absTmpPath);
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

  protected parseFileSearchResults(
    input: CTR<xAIResponses.OutputItem.Done.FileSearchCall, "results">
  ) {
    const textArr = Array.of<{
      score: number;
      file_id: string;
      text: string;
    }>();
    const aggregate = Array.of<{
      score: number;
      file_id: string;
      originalFilename: string;
      resultBody: string;
      decodedFilename: {
        conversationId: string;
        messageId: string;
        attachmentId: string;
        fileName: string;
        extension: string;
      };
    }>();
    for (const result of input.results) {
      textArr.push({
        score: result.score,
        file_id: result.file_id,
        text: result.text
      });
    }

    for (const { text, file_id, score } of textArr) {
      const tt = text
        .split(/\noriginalFilename:+(.*?)\n/)
        .map(t => t.trimStart());

      const resObj = {
        hexEncodedFilename: "",
        originalFilename: "",
        resultBody: ""
      };

      for (const [ttIndex, ttData] of tt.entries()) {
        if (ttIndex === 0) resObj.hexEncodedFilename = ttData;
        if (ttIndex === 1) resObj.originalFilename = ttData;
        if (ttIndex === 2) resObj.resultBody = ttData;
      }

      const { hexEncodedFilename, ...rest } = resObj;

      const expandedObj = {
        score,
        file_id,
        decodedFilename: this.prisma.parseFilename(hexEncodedFilename),
        ...rest
      };
      aggregate.push(expandedObj);
    }
    return aggregate;
  }

  protected async *getAllUserFiles(limit = 50, apiKey = this.xaiKey) {
    let has_more = true;
    let count = 0;
    let pagination_token: string | undefined = undefined;
    let page_number = 0;

    while (has_more) {
      const url = pagination_token
        ? `https://api.x.ai/v1/files?limit=${limit}&pagination_token=${pagination_token}`
        : `https://api.x.ai/v1/files?limit=${limit}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        }
      });

      const page = await response.json<GetFilesRT>();

      console.info(page);

      has_more = typeof page.pagination_token !== "undefined";
      pagination_token = page.pagination_token;
      count += page.data?.length ?? 0;

      yield {
        page,
        count,
        page_number,
        has_more
      };

      page_number += 1;
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

  protected async removeFileFromCollection(
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

  protected async deleteFileWorkup(
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

  protected async deleteFileFromXAI(
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
    resolve(this.removeFileFromCollection(collection_id, file_id, mgmtKey));
    return promise.then(res => this.deleteFileWorkup(res.ok, file_id, key));
  }

  protected get createUserCollectionFieldDefs() {
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

  protected getCollectionName(userId: string) {
    const env = this.getEnv(this.prisma.isProd);
    const collection_name = `${env}-${userId}`;
    return collection_name;
  }

  protected createUserCollectionWorkup(userId: string) {
    const fieldDefs = this.createUserCollectionFieldDefs;
    const collection_name = this.getCollectionName(userId);
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

  protected async resolveCollection(userId: string, mgmtKey?: string) {
    const managementKey = mgmtKey ?? this.xaiManagementKey;
    const collection_name = this.getCollectionName(userId);
    const fetcher = await fetch(
      `https://management-api.x.ai/v1/collections?filter=collection_name:${collection_name}`,
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

  protected async getFileByCollectionIdAndName(
    collectionId: string,
    att: AttachmentSingleton<true>,
    managementKey?: string
  ) {
    const mgmtKey = managementKey ?? this.xaiManagementKey;
    const name = this.prisma.toVectorStoreFilename(att);
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
    return await res.json<{}>(); // returns '{}' -- poll using getDocumentMetadata after triggering perhaps?
  }

  protected async getDocumentMetadata(
    collection_id: string,
    file_id: string,
    managementApiKey = this.xaiManagementKey
  ) {
    const toPoll = await fetch(
      `https://management-api.x.ai/v1/collections/${collection_id}/documents/${file_id}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${managementApiKey}`
        }
      }
    );
    return await toPoll.json<CollectionDocument>();
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

  protected async streamUploadFileWorkup(
    att: AttachmentSingleton<true>,
    key = this.xaiKey
  ) {
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

      const iterate = rs.iterator() as NodeJS.AsyncIterator<
        Buffer,
        undefined,
        any
      >;

      for await (const chunk of iterate) {
        arr.push(chunk);
      }

      const buf = Buffer.concat(arr);

      const file = new File([buf], safeFilename, { type: mime });

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
      this.cleanupTmpPostupload(absTmpPath, tmpUniquename);
    }
  }

  /**
   * STEP TWO
   */
  protected async promoteToCollection(
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
      extension,
      messageId
    } = this.prisma.parseFilename(xaiFilename);
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
            originalFilename: originalFilename.concat(`.${extension}`)
          }
        })
      }
    );
  }

  protected formatSystemInstruction(isNewChat: boolean, systemPrompt?: string) {
    if (isNewChat) {
      return systemPrompt;
    }

    const note =
      "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";

    return (
      systemPrompt ? `${systemPrompt}\n\n${note}` : note
    ) satisfies ResponsesContentInputSingleton["content"];
  }

  protected resolveResponsesTools(
    collectionId: string | undefined,
    {
      enableFileSearch = true,
      enableWebSearch = false,
      enableXSearch = false,
      enableCodeInterpreter = false,
      fileSearchMaxResults = 5,
      web_enable_image_understanding = true,
      x_enable_image_understanding = true,
      x_enable_video_understanding = true
    }: {
      enableFileSearch?: boolean;
      enableWebSearch?: boolean;
      enableXSearch?: boolean;
      enableCodeInterpreter?: boolean;
      fileSearchMaxResults?: number;
      web_enable_image_understanding?: boolean;
      x_enable_image_understanding?: boolean;
      x_enable_video_understanding?: boolean;
    }
  ) {
    const tools = Array.of<ToolUnion>();

    // Use pre-synced collection from registry (populated on connection)
    if (enableFileSearch && collectionId) {
      if (collectionId) {
        tools.push({
          type: "file_search",
          vector_store_ids: [collectionId],
          max_num_results: fileSearchMaxResults
        } satisfies FileSearchTool);
      }
    }

    if (enableWebSearch) {
      tools.push({
        type: "web_search",
        filters: { enable_image_understanding: web_enable_image_understanding }
      } satisfies WebSearchTool);
    }

    if (enableXSearch) {
      tools.push({
        type: "x_search",
        filters: {
          enable_image_understanding: x_enable_image_understanding,
          enable_video_understanding: x_enable_video_understanding
        }
      } satisfies XSearchTool);
    }

    if (enableCodeInterpreter) {
      tools.push({ type: "code_interpreter" } satisfies CodeInterpreterTool);
    }
    return tools;
  }

  protected canUseServerTools(m: GrokModelIdUnion) {
    return (
      m === "grok-4-0709" ||
      m === "grok-4-1-fast-non-reasoning" ||
      m === "grok-4-1-fast-reasoning" ||
      m === "grok-4-fast-reasoning" ||
      m === "grok-4-fast-non-reasoning"
    );
  }

  /**
   * Model Compatibility
   *
   * Supported Models: grok-4-0709, grok-4-fast-reasoning, grok-4-fast-non-reasoning, grok-4-1-fast-reasoning, grok-4-1-fast-non-reasoning
   *
   * Strongly Recommended: grok-4-1-fast-reasoning (specifically trained to excel at agentic tool calling)
   *
   *
   *
   */
  protected handleTooling(
    model: GrokModelIdUnion,
    collectionId?: string,
    enableFileSearch = true,
    fileSearchMaxResults = 10,
    enableCodeInterpreter = true,
    enableWebSearch = true,
    enableXSearch = false,
    web_enable_image_understanding = true,
    x_enable_image_understanding = true,
    x_enable_video_understanding = true
  ) {
    if (this.canUseServerTools(model)) {
      return this.resolveResponsesTools(collectionId, {
        enableFileSearch,
        fileSearchMaxResults,
        enableCodeInterpreter,
        enableWebSearch,
        enableXSearch,
        web_enable_image_understanding,
        x_enable_image_understanding,
        x_enable_video_understanding
      });
    }
  }
}

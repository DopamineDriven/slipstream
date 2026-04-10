import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { xAIResponses } from "@/xai/event-types.ts";
import type {
  CodeInterpreterTool,
  ContentBlockUnion,
  CreateResponseStreamProps,
  FileContentBlock,
  FunctionCallContext,
  FunctionCallOutput,
  HandleToolUsageParams,
  ImageContentBlock,
  ResponsesApiInputWorkupParams,
  ResponsesComprehensive,
  ResponsesContentInputSingleton,
  ResponsesContentWorkup,
  ResponsesToolsParams,
  SlatherUserStoreTool,
  SlatherUserStoreToolInput,
  TextContentBlock,
  ToolUnion,
  WebSearchTool,
  XSearchTool
} from "@/xai/responses-types.ts";
import type {
  FilesDbRegistryProps,
  xAIDocDbRegistryProps
} from "@/xai/types.ts";
import { ResponsesStreamParser } from "@/xai/response-sse.ts";
import { GrokWorkupService } from "@/xai/workup.ts";
import type {
  AttachmentSingleton,
  CTR,
  GrokModelIdUnion,
  MessageSingleton
} from "@slipstream/types";

export class GrokCollectionsService extends GrokWorkupService {
  protected userStore: UserStoreVectorService;

  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStore: UserStoreVectorService,
    xaiKey: string,
    xaiManagementKey: string
  ) {
    super(logger, prisma, xaiKey, xaiManagementKey);
    this.userStore = userStore;
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

  protected async createResponsesStream({
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
    hasUserStoreDocs,
    management_api_key,
    payload: {
      collectionId,
      round_input,
      tool_choice_input = "auto",
      logprobs,
      imgDetail = "auto",
      enableFileSearch = true,
      fileSearchMaxResults = 5,
      enableCodeInterpreter = true,
      enableWebSearch = true,
      stream = true,
      enableXSearch = false,
      web_enable_image_understanding,
      x_enable_image_understanding,
      x_enable_video_understanding,
      parallel_tool_calls: parallel_tool_calling = true
    }
  }: CreateResponseStreamProps) {
    const key = apiKey ?? this.xaiKey;

    const mgmtApiKey = management_api_key ?? this.xaiManagementKey;
    const collection_id = this.collectionRegistry.get(userId);
    const cId = collection_id ?? collectionId;
    const {
      input,
      instructions,
      reasoning,
      max_output_tokens,
      model,
      parallel_tool_calls = parallel_tool_calling,
      tool_choice,
      store,
      stream: streaming = stream,
      tools,
      user
    } = typeof round_input !== "undefined"
      ? {
          input: round_input,
          instructions: this.formatSystemInstruction(isNewChat, systemPrompt),
          reasoning: undefined,
          max_output_tokens: max_tokens,
          model: (m ?? "grok-4.20-0309-reasoning") as GrokModelIdUnion,
          parallel_tool_calls: parallel_tool_calling,
          tool_choice: tool_choice_input,
          store: false,
          stream,
          tools: this.handleTooling({
            model: (m ?? "grok-4.20-0309-reasoning") as GrokModelIdUnion,
            collectionId: cId,
            enableFileSearch,
            enableUserStoreSearch: hasUserStoreDocs,
            fileSearchMaxResults,
            enableCodeInterpreter,
            enableWebSearch,
            enableXSearch,
            web_enable_image_understanding,
            x_enable_image_understanding,
            x_enable_video_understanding
          }),
          user: userId
        }
      : await this.getResponsesApiInputWorkup({
          isNewChat,
          model: (m ?? "grok-4.20-0309-reasoning") as GrokModelIdUnion,
          userId,
          msgs,
          keyFingerprint: keyId ?? "server",
          systemPrompt,
          max_output_tokens: max_tokens,
          tool_choice: tool_choice_input,
          detail: imgDetail,
          keyId: keyId ?? undefined,
          hasUserStoreDocs,
          reasoning: m && this.isMultiAgent(m) ? { effort: "low" } : undefined,
          apiKey: key,
          managementKey: mgmtApiKey,
          collectionId: cId,
          enableFileSearch,
          enableUserStoreSearch: hasUserStoreDocs,
          fileSearchMaxResults,
          enableCodeInterpreter,
          enableWebSearch,
          enableXSearch,
          web_enable_image_understanding,
          x_enable_image_understanding,
          x_enable_video_understanding,
          parallel_tool_calls: parallel_tool_calling ?? undefined,
          include: ["reasoning.encrypted_content"]
        });

    const requestBody = this.isMultiAgent(model)
      ? {
          reasoning: reasoning ?? { effort: "low" },
          model,
          input,
          store,
          stream: streaming,
          instructions,
          temperature,
          user,
          top_p,
          logprobs,
          max_output_tokens,
          tools,
          include: ["reasoning.encrypted_content"] as const,
          tool_choice,
          parallel_tool_calls
        }
      : ({
          model,
          input,
          store,
          stream: streaming,
          instructions,
          temperature,
          user,
          top_p,
          logprobs,
          max_output_tokens,
          tools,
          include: ["reasoning.encrypted_content"] as const,
          tool_choice,
          parallel_tool_calls
        } satisfies ResponsesContentWorkup);

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

  protected slatherUserStore() {
    return {
      type: "function",
      name: "slather_user_store",
      description:
        "This tool utilizes a 'Partitioned Foraging' approach which recognizes that for the 200,000+ years that humans have existed " +
        "95%+ of it has been as foragers. Agents are trained exclusively on data aggregated/curated by humans; " +
        "think of it as agentic foraging complete with Jaccard similarity scores for cross-analyzing your bounties. " +
        "Slather (search) the user's uploaded documents. Uses semantic similarity by default. " +
        "When search_terms is provided, execjtes fulltext keyword search and returns " +
        "both result sets separately (semantic + fulltext) so you can reason about which signal " +
        "is most relevant to the user's intent. " +
        "Without search_terms: returns a flat JSON array of chunks. " +
        "With search_terms: returns { semantic: [...], fulltext: [...], overlap: { chunkIds, jaccardSimilarity }, meta }. " +
        "Call directly for single retrieval tasks, or from code_execution for multi-step programmatic workflows.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The semantic search query"
          },
          max_results: {
            type: "number",
            description: "Maximum results to return (1-10, default 5)"
          },
          filename: {
            type: "string",
            description:
              "Optional filename filter (fuzzy, case-insensitive). " +
              "Only chunks from documents whose filename closely matches this string are returned. " +
              "Example: 'Path to Hell Pt VIII' matches 'The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-VIII.pdf'."
          },
          search_terms: {
            type: "string",
            description:
              "HIGHLY ENCOURAGED--Optional exact-match search terms for fulltext search. " +
              "Supports quoted phrases and negation (-deprecated). " +
              "When provided, returns partitioned semantic + fulltext results instead of a flat array."
          }
        },
        required: ["query"]
      },
      strict: null
    } as const satisfies SlatherUserStoreTool;
  }

  protected async searchStore(
    userId: string,
    query: string,
    limit = 5,
    threshold = 0,
    filename?: string
  ) {
    return await this.userStore.searchUserStoreChunks({
      userId,
      query,
      limit,
      threshold,
      filename
    });
  }

  protected parseSlatherUserStoreInput(
    rawArguments: string
  ): SlatherUserStoreToolInput {
    const parsed = this.parseSlatherUserStoreArguments(rawArguments);

    if ("query" in parsed && typeof parsed.query === "string") {
      const normalized = parsed.query.trim();
      if (normalized.length > 0) {
        const maxResults =
          "max_results" in parsed && typeof parsed.max_results === "number"
            ? parsed.max_results
            : undefined;

        const filenameInput =
          "filename" in parsed && typeof parsed.filename === "string"
            ? parsed.filename.trim() || undefined
            : undefined;

        const searchTermsInput =
          "search_terms" in parsed && typeof parsed.search_terms === "string"
            ? parsed.search_terms.trim() || undefined
            : undefined;

        return {
          query: normalized,
          max_results: maxResults,
          filename: filenameInput,
          search_terms: searchTermsInput
        } satisfies SlatherUserStoreToolInput;
      }
    }

    const queryList = Array.of<string>();
    if ("queries" in parsed && Array.isArray(parsed.queries)) {
      for (const query of parsed.queries) {
        if (typeof query !== "string") continue;
        const normalized = query.trim();
        if (normalized.length === 0) continue;
        queryList.push(normalized);
      }
    }

    const uniqueQueries = Array.from(new Set(queryList)).slice(0, 5);
    const firstQuery = uniqueQueries[0];
    if (!firstQuery) {
      throw new Error(
        `slather_user_store input missing required "query": ${rawArguments}`
      );
    }

    const maxResults =
      "max_results" in parsed && typeof parsed.max_results === "number"
        ? parsed.max_results
        : undefined;

    const filenameInput =
      "filename" in parsed && typeof parsed.filename === "string"
        ? parsed.filename.trim() || undefined
        : undefined;

    const searchTermsInput =
      "search_terms" in parsed && typeof parsed.search_terms === "string"
        ? parsed.search_terms.trim() || undefined
        : undefined;

    return {
      queries: [firstQuery, ...uniqueQueries.slice(1)] as const,
      max_results: maxResults,
      filename: filenameInput,
      search_terms: searchTermsInput
    } satisfies SlatherUserStoreToolInput;
  }

  protected parseSlatherUserStoreArguments(rawArguments: string) {
    const trimmed = rawArguments.trim();
    if (trimmed.length === 0) {
      return {} satisfies Record<string, unknown>;
    }

    try {
      return JSON.parse<Record<string, unknown>>(trimmed);
    } catch (error) {
      const recovered = this.extractFirstJsonObject(trimmed);
      if (!recovered) {
        throw error;
      }

      this.logger.warn(
        {
          rawArgumentsPreview: trimmed.slice(0, 300),
          recoveredPreview: recovered.slice(0, 300),
          error: this.prisma.safeErrMsg(error)
        },
        "Recovered malformed xAI slather_user_store arguments"
      );
      return JSON.parse<Record<string, unknown>>(recovered);
    }
  }

  protected extractFirstJsonObject(raw: string) {
    let start = -1;
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (const [index, char] of Array.from(raw).entries()) {
      if (start === -1) {
        if (char === "{") {
          start = index;
          depth = 1;
        }
        continue;
      }

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (char === "\\") {
          isEscaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return raw.slice(start, index + 1);
        }
      }
    }

    return undefined;
  }

  protected async executeSlatherUserStore(
    userId: string,
    input: SlatherUserStoreToolInput
  ) {
    const maxResults = Math.max(1, Math.min(input.max_results ?? 5, 10));

    if (input.search_terms) {
      const query = "query" in input ? input.query : input.queries[0];
      const partitioned = await this.searchStoreHybrid(
        userId,
        query,
        input.search_terms,
        maxResults,
        0,
        input.filename
      );
      return this.userStore.formatPartitionedResults(partitioned, query);
    }

    const results =
      "query" in input
        ? await this.searchStore(
            userId,
            input.query,
            maxResults,
            0,
            input.filename
          )
        : (
            await Promise.all(
              input.queries.map(query =>
                this.searchStore(userId, query, maxResults, 0, input.filename)
              )
            )
          ).flat();

    if (results.length === 0) {
      return "[]";
    }

    return JSON.stringify(
      results.map(result => ({
        filename: result.filename,
        score: result.score != null ? Number(result.score.toFixed(4)) : 0,
        content: result.content,
        startOffset: result.startOffset,
        endOffset: result.endOffset,
        chunkIndex: result.chunkIndex
      }))
    );
  }

  protected async executeFunctionToolCall(
    userId: string,
    toolCall: FunctionCallContext
  ) {
    if (toolCall.name !== "slather_user_store") {
      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: `Unknown tool: ${toolCall.name}`
      } as const satisfies FunctionCallOutput<string>;
    }

    try {
      const input = this.parseSlatherUserStoreInput(toolCall.arguments);
      const output = await this.executeSlatherUserStore(userId, input);
      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output
      } as const satisfies FunctionCallOutput<string>;
    } catch (error) {
      this.logger.error(
        {
          toolName: toolCall.name,
          callId: toolCall.call_id,
          error: this.prisma.safeErrMsg(error)
        },
        "xAI function tool execution failed"
      );
      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: `slather_user_store error: ${this.prisma.safeErrMsg(error)}`
      } as const satisfies FunctionCallOutput<string>;
    }
  }

  protected async searchStoreHybrid(
    userId: string,
    query: string,
    searchTerms: string,
    limit = 10,
    threshold = 0,
    filename?: string
  ) {
    return await this.userStore.searchUserStoreChunksHybrid({
      userId,
      query,
      searchTerms,
      limit,
      threshold,
      filename
    });
  }

  protected messageText(msg: MessageSingleton<true>) {
    const textBlocks = Array.of<string>();

    if (msg.messageBlocks && msg.messageBlocks.length > 0) {
      for (const block of msg.messageBlocks) {
        if (block.type === "TEXT") {
          textBlocks.push(block.content);
        }
      }
    }
    if (textBlocks.length > 0) {
      return textBlocks.join("\n");
    } else return msg.content;
  }

  protected async formatxAIMsgHistory(
    msgs: MessageSingleton<true>[],
    model: GrokModelIdUnion,
    userId: string,
    imgDetail?: ImageContentBlock["detail"],
    keyFingerprint = "server",
    keyId?: string,
    apiKey = this.xaiKey,
    mgmtKey = this.xaiManagementKey
  ) {
    const formatted = Array.of<ResponsesComprehensive>();

    const lastIndex = msgs.findLastIndex(
      m => m.provider === "GROK" && m.senderType === "AI"
    );

    const isFirstGrokMsg = lastIndex === -1;

    for (const [msgIndex, msg] of msgs.entries()) {
      const isFreshContext = isFirstGrokMsg || msgIndex > lastIndex;
      const isCurrentUserMsg = msgIndex === msgs.length - 1;
      const collectionId = this.collectionRegistry.get(userId) ?? null;
      if (msg.senderType === "USER") {
        const content = Array.of<ContentBlockUnion>();
        const textParts = Array.of<string>();
        try {
          if (msg.attachments && msg.attachments.length > 0) {
            let currentUserFileCount = 0;

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
                const [filename, ext] = this.prisma.filenameToHexExtTuple(
                  url,
                  attachment.compatStatus,
                  false
                );

                const name = `${filename}.${ext}`;

                if (attachment.assetType === "DOCUMENT") {
                  try {
                    if (isFreshContext) {
                      try {
                        if (!isCurrentUserMsg) {
                          textParts.push(`[${name}](${url})`);
                        } else {
                          if (
                            currentUserFileCount === 0 &&
                            this.canViewDocs(model)
                          ) {
                            const docBlock = {
                              type: "input_file",
                              file_url: url
                            } satisfies FileContentBlock;
                            content.push(docBlock);
                            currentUserFileCount += 1;
                          } else {
                            textParts.push(`[${name}](${url})`);
                          }
                        }
                      } catch {
                        textParts.push(`[${name}](${url})`);
                      }
                    } else {
                      textParts.push(`[${name}](${url})`);
                    }
                  } catch (err) {
                    this.logger.warn(
                      { err: this.prisma.safeErrMsg(err) },
                      `Failed to upload PDF to Collections/Files API of collectionId ${collectionId}.`
                    );
                  }
                } else if (attachment.assetType === "IMAGE") {
                  if (
                    isFreshContext &&
                    isCurrentUserMsg &&
                    this.canViewImgs(model)
                  ) {
                    const imgBlock = {
                      type: "input_image",
                      image_url: url,
                      detail: imgDetail ?? "auto"
                    } satisfies ImageContentBlock;
                    content.push(imgBlock);
                  } else {
                    textParts.push(`![${name}](${url})`);
                  }
                } else {
                  textParts.push(`[${name}](${url})`);
                }
              }
            }
          }
        } catch (err) {
          console.error(this.prisma.safeErrMsg(err));
        } finally {
          textParts.push(this.messageText(msg));
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
        const textParts = Array.of<string>();
        const content = Array.of<ContentBlockUnion>();
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
                const [filename, ext] = this.prisma.filenameToHexExtTuple(
                  url,
                  att.compatStatus,
                  false
                );

                const name = `${filename}.${ext}`;

                if (assetType === "DOCUMENT") {
                  try {
                    const { docUri } = await this.ensureXaiAssetUploaded(
                      att,
                      keyFingerprint,
                      keyId,
                      apiKey,
                      mgmtKey
                    );
                    textParts.push(
                      `${modelIdentifier}\n[${name}](${docUri})\nsource: [${name}](${url})`
                    );
                  } catch (err) {
                    this.logger.warn(
                      { err: this.prisma.safeErrMsg(err) },
                      `Failed to upload PDF to Collections/Files API of collectionId ${collectionId}.`
                    );
                  }
                  // can have image attachments from image gen models in multi-provider/multi-model convos
                } else if (assetType === "IMAGE") {
                  textParts.push(`${modelIdentifier}\n![${name}](${url})`);
                } else {
                  textParts.push(`${modelIdentifier}\n[${name}](${url})`);
                }
              }
            }
          }
        } catch (err) {
          console.error(this.prisma.safeErrMsg(err));
        } finally {
          textParts.push(`${modelIdentifier}\n\n${this.messageText(msg)}`);
        }
        content.push({
          type: "input_text",
          text: textParts.join(`\n\n`)
        } satisfies TextContentBlock);
        formatted.push({
          role: "assistant",
          content
        } as const satisfies ResponsesComprehensive);
      }
    }

    return formatted;
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
        decodedFilename: this.prisma.parseDocname(hexEncodedFilename),
        ...rest
      };
      aggregate.push(expandedObj);
    }
    return aggregate;
  }
  protected formatSystemInstruction(isNewChat: boolean, systemPrompt?: string) {
    if (isNewChat) {
      return systemPrompt;
    }

    const note =
      "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.\n instead of file_search you have slather_user_store, a tool for spelunking a self-hosted vector store";

    return (
      systemPrompt ? `${systemPrompt}\n\n${note}` : note
    ) satisfies ResponsesContentInputSingleton["content"];
  }

  protected resolveResponsesTools({
    collectionId: _c = undefined,
    enableFileSearch: _e = false,
    enableWebSearch = true,
    enableXSearch = true,
    enableCodeInterpreter = false,
    fileSearchMaxResults: _x = 5,
    web_enable_image_understanding = true,
    x_enable_image_understanding = true,
    x_enable_video_understanding = true
  }: ResponsesToolsParams) {
    const tools = Array.of<ToolUnion>();

    // if (enableFileSearch && collectionId) {
    //   if (collectionId) {
    //     tools.push({
    //       type: "file_search",
    //       vector_store_ids: [collectionId],
    //       max_num_results: fileSearchMaxResults
    //     } satisfies FileSearchTool);
    //   }
    // }

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
    return this.is420BetaModel(m) || this.isGrok4Model(m);
  }

  /**
   * Model Compatibility
   * Supported Models: grok-4-0709, grok-4-fast-reasoning, grok-4-fast-non-reasoning, grok-4-1-fast-reasoning, grok-4-1-fast-non-reasoning, grok-4.20-experimental-beta-0304-non-reasoning, grok-4.20-experimental-beta-0304-reasoning, grok-4.20-multi-agent-experimental-beta-0304
   */
  protected handleTooling({
    model,
    collectionId = undefined,
    enableFileSearch = false,
    enableUserStoreSearch = true,
    fileSearchMaxResults = 10,
    enableCodeInterpreter = true,
    enableWebSearch = true,
    enableXSearch = true,
    web_enable_image_understanding = true,
    x_enable_image_understanding = true,
    x_enable_video_understanding = true
  }: HandleToolUsageParams) {
    const tools = Array.of<ToolUnion>();
    if (this.canUseServerTools(model)) {
      tools.push(
        ...this.resolveResponsesTools({
          collectionId,
          enableFileSearch,
          fileSearchMaxResults,
          enableCodeInterpreter,
          enableWebSearch,
          enableXSearch,
          web_enable_image_understanding,
          x_enable_image_understanding,
          x_enable_video_understanding
        })
      );
    }

    if (enableUserStoreSearch && this.canUseFunctionTools(model)) {
      tools.push(this.slatherUserStore());
    }

    return tools.length > 0 ? tools : undefined;
  }

  protected async getResponsesApiInputWorkup({
    isNewChat,
    model = "grok-4.20-0309-reasoning",
    userId,
    msgs,
    keyFingerprint = "server",
    systemPrompt,
    max_output_tokens,
    tool_choice,
    detail = "high",
    keyId,
    apiKey = this.xaiKey,
    managementKey = this.xaiManagementKey,
    collectionId = undefined,
    hasUserStoreDocs,
    enableFileSearch = false,
    enableUserStoreSearch,
    fileSearchMaxResults = 5,
    enableCodeInterpreter = true,
    enableWebSearch = true,
    enableXSearch = true,
    web_enable_image_understanding = true,
    reasoning,
    x_enable_image_understanding = true,
    x_enable_video_understanding = true,
    parallel_tool_calls = true,
    include = ["reasoning.encrypted_content"]
  }: ResponsesApiInputWorkupParams) {
    const systemInstruction = this.formatSystemInstruction(
      isNewChat,
      systemPrompt
    );
    let toolHandler: ToolUnion[] | undefined;
    const hasDocs = enableUserStoreSearch && hasUserStoreDocs;
    // "grok-4.20-multi-agent-0309" doesn't support calling functional tools yet (2026-03-24)
    // and will error if they are presen
    if (this.isMultiAgent(model)) {
      toolHandler = this.handleTooling({
        model,
        collectionId,
        enableFileSearch,
        enableUserStoreSearch: false,
        fileSearchMaxResults,
        enableCodeInterpreter,
        enableWebSearch,
        enableXSearch,
        web_enable_image_understanding,
        x_enable_image_understanding,
        x_enable_video_understanding
      });
    } else {
      toolHandler = this.handleTooling({
        model,
        collectionId,
        enableFileSearch,
        enableUserStoreSearch: hasDocs,
        fileSearchMaxResults,
        enableCodeInterpreter,
        enableWebSearch,
        enableXSearch,
        web_enable_image_understanding,
        x_enable_image_understanding,
        x_enable_video_understanding
      });
    }

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

    if (this.isMultiAgent(model)) {
      return {
        input: history,
        model,
        reasoning: reasoning ?? { effort: "low" },
        instructions: systemInstruction,
        tools: toolHandler,
        tool_choice: tool_choice ?? "auto",
        store: false,
        include,
        stream: true,
        parallel_tool_calls,
        max_output_tokens,
        user: userId
      } as const;
    } else {
      return {
        input: history,
        model,
        instructions: systemInstruction,
        tools: toolHandler,
        tool_choice: tool_choice ?? "auto",
        store: false,
        include,
        stream: true,
        parallel_tool_calls,
        max_output_tokens,
        user: userId
      } as const;
    }
  }
}

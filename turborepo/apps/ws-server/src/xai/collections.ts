import type { xAIResponses } from "@/xai/event-types.ts";
import type {
  CodeInterpreterTool,
  ContentBlockUnion,
  CreateResponseStreamProps,
  FileContentBlock,
  FileSearchTool,
  HandleToolUsageParams,
  ImageContentBlock,
  ResponsesApiInputWorkupParams,
  ResponsesComprehensive,
  ResponsesContentInputSingleton,
  ResponsesContentWorkup,
  ResponsesToolsParams,
  TextContentBlock,
  ToolUnion,
  WebSearchTool,
  XSearchTool
} from "@/xai/responses-types.ts";
import type {
  FilesDbRegistryProps,
  xAIDocDbRegistryProps
} from "@/xai/types.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { ResponsesStreamParser } from "@/xai/response-sse.ts";
import { GrokWorkupService } from "@/xai/workup.ts";
import type {
  AttachmentSingleton,
  CTR,
  GrokModelIdUnion,
  MessageSingleton
} from "@slipstream/types";

export class GrokCollectionsService extends GrokWorkupService {
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
    management_api_key,
    payload: {
      collectionId,
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
    } = await this.getResponsesApiInputWorkup({
      isNewChat,
      model: (m ?? "grok-4-1-fast-reasoning") as GrokModelIdUnion,
      userId,
      msgs,
      keyFingerprint: keyId ?? "server",
      systemPrompt,
      max_output_tokens: max_tokens,
      tool_choice: tool_choice_input,
      detail: imgDetail,
      keyId: keyId ?? undefined,
      apiKey: key,
      managementKey: mgmtApiKey,
      collectionId: cId,
      enableFileSearch,
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
          reasoning: reasoning ?? { effort: "high" },
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
                    const { fileId, docUri } =
                      await this.ensureXaiAssetUploaded(
                        attachment,
                        keyFingerprint,
                        keyId,
                        apiKey,
                        mgmtKey
                      );
                    if (isFreshContext) {
                      try {
                        if (!isCurrentUserMsg) {
                          textParts.push(`[${name}](${docUri})`);
                        } else {
                          if (
                            currentUserFileCount === 0 &&
                            this.canViewDocs(model)
                          ) {
                            const docBlock = {
                              type: "input_file",
                              file_id: fileId
                            } satisfies FileContentBlock;
                            content.push(docBlock);
                            currentUserFileCount += 1;
                          } else {
                            textParts.push(`[${name}](${docUri})`);
                          }
                        }
                      } catch {
                        textParts.push(`[${name}](${docUri})`);
                      }
                    } else {
                      textParts.push(`[${name}](${docUri})`);
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
                    textParts.push(`${modelIdentifier}\n[${name}](${docUri})`);
                  } catch (err) {
                    this.logger.warn(
                      { err: this.prisma.safeErrMsg(err) },
                      `Failed to upload PDF to Collections/Files API of collectionId ${collectionId}.`
                    );
                  }
                  // can have image attachments from image gen models in multi-provider/multi-model convos
                } else if (assetType === "IMAGE") {
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
      "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";

    return (
      systemPrompt ? `${systemPrompt}\n\n${note}` : note
    ) satisfies ResponsesContentInputSingleton["content"];
  }

  protected resolveResponsesTools({
    collectionId,
    enableFileSearch = true,
    enableWebSearch = false,
    enableXSearch = false,
    enableCodeInterpreter = false,
    fileSearchMaxResults = 5,
    web_enable_image_understanding = true,
    x_enable_image_understanding = true,
    x_enable_video_understanding = true
  }: ResponsesToolsParams) {
    const tools = Array.of<ToolUnion>();

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
    return this.is420BetaModel(m) || this.isGrok4Model(m);
  }

  /**
   * Model Compatibility
   * Supported Models: grok-4-0709, grok-4-fast-reasoning, grok-4-fast-non-reasoning, grok-4-1-fast-reasoning, grok-4-1-fast-non-reasoning, grok-4.20-experimental-beta-0304-non-reasoning, grok-4.20-experimental-beta-0304-reasoning, grok-4.20-multi-agent-experimental-beta-0304
   */
  protected handleTooling({
    model,
    collectionId,
    enableFileSearch = true,
    fileSearchMaxResults = 10,
    enableCodeInterpreter = true,
    enableWebSearch = true,
    enableXSearch = false,
    web_enable_image_understanding = true,
    x_enable_image_understanding = true,
    x_enable_video_understanding = true
  }: HandleToolUsageParams) {
    if (this.canUseServerTools(model)) {
      return this.resolveResponsesTools({
        collectionId,
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

  private async getResponsesApiInputWorkup({
    isNewChat,
    model = "grok-4.20-multi-agent-experimental-beta-0304",
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
    collectionId,
    enableFileSearch = true,
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
    const tooling = this.handleTooling({
      model,
      collectionId,
      enableFileSearch,
      fileSearchMaxResults,
      enableCodeInterpreter,
      enableWebSearch,
      enableXSearch,
      web_enable_image_understanding,
      x_enable_image_understanding,
      x_enable_video_understanding
    });

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

    this.logger.info(history);
    if (this.isMultiAgent(model)) {
      return {
        input: history,
        model,
        reasoning: reasoning ?? { effort: "high" },
        instructions: systemInstruction,
        tools: tooling,
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
        tools: tooling,
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

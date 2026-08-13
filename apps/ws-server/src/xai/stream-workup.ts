import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type {
  CodeInterpreterTool,
  ContentBlockUnion,
  CreateResponseStreamProps,
  FileContentBlock,
  HandleToolUsageParams,
  ImageContentBlock,
  LocalToolFunctionTool,
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
import { ResponsesStreamParser } from "@/xai/response-sse.ts";
import { GrokUserStoreService } from "@/xai/user-store.ts";
import type {
  GrokModelIdUnion,
  LocalToolName,
  MessageSingleton
} from "@slipstream/types";
import { LOCAL_TOOL_DEFINITIONS } from "@slipstream/types";

export class GrokStreamWorkupService extends GrokUserStoreService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStore: UserStoreVectorService,
    memoryService: ConversationMemoryVectorService,
    xaiKey: string,
    xaiManagementKey: string
  ) {
    super(logger, prisma, userStore, memoryService, xaiKey, xaiManagementKey);
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
    // HMEM substitution assembly (Part II §2)
    const memoryView = await this.memoryService.getHistoryAssemblyView(
      msgs[0]?.conversationId,
      msgs.reduce((max, m) => (m.ordinal >= max ? m.ordinal + 1 : max), 0)
    );
    const formatted = Array.of<ResponsesComprehensive>();

    const lastIndex = msgs.findLastIndex(
      m => m.provider === "GROK" && m.senderType === "AI"
    );

    const isFirstGrokMsg = lastIndex === -1;

    for (const [msgIndex, msg] of msgs.entries()) {
      const claim = memoryView?.claim(msg.ordinal);
      if (claim) {
        if (claim.emit != null) {
          formatted.push({
            role: "assistant",
            content: [
              {
                type: "input_text",
                text: claim.emit
              } satisfies TextContentBlock
            ]
          } as const satisfies ResponsesComprehensive);
        }
        continue;
      }
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
                    this.prisma.isGrokModel(model)
                  ) {
                    const imgBlock = {
                      type: "input_image",
                      image_url: url,
                      detail: imgDetail ?? "high"
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
    return this.isGrok4Model(m) || this.isGrokBuild(m);
  }

  /**
   * Local read-only tool bridge (Sovereign CLI) — canonical definitions
   * mapped into xAI's Responses function-tool dialect. OpenAI-compatible
   * JSON Schema, so this is a near-identity map (parameters ===
   * inputSchema, strict:false to allow the optional fields). Empty when
   * the CLI advertises nothing.
   */
  protected localToolFunctionTools(names: readonly LocalToolName[]) {
    const advertised = new Set<string>(names);
    return LOCAL_TOOL_DEFINITIONS.filter(d => advertised.has(d.name)).map(
      d =>
        ({
          type: "function",
          name: d.name,
          description: d.description,
          parameters: d.inputSchema,
          strict: false
        }) satisfies LocalToolFunctionTool
    );
  }

  /**
   * Model Compatibility
   * Supported Models: grok-4.20-0309-reasoning, grok-4.20-multi-agent-0309, grok-4.20-0309-non-reasoning, grok-4.3
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
    x_enable_video_understanding = true,
    localToolNames = []
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

    // memory tools attach unconditionally — conversation memory exists
    // independently of uploaded documents; local bridge tools ride the
    // same gate (the multi-agent model errors on any function tool)
    if (this.canUseFunctionTools(model)) {
      tools.push(
        this.memorySearchFunctionTool(),
        this.memoryGetChunkFunctionTool(),
        ...this.localToolFunctionTools(localToolNames)
      );
    }

    return tools.length > 0 ? tools : undefined;
  }

  protected async getResponsesApiInputWorkup({
    model = "grok-4.5",
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
    include = ["reasoning.encrypted_content"],
    localToolNames = []
  }: ResponsesApiInputWorkupParams) {
    const systemInstruction = this.prisma.formatSysNote(systemPrompt);
    let toolHandler: ToolUnion[] | undefined;
    const hasDocs = enableUserStoreSearch && hasUserStoreDocs;
    // "grok-4.20-multi-agent-0309" doesn't support calling functional tools yet (2026-03-24)
    // and will error if they are presen
    if (this.prisma.isGrokMultiAgentModel(model)) {
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
        x_enable_video_understanding,
        localToolNames
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
        x_enable_video_understanding,
        localToolNames
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

    if (this.prisma.isGrokMultiAgentModel(model)) {
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
    } else if (this.prisma.isGrokReasoningEffortModel(model)) {
      return {
        input: history,
        model,
        reasoning: reasoning ?? { effort: "high" },
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
      parallel_tool_calls: parallel_tool_calling = true,
      localToolNames = []
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
          instructions: this.prisma.formatSysNote(systemPrompt),
          reasoning: undefined,
          max_output_tokens: max_tokens,
          model: (m ?? "grok-4.5") as GrokModelIdUnion,
          parallel_tool_calls: parallel_tool_calling,
          tool_choice: tool_choice_input,
          store: false,
          stream,
          tools: this.handleTooling({
            model: (m ?? "grok-4.5") as GrokModelIdUnion,
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
            localToolNames
          }),
          user: userId
        }
      : await this.getResponsesApiInputWorkup({
          isNewChat,
          model: (m ?? "grok-4.5") as GrokModelIdUnion,
          userId,
          msgs,
          keyFingerprint: keyId ?? "server",
          systemPrompt,
          max_output_tokens: max_tokens,
          tool_choice: tool_choice_input,
          detail: imgDetail,
          keyId: keyId ?? undefined,
          hasUserStoreDocs,
          reasoning: m && this.prisma.isGrokMultiAgentModel(m) ? { effort: "low" } : undefined,
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
          include: ["reasoning.encrypted_content"],
          localToolNames
        });

    const requestBody = this.prisma.isGrokMultiAgentModel(model)
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
}

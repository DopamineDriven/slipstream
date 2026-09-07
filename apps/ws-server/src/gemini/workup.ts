import type { GenerateContentResponseProps } from "@/gemini/types.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type {
  Content,
  FunctionDeclaration,
  GenerateContentConfig,
  GenerateContentParameters,
  ImageConfig,
  Part,
  Schema,
  ToolConfig
} from "@google/genai";
import { GeminiEnsureService } from "@/gemini/ensure.ts";
import { ThinkingLevel, Type } from "@google/genai";
import type {
  AIChatRequestImgGenFields,
  CanonicalSchemaProperty,
  GeminiModelIdUnion,
  LocalToolName,
  MessageSingleton,
  NanoBanana2OutputAR
} from "@slipstream/types";
import { LOCAL_TOOL_DEFINITIONS } from "@slipstream/types";

export class GeminiWorkupService extends GeminiEnsureService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    protected store: UserStoreVectorService,
    protected memoryService: ConversationMemoryVectorService,
    apiKey: string
  ) {
    super(logger, prisma, apiKey);
  }

  protected async formatHistoryForSession(
    msgs: MessageSingleton<true>[],
    keyFingerprint: string,
    keyId?: string,
    apiKey?: string,
    m: GeminiModelIdUnion = "gemini-3.1-pro-preview"
  ) {
    // HMEM substitution assembly (Part II §2)
    const memoryView = await this.memoryService.getHistoryAssemblyView(
      msgs[0]?.conversationId,
      msgs.reduce((max, m) => (m.ordinal >= max ? m.ordinal + 1 : max), 0)
    );
    const formatted = Array.of<Content>();
    const lastIndex = msgs.findLastIndex(
      m => m.provider === "GEMINI" && m.senderType === "AI"
    );

    const isFirstGemMsg = lastIndex === -1;
    for (const [msgIndex, msg] of msgs.entries()) {
      const claim = memoryView?.claim(msg.ordinal);
      if (claim) {
        if (claim.emit != null) {
          formatted.push({
            role: "model",
            parts: [{ text: claim.emit }]
          } as const);
        }
        continue;
      }
      const isFreshContext = isFirstGemMsg || msgIndex > lastIndex;
      const isCurrentUserMsg = msgIndex === msgs.length - 1;
      if (msg.senderType === "USER") {
        const partArr = Array.of<Part>();
        const textParts = Array.of<string>();
        if (msg.attachments.length > 0) {
          for (const attachment of msg.attachments) {
            try {
              if (
                attachment?.compatCdnUrl &&
                attachment?.cdnUrl &&
                attachment?.mime &&
                attachment?.compatMime &&
                attachment?.compatStatus
              ) {
                const url =
                  attachment.compatStatus === "ACTIVE"
                    ? attachment.compatCdnUrl
                    : attachment.cdnUrl;

                const [filename, ext] = this.prisma.filenameToHexExtTuple(
                  url,
                  attachment.compatStatus,
                  false
                );
                const name = `${filename}.${ext}`;
                const { fileUri, mimeType } = await this.ensureAssetUploaded(
                  attachment,
                  keyFingerprint,
                  keyId ?? undefined,
                  apiKey
                );

                if (attachment.assetType === "DOCUMENT") {
                  if (isFreshContext) {
                    if (isCurrentUserMsg) {
                      if (this.isGemini3ChatModel(m)) {
                        partArr.push({
                          fileData: { fileUri, mimeType },
                          mediaResolution: this.mediaResolutionLevel(mimeType)
                        });
                      } else {
                        partArr.push({
                          fileData: { fileUri, mimeType }
                        });
                      }
                    } else {
                      partArr.push({ fileData: { fileUri, mimeType } });
                    }
                  } else {
                    textParts.push(`[${name}](${fileUri})`);
                  }
                } else if (attachment.assetType === "IMAGE") {
                  const { fileUri, mimeType } = await this.ensureAssetUploaded(
                    attachment,
                    keyFingerprint,
                    keyId ?? undefined,
                    apiKey
                  );
                  if (isFreshContext) {
                    if (isCurrentUserMsg) {
                      if (this.isGemini3ChatModel(m)) {
                        partArr.push({
                          fileData: { fileUri, mimeType },
                          mediaResolution: this.mediaResolutionLevel(mimeType)
                        });
                      } else {
                        partArr.push({ fileData: { fileUri, mimeType } });
                      }
                    }
                    textParts.push(`![${name}](${fileUri})`);
                  } else {
                    textParts.push(`![${name}](${fileUri})`);
                  }
                } else {
                  textParts.push(`[${name}](${url})`);
                }
              }
            } catch (err) {
              this.logger.warn(
                "error in gemini attachment upload: " +
                  this.prisma.safeErrMsg(err)
              );
            }
          }
        }
        const blockAgg = Array.of<string>();
        if (msg.messageBlocks && msg.messageBlocks.length > 0) {
          for (const block of msg.messageBlocks) {
            if (block.type === "TEXT") {
              blockAgg.push(block.content);
            }
          }
        }
        if (blockAgg.length > 0) {
          textParts.push(blockAgg.join(`\n`));
        } else {
          textParts.push(msg.content);
        }
        partArr.push({ text: textParts.join(`\n\n`) });
        formatted.push({ role: "user", parts: partArr } as const);
      } else {
        const partArr = Array.of<Part>();
        const textParts = Array.of<string>();
        const model = msg.model ?? "unknown";
        const modelIdentifier = `[${msg.provider.toLowerCase()}/${model}]`;

        // Handle AI-generated attachments if they exist
        if (
          msg.attachments &&
          msg.attachments.length > 0 &&
          msg.senderType === "AI"
        ) {
          for (const attachment of msg.attachments) {
            try {
              // AI-generated assets should have these fields populated
              if (
                attachment?.cdnUrl &&
                attachment?.mime &&
                attachment.origin === "GENERATED"
              ) {
                if (attachment.assetType === "IMAGE") {
                  const { fileUri, mimeType } = await this.ensureAssetUploaded(
                    attachment,
                    keyFingerprint,
                    keyId,
                    apiKey
                  );
                  if (isFreshContext) {
                    partArr.push({
                      fileData: { fileUri, mimeType }
                    });
                  } else {
                    textParts.push(
                      `![${modelIdentifier}, ${attachment.mime}](${attachment.cdnUrl})`
                    );
                  }
                } else if (attachment.assetType === "DOCUMENT") {
                  const { fileUri, mimeType } = await this.ensureAssetUploaded(
                    attachment,
                    keyFingerprint,
                    keyId,
                    apiKey
                  );
                  if (isFreshContext) {
                    partArr.push({
                      fileData: { fileUri, mimeType }
                    });
                  } else {
                    textParts.push(
                      `[${modelIdentifier}, ${attachment.mime}](${attachment.cdnUrl})`
                    );
                  }
                } else {
                  textParts.push(
                    `[${modelIdentifier}, ${attachment.mime}](${attachment.cdnUrl})`
                  );
                }
              }
            } catch (err) {
              this.logger.warn(
                `Error uploading AI-generated attachment in history: ${attachment.id} - ${this.prisma.safeErrMsg(err)}`
              );
            }
          }
        }
        const blockAgg = Array.of<string>();
        if (msg.messageBlocks && msg.messageBlocks.length > 0) {
          for (const block of msg.messageBlocks) {
            if (block.type === "TEXT") {
              blockAgg.push(block.content);
            }
          }
        }
        if (blockAgg.length > 0) {
          textParts.push(`${modelIdentifier}\n${blockAgg.join(`\n`)}`);
        } else {
          textParts.push(`${modelIdentifier}\n${msg.content}`);
        }
        partArr.push({ text: textParts.join("\n\n") });
        formatted.push({
          role: "model",
          parts: partArr
        } as const);
      }
    }
    return formatted;
  }

  protected async getHistoryAndInstruction(
    msgs: MessageSingleton<true>[],
    keyFingerprint: string,
    systemPrompt?: string,
    keyId?: string,
    apiKey?: string,
    model?: GeminiModelIdUnion
  ) {
    const systemInstruction = this.prisma.formatSysNote(systemPrompt);

    const history = await this.formatHistoryForSession(
      msgs,
      keyFingerprint,
      keyId,
      apiKey,
      model
    );
    return {
      history,
      systemInstruction
    };
  }

  private candidateCount(model: GeminiModelIdUnion, n = 1) {
    if (!this.prisma.geminiNanoBananasModel(model)) {
      return undefined;
    } else return this.prisma.handleImgGenCount(model, { n });
  }

  private getToolConfig(
    latlng?: string,
    m: GeminiModelIdUnion = "gemini-3.1-pro-preview"
  ) {
    const [lat, lng] = this.prisma.handleLatLng(latlng);
    if (
      this.isGemini3ChatModel(m) ||
      this.isDeepResearch(m) ||
      this.isGemini2dot5Model(m)
    ) {
      return {
        // allows for mixing of google tools with custom tools
        includeServerSideToolInvocations: true,
        retrievalConfig: { latLng: { latitude: lat, longitude: lng } }
      } satisfies ToolConfig;
    } else {
      return {
        retrievalConfig: { latLng: { latitude: lat, longitude: lng } }
      } satisfies ToolConfig;
    }
  }

  /**
   * Local read-only tool bridge (Sovereign CLI) — one canonical leaf into
   * Google's Type-enum Schema dialect. The contract's
   * CanonicalSchemaProperty is the portable intersection, so the walk is
   * total: primitive types map to their Type enums, minimum/maximum pass
   * through as numbers, minLength/maxLength coerce to Google's int64
   * strings, and additionalProperties drops (Schema cannot express it).
   */
  private localToolSchemaProperty(p: CanonicalSchemaProperty) {
    const type =
      p.type === "string"
        ? Type.STRING
        : p.type === "integer"
          ? Type.INTEGER
          : Type.BOOLEAN;
    return {
      type,
      ...(typeof p.description !== "undefined"
        ? { description: p.description }
        : {}),
      ...(typeof p.minimum !== "undefined" ? { minimum: p.minimum } : {}),
      ...(typeof p.maximum !== "undefined" ? { maximum: p.maximum } : {}),
      ...(typeof p.minLength !== "undefined"
        ? { minLength: String(p.minLength) }
        : {}),
      ...(typeof p.maxLength !== "undefined"
        ? { maxLength: String(p.maxLength) }
        : {})
    } satisfies Schema;
  }

  /**
   * canonical definitions mapped into Gemini FunctionDeclarations —
   * empty when the CLI advertises nothing
   */
  protected localToolFunctionDeclarations(names: readonly LocalToolName[]) {
    const advertised = new Set<string>(names);
    return LOCAL_TOOL_DEFINITIONS.filter(d => advertised.has(d.name)).map(d => {
      const properties: Record<string, Schema> = {};
      for (const [key, prop] of Object.entries(d.inputSchema.properties)) {
        // eslint-disable-next-line
        properties[key] = this.localToolSchemaProperty(prop);
      }
      return {
        name: d.name,
        description: d.description,
        parameters: {
          type: Type.OBJECT,
          properties,
          required:
            "required" in d.inputSchema && d.inputSchema.required
              ? [...d.inputSchema.required]
              : []
        }
      } satisfies FunctionDeclaration;
    });
  }

  private getTools(
    m: GeminiModelIdUnion = "gemini-3.1-pro-preview",
    /**
     * local read-only bridge tools (repo_search/read_file/list_directory) —
     * appended to whichever functionDeclarations set the branch selects;
     * the nano-banana branch deliberately stays googleSearch-only (image
     * models never advertise them from the CLI chat path anyway)
     */
    localToolNames: readonly LocalToolName[] = []
  ) {
    const localDeclarations =
      this.localToolFunctionDeclarations(localToolNames);
    if (
      this.isGemini3ChatModel(m) ||
      this.isDeepResearch(m) ||
      this.isGemini2dot5Model(m)
    ) {
      return [
        {
          googleSearch: {},
          urlContext: {},
          functionDeclarations: [
            this.userStoreSearchTool(),
            this.memorySearchTool(),
            this.memoryGetChunkTool(),
            ...localDeclarations
          ]
        }
      ] satisfies GenerateContentConfig["tools"];
    }
    if (this.isNanoBanana2(m) || this.isNanoBananaPro(m)) {
      return [{ googleSearch: {} }] satisfies GenerateContentConfig["tools"];
    }
    if (m === "gemini-2.0-flash" || m === "gemini-2.0-flash-lite") {
      return [
        {
          functionDeclarations: [
            this.userStoreSearchTool(),
            this.memorySearchTool(),
            this.memoryGetChunkTool(),
            ...localDeclarations
          ]
        }
      ] satisfies GenerateContentConfig["tools"];
    }
    if (localDeclarations.length > 0) {
      return [
        { functionDeclarations: localDeclarations }
      ] satisfies GenerateContentConfig["tools"];
    } else {
      return [] satisfies GenerateContentConfig["tools"];
    }
  }

  private getThinkingConfig(m: GeminiModelIdUnion = "gemini-3.1-pro-preview") {
    if (
      this.isGemini3ChatModel(m) ||
      this.isDeepResearch(m) ||
      this.isNanoBanana2(m) ||
      this.isNanoBanana2Lite(m)
    ) {
      return {
        includeThoughts: true,
        thinkingLevel: ThinkingLevel.HIGH
      } satisfies GenerateContentConfig["thinkingConfig"];
    }
    if (this.isGemini2dot5Model(m) || this.isNanoBananaPro(m)) {
      return {
        includeThoughts: true,
        thinkingBudget: -1
      } satisfies GenerateContentConfig["thinkingConfig"];
    }
    if (this.isNanoBanana1(m)) {
      return;
    } else {
      return {
        includeThoughts: false,
        thinkingBudget: 0
      } satisfies GenerateContentConfig["thinkingConfig"];
    }
  }

  private async contentGenChat({
    keyId,
    model,
    msgs,
    apiKey,
    latlng,
    topP,
    temperature,
    max_tokens,
    systemPrompt,
    imgGenFields,
    localToolNames
  }: GenerateContentResponseProps) {
    if (!model || !this.prisma.isGeminiModel(model))
      throw new Error(`non-gemini model passed to gemini ${model}`);
    const m = model;
    const keyFingerprint = keyId ?? "server";
    const toolConfig = this.getToolConfig(latlng, m);
    const tools = this.getTools(m, localToolNames);
    const thinkingConfig = this.getThinkingConfig(m);
    const maxOutputTokens = max_tokens;
    const { history: contents, systemInstruction } =
      await this.getHistoryAndInstruction(
        msgs,
        keyFingerprint,
        systemPrompt,
        keyId ?? undefined,
        apiKey,
        m
      );
    const responseModalities = this.mediaModalities(m);
    const candidateCount = this.candidateCount(m, imgGenFields?.n);
    return {
      contents,
      model,
      config: {
        maxOutputTokens,
        toolConfig,
        // Custom Gemini tool rounds are handled explicitly in chat.ts.
        automaticFunctionCalling: { disable: true },
        responseModalities,
        tools,
        topP,
        candidateCount,
        temperature,
        systemInstruction,
        thinkingConfig
      }
    } satisfies GenerateContentParameters;
  }
  protected handleImgGenFields(
    model: string,
    {
      output_size: ar,
      output_quality: q
    }: AIChatRequestImgGenFields | undefined = {}
  ) {
    let a: NanoBanana2OutputAR | undefined = undefined;
    let qual: "0.5K" | "1K" | "2K" | "4K" | undefined = undefined;
    if (!this.isNanoBananaFam(model)) return;
    if (
      model === "gemini-3.1-flash-image-preview" ||
      model === "gemini-3.1-flash-lite-image"
    ) {
      if (ar && this.prisma.isValidNanoBananaGenTwoAR(ar)) {
        a = ar;
      } else {
        a = "16:9";
      }
      if (
        model === "gemini-3.1-flash-image-preview" &&
        q &&
        this.prisma.isValidNanoBananaTwoOutputQuality(q)
      ) {
        qual = q;
      }
      if (
        model === "gemini-3.1-flash-lite-image" &&
        q &&
        this.prisma.isValidNanoBananaTwoLiteOutputQuality(q)
      ) {
        qual = q;
      } else {
        qual = "1K";
      }
    }
    if (
      model === "gemini-3-pro-image-preview" ||
      model === "gemini-2.5-flash-image"
    ) {
      if (ar && this.prisma.isValidNanoBananaGenOneAR(ar)) {
        a = ar;
      } else {
        a = "16:9";
      }
      if (q && this.prisma.isValidNanoBananaProAndTwoOutputQuality(q)) {
        qual = q;
      } else {
        qual = "1K";
      }
    }
    return {
      aspectRatio: a,
      imageSize: this.handleImgSize(qual)
    } as const satisfies ImageConfig;
  }

  protected handleImgSize(imageSize?: "0.5K" | "1K" | "2K" | "4K") {
    return imageSize ? (imageSize === "0.5K" ? "512" : imageSize) : "1K";
  }
  /**
   * 🍌 🍌 🍌 🍌 🍌
   *
   * Note: I intend to filter for previous nano bananas messages within a convo context else include up to the 5 most recent turns or a combo thereof (for nano banana messages, that includes the user and the agent response + attachments)
   */
  private async contentGenNanoBananas({
    keyId,
    model,
    msgs,
    apiKey,
    latlng,
    topP,
    temperature,
    max_tokens,
    systemPrompt,
    requestMessageId,
    imgGenFields
  }: GenerateContentResponseProps) {
    if (!model || !this.isNanoBananaFam(model)) {
      const err = `Non-Nano Bananas model passed to contentGenNanoBananas ${model}`;
      this.logger.info(err);
      throw new Error(err);
    }

    // const client = this.getClient(apiKey);

    const keyFingerprint = keyId ?? "server";
    const toolConfig = this.getToolConfig(latlng, model);
    const tools = this.getTools(model);
    const thinkingConfig = this.getThinkingConfig(model);
    const maxOutputTokens = max_tokens;

    let msgBananas: MessageSingleton<true>[];

    const currentIdx = msgs.findIndex(m => m.id === requestMessageId);

    if (currentIdx === -1) {
      throw new Error(`Request message ${requestMessageId} not in msgs`);
    }

    const ceiling = model === "gemini-3.1-flash-image-preview" ? 10 : 5;
    if (msgs.length > ceiling) {
      msgBananas = msgs.slice(
        Math.max(0, currentIdx - ceiling),
        currentIdx + 1
      );
    } else {
      msgBananas = msgs;
    }
    const { history: contents, systemInstruction } =
      await this.getHistoryAndInstruction(
        msgBananas,
        keyFingerprint,
        systemPrompt,
        keyId ?? undefined,
        apiKey,
        model
      );

    // could we more intelligently calculate ceiling instead of doing the 10 | 5 static cap above?
    // const getTokens = await client.models.countTokens({ model,contents: contents });

    const imageConfig = this.handleImgGenFields(model, imgGenFields);
    const responseModalities = this.mediaModalities(model);
    const candidateCount = this.candidateCount(model, imgGenFields?.n);
    return {
      contents,
      model,
      config: {
        maxOutputTokens,
        toolConfig,
        thinkingConfig,
        responseModalities,
        tools,
        topP,
        candidateCount,
        imageConfig,
        temperature,
        systemInstruction
      }
    } satisfies GenerateContentParameters;
  }

  protected async contentGen({
    model = "gemini-3.1-pro-preview",
    imgGenFields,
    ...rest
  }: GenerateContentResponseProps) {
    const m = model ?? "gemini-3.1-pro-preview";
    if (this.isNanoBananaFam(m) && typeof imgGenFields !== "undefined") {
      /**
       * 🍌 🍌 🍌 🍌 🍌
       */
      return this.contentGenNanoBananas({
        model: m,
        imgGenFields: imgGenFields,
        ...rest
      });
    } else {
      return this.contentGenChat({
        model: m,
        imgGenFields: undefined,
        ...rest
      });
    }
  }
}

import type {
  InteractionConfigProps,
  InteractionsInputProps,
  InteractionStepMap
} from "@/gemini/types.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { ContentListUnion, Interactions } from "@google/genai";
import { GeminiWorkupService } from "@/gemini/workup.ts";
import type { MessageSingleton } from "@slipstream/types";

export class GeminiInteractionsService extends GeminiWorkupService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    store: UserStoreVectorService,
    memoryService: ConversationMemoryVectorService,
    apiKey: string
  ) {
    super(logger, prisma, store, memoryService, apiKey);
  }

  protected async formatInteractionsHistory(
    msgs: MessageSingleton<true>[],
    keyFingerprint: string,
    systemPrompt?: string,
    keyId?: string,
    apiKey?: string
  ) {
    const systemInstruction = this.prisma.formatSysNote(systemPrompt);
    // HMEM substitution assembly (Part II §2)
    const memoryView = await this.memoryService.getHistoryAssemblyView(
      msgs[0]?.conversationId,
      msgs.reduce((max, msg) => (msg.ordinal >= max ? msg.ordinal + 1 : max), 0)
    );
    const formatted = Array.of<
      InteractionStepMap["user_input"] | InteractionStepMap["model_output"]
    >();
    const lastIndex = msgs.findLastIndex(
      msg => msg.provider === "GEMINI" && msg.senderType === "AI"
    );

    const isFirstGemMsg = lastIndex === -1;
    for (const [msgIndex, msg] of msgs.entries()) {
      const claim = memoryView?.claim(msg.ordinal);
      if (claim) {
        if (claim.emit != null) {
          formatted.push({
            type: "model_output",
            content: [{ type: "text", text: claim.emit }]
          } as const);
        }
        continue;
      }
      const isFreshContext = isFirstGemMsg || msgIndex > lastIndex;
      const _isCurrentUserMsg = msgIndex === msgs.length - 1;
      if (msg.senderType === "USER") {
        const contentArr = Array.of<Interactions.Content>();
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
                  // DocumentContent carries no resolution field, so the
                  // gemini-3 mediaResolution branching from the
                  // generateContent twin collapses to one push here
                  if (isFreshContext) {
                    contentArr.push({
                      type: "document",
                      uri: fileUri,
                      mime_type: mimeType
                    } as const);
                  } else {
                    textParts.push(`[${name}](${fileUri})`);
                  }
                } else if (attachment.assetType === "IMAGE") {
                  if (isFreshContext) {
                    contentArr.push({
                      type: "image",
                      uri: fileUri,
                      mime_type: mimeType,
                      resolution: "ultra_high"
                    } as const);
                  } else {
                    textParts.push(`![${name}](${fileUri})`);
                  }
                } else if (attachment.assetType === "AUDIO") {
                  if (isFreshContext) {
                    contentArr.push({
                      type: "audio",
                      channels: attachment.audio?.channels ?? undefined,
                      mime_type: mimeType,
                      uri: fileUri,
                      sample_rate: attachment.audio?.sampleRate ?? undefined
                    } as const);
                  } else {
                    textParts.push(
                      `[${attachment.filename}](${attachment.cdnUrl})`
                    );
                  }
                } else if (attachment.assetType === "VIDEO") {
                  if (isFreshContext) {
                    contentArr.push({
                      type: "video",
                      resolution: "ultra_high",
                      mime_type: mimeType,
                      uri: fileUri
                    } as const);
                  } else {
                    textParts.push(
                      `[${attachment.filename}](${attachment.cdnUrl})`
                    );
                  }
                } else {
                  textParts.push(`[${name}](${url})`);
                }
              }
            } catch (err) {
              this.logger.warn(
                "error in gemini interactions attachment upload: " +
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
        contentArr.push({
          type: "text",
          text: textParts.join(`\n\n`)
        } as const);
        formatted.push({ type: "user_input", content: contentArr } as const);
      } else {
        const contentArr = Array.of<Interactions.Content>();
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
                    contentArr.push({
                      type: "image",
                      uri: fileUri,
                      resolution: "ultra_high",
                      mime_type: mimeType
                    } as const);
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
                    contentArr.push({
                      type: "document",
                      uri: fileUri,
                      mime_type: mimeType
                    } as const);
                  } else {
                    textParts.push(
                      `[${modelIdentifier}, ${attachment.mime}](${attachment.cdnUrl})`
                    );
                  }
                } else if (attachment.assetType === "AUDIO") {
                  const { fileUri, mimeType } = await this.ensureAssetUploaded(
                    attachment,
                    keyFingerprint,
                    keyId,
                    apiKey
                  );
                  if (isFreshContext) {
                    contentArr.push({
                      type: "audio",
                      channels: attachment.audio?.channels ?? undefined,
                      mime_type: mimeType,
                      uri: fileUri,
                      sample_rate: attachment.audio?.sampleRate ?? undefined
                    });
                  } else {
                    textParts.push(
                      `[${modelIdentifier}, ${attachment.mime}](${attachment.cdnUrl})`
                    );
                  }
                } else if (attachment.assetType === "VIDEO") {
                  const { fileUri, mimeType } = await this.ensureAssetUploaded(
                    attachment,
                    keyFingerprint,
                    keyId,
                    apiKey
                  );
                  if (isFreshContext) {
                    contentArr.push({
                      type: "video",
                      resolution: "ultra_high",
                      mime_type: mimeType,
                      uri: fileUri
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
                `Error uploading AI-generated attachment in interactions history: ${attachment.id} - ${this.prisma.safeErrMsg(err)}`
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
        contentArr.push({
          type: "text",
          text: textParts.join("\n\n")
        } as const);
        formatted.push({
          type: "model_output",
          content: contentArr
        } as const);
      }
    }
    return {
      input: formatted satisfies InteractionsInputProps,
      systemInstruction
    };
  }

  protected getInteractionTools(
    m: string,
    via?: "web" | "cli",
    latlng?: string
  ) {
    const [_latitude, _longitude] = this.prisma.handleLatLng(latlng);
    const localTools =
      via === "cli"
        ? [
            this.repoSearchToolInteractions(),
            this.readFileToolInteractions(),
            this.listDirectoryToolInteractions()
          ]
        : [];
    if (
      this.isGemini3ChatModel(m) ||
      this.isDeepResearch(m) ||
      this.isGemini2dot5Model(m)
    ) {
      return [
        { type: "google_search" },
        // { type: "google_maps", latitude, longitude },
        { type: "url_context" },
        this.memorySearchToolInteractions(),
        this.getMemoryChunkToolInteractions(),
        this.userStoreSearchToolInteractions(),
        ...localTools
      ] satisfies Interactions.Tool[];
    }
    if (this.isNanoBanana2(m)) {
      return [{ type: "google_search" }] satisfies Interactions.Tool[];
    } else {
      return [] satisfies Interactions.Tool[];
    }
  }

  private interactionsThinkingConfig(m: string) {
    if (
      this.isGemini3ChatModel(m) ||
      this.isDeepResearch(m) ||
      this.isNanoBanana2(m) ||
      this.isNanoBanana2Lite(m) ||
      this.isGemini2dot5Model(m) ||
      this.isNanoBananaPro(m)
    ) {
      return "high" as const;
    } else return;
  }

  protected async getTokens(
    contents: ContentListUnion,
    model = "gemini-3.1-flash-image-preview",
    apiKey = this.apiKey
  ) {
    const client = this.getClient(apiKey);
    return await client.models.countTokens({
      model,
      contents
    });
  }

  protected get nanoBananaFamTokenMax() {
    return {
      "gemini-3.1-flash-image-preview": 131072,
      "gemini-3.1-flash-image": 131072,
      "gemini-3.1-flash-lite-image": 65536,
      "gemini-3-pro-image-preview": 65536,
      "gemini-3-pro-image": 65536,
      "gemini-2.5-flash-image": 65536
    } as const;
  }

  protected get lyriaFamTokenMax() {
    return {
      "lyria-3.5": 131072,
      "lyria-3-pro-preview": 131072,
      "lyria-3-clip-preview": 131072
    } as const;
  }

  private async interactionChat({
    msgs,
    apiKey,
    via,
    keyId,
    latlng,
    model,
    max_tokens,
    systemPrompt
  }: InteractionConfigProps) {
    if (!model || !this.prisma.isGeminiModel(model)) {
      throw new Error(`non-gemini model passed to gemini ${model}`);
    }
    const keyFingerprint = keyId ?? "server";
    const { input, systemInstruction } = await this.formatInteractionsHistory(
      msgs,
      keyFingerprint,
      systemPrompt,
      keyId ?? undefined,
      apiKey
    );
    const tools = this.getInteractionTools(model, via, latlng);
    return {
      input,
      model,
      store: false,
      response_format: [{ type: "text", mime_type: "text/plain" }],
      tools,
      system_instruction: systemInstruction,
      stream: true,
      generation_config: {
        tool_choice: "auto",
        max_output_tokens: max_tokens,
        thinking_summaries: "auto",
        thinking_level: this.interactionsThinkingConfig(model)
      }
    } satisfies Interactions.CreateModelInteractionParamsStreaming;
  }

  /**
   * 🍌 🍌 🍌 🍌 🍌
   */
  private async interactionNanoBananas({
    msgs,
    apiKey = this.apiKey,
    via,
    keyId,
    latlng,
    model,
    imgGenFields,
    max_tokens,
    systemPrompt
  }: InteractionConfigProps) {
    if (!model) {
      throw new Error(`no model passed to interactionNanoBananas ${model}`);
    }
    if (!this.isNanoBananaFam(model)) {
      throw new Error(
        `non-nano banana fam model passed to interactionNanoBananas ${model}`
      );
    }
    const keyFingerprint = keyId ?? "server";

    const maxInputTokens = this.nanoBananaFamTokenMax[model];

    const { input, systemInstruction } = await this.formatInteractionsHistory(
      msgs,
      keyFingerprint,
      systemPrompt,
      keyId ?? undefined,
      apiKey
    );

    const toContentGen = this.interactionStepsToContents(input);

    const getTokens = await this.getTokens(toContentGen, model, apiKey);

    let nanobananaInput: (
      Interactions.ModelOutputStep | Interactions.UserInputStep
    )[];

    if (
      getTokens?.totalTokens &&
      getTokens.totalTokens < maxInputTokens - 4000
    ) {
      nanobananaInput = input;
    } else {
      if (maxInputTokens === 131072) {
        nanobananaInput = input.slice(input.length - 50);
      } else {
        nanobananaInput = input.slice(input.length - 30);
      }
    }

    const imageConfig = this.handleImgGenFields(model, imgGenFields);
    const tools = this.getInteractionTools(model, via, latlng);

    return {
      input: nanobananaInput,
      model,
      store: false,
      tools,
      system_instruction: systemInstruction,
      response_format: [
        {
          type: "image",
          mime_type: "image/jpeg",
          aspect_ratio: imageConfig?.aspectRatio ?? "16:9",
          image_size: imageConfig?.imageSize ?? "1K"
        },
        { type: "text", mime_type: "text/plain" }
      ],
      stream: true,
      generation_config: {
        tool_choice: "auto",
        max_output_tokens: max_tokens,
        thinking_summaries: "auto",
        thinking_level: this.interactionsThinkingConfig(model)
      }
    } satisfies Interactions.CreateModelInteractionParamsStreaming;
  }

  /**
   * 🎵 🎵 🎵 🎵 🎵
   */
  protected async interactionLyria({
    msgs,
    apiKey = this.apiKey,
    keyId,
    model,
    max_tokens,
    systemPrompt
  }: InteractionConfigProps) {
    if (!model) {
      throw new Error(`no model passed to interactionLyria ${model}`);
    }
    if (!this.isLyriaModel(model)) {
      throw new Error(
        `non-lyria fam model passed to interactionLyria ${model}`
      );
    }
    const keyFingerprint = keyId ?? "server";

    const maxInputTokens = this.lyriaFamTokenMax[model];

    const { input, systemInstruction } = await this.formatInteractionsHistory(
      msgs,
      keyFingerprint,
      systemPrompt,
      keyId ?? undefined,
      apiKey
    );

    const toContentGen = this.interactionStepsToContents(input);

    const getTokens = await this.getTokens(toContentGen, model, apiKey);

    let lyriaInput: (
      Interactions.ModelOutputStep | Interactions.UserInputStep
    )[];

    if (
      getTokens?.totalTokens &&
      getTokens.totalTokens < maxInputTokens - 4000
    ) {
      lyriaInput = input;
    } else {
      if (input.length < 50) {
        lyriaInput = input;
      } else {
        lyriaInput = input.slice(input.length - 50);
      }
    }

    return {
      input: lyriaInput,
      model,
      store: false,
      system_instruction: systemInstruction,
      response_format: [
        {
          type: "audio"
        },
        { type: "text", mime_type: "text/plain" }
      ],
      stream: true,
      generation_config: {
        max_output_tokens: max_tokens
      }
    } satisfies Interactions.CreateModelInteractionParamsStreaming;
  }

  protected async interactionCreate({
    model = "gemini-3.1-pro-preview",
    imgGenFields,
    ...rest
  }: InteractionConfigProps) {
    const m = model ?? "gemini-3.1-pro-preview";
    if (this.isNanoBananaFam(m) && typeof imgGenFields !== "undefined") {
      return await this.interactionNanoBananas({
        model: m,
        imgGenFields: imgGenFields,
        ...rest
      });
    } else if (this.isLyriaModel(m)) {
      return await this.interactionLyria({
        model: m,
        ...rest
      });
    } else {
      return await this.interactionChat({
        model: m,
        imgGenFields: undefined,
        ...rest
      });
    }
  }
}

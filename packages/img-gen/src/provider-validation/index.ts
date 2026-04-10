import type {
  AIChatRequest,
  AllModelsUnion,
  BaseNanoBananaOutputAR,
  GeminiImageQuality,
  GeminiImageSize,
  GeminiImgGenModels,
  GeminiModelIdUnionImgGen,
  GetModelUtilRT,
  GoogleSafetyFilterLevel,
  GrokImagineARUnion,
  GrokImagineImgModelUnion,
  GrokImgGenModels,
  ImagenOutputSize,
  NanoBanana2OutputAR,
  OpenAIImgCapableModels,
  OpenAIImgGenFacilitatingModels,
  OpenAIImgGenModels,
  OpenAINativeImgModelAspectRatioWorkup,
  OpenAINativeImgModelQualityWorkup,
  Provider,
  Rm
} from "@slipstream/types";

export type AllPureImgGenModelsUnion =
  | OpenAIImgGenModels
  | Exclude<GeminiImgGenModels, "deep-research-pro-preview-12-2025">
  | GrokImgGenModels;

export type AllImgGenCapableModelUnion =
  | OpenAIImgGenFacilitatingModels
  | OpenAIImgGenModels
  | GeminiImgGenModels
  | GrokImgGenModels;

export type ModelToAspectRatioOpts<T extends AllModelsUnion> =
  T extends AllImgGenCapableModelUnion
    ? T extends GeminiModelIdUnionImgGen
      ? GeminiImageSize[GeminiModelIdUnionImgGen]
      : T extends GrokImagineImgModelUnion
        ? GrokImagineARUnion
        : T extends OpenAIImgCapableModels
          ? OpenAINativeImgModelAspectRatioWorkup["gpt-image-1.5"]
          : undefined
    : undefined;

export type ModelToQualityOpts<T extends AllModelsUnion> =
  T extends AllImgGenCapableModelUnion
    ? T extends GeminiImgGenModels
      ? T extends
          | "gemini-3-pro-image-preview"
          | "gemini-3.1-flash-image-preview"
          | "deep-research-pro-preview-12-2025"
        ? T extends "gemini-3.1-flash-image-preview"
          ? GeminiImageQuality["gemini-3.1-flash-image-preview"]
          : GeminiImageQuality[
              | "gemini-3-pro-image-preview"
              | "deep-research-pro-preview-12-2025"]
        : T extends
              | "imagen-4.0-generate-001"
              | "imagen-4.0-fast-generate-001"
              | "imagen-4.0-ultra-generate-001"
          ? GeminiImageQuality["imagen-4.0-fast-generate-001"]
          : undefined
      : T extends GrokImagineImgModelUnion
        ? "1k" | "2k" | "4k" | "auto"
        : T extends OpenAIImgCapableModels
          ? OpenAINativeImgModelQualityWorkup["gpt-image-1.5"]
          : undefined
    : undefined;

export type ModelToOutputFormatOpts<Q extends AllModelsUnion> =
  Q extends OpenAIImgCapableModels
    ? "png" | "jpeg" | "webp" | undefined
    : Q extends
          | "imagen-4.0-generate-001"
          | "imagen-4.0-fast-generate-001"
          | "imagen-4.0-ultra-generate-001"
      ? "image/png" | "image/jpeg" | undefined
      : undefined;

export type BackgroundFormattingOpts = {
  background?: "auto" | "transparent" | "opaque";
  format?: "png" | "jpeg" | "webp";
};

export type ModelToBackgroundFormatOpts<Q extends AllModelsUnion> =
  Q extends OpenAIImgCapableModels ? BackgroundFormattingOpts : undefined;

export type ModelToOutputFormatOptsProps<Q extends AllModelsUnion> = {
  format: ModelToOutputFormatOpts<Q>;
};

export type ModelToQualityOptsProps<T extends AllModelsUnion> = {
  output_quality: ModelToQualityOpts<T>;
};
export class ProviderValidation {
  public grokImgGenCapable(m: string) {
    return this.grokImagineImgGenModel(m);
  }

  public grokImagineImgGenModel(m: string) {
    return m === "grok-imagine-image" || m === "grok-imagine-image-pro";
  }

  public openAIGptImgModel(m: string) {
    return (
      m === "gpt-image-1" || m === "gpt-image-1-mini" || m === "gpt-image-1.5"
    );
  }

  public openAIFacilitatingImgGenModel(model: string) {
    return (
      model === "gpt-5.4" ||
      model === "gpt-5.4-mini" ||
      model === "gpt-5.4-nano" ||
      model === "gpt-5.4-pro" ||
      model === "gpt-4.1" ||
      model === "gpt-4.1-mini" ||
      model === "gpt-4.1-nano" ||
      model === "gpt-5" ||
      model === "gpt-5-mini" ||
      model === "gpt-5-nano" ||
      model === "gpt-5-chat-latest" ||
      model === "gpt-5-pro" ||
      model === "gpt-4o" ||
      model === "gpt-4o-mini" ||
      model === "o3" ||
      model === "gpt-5.1" ||
      model === "gpt-5.2-pro" ||
      model === "gpt-5.2"
    );
  }
  public openAIImgGenCapable(model: string) {
    return (
      this.openAIFacilitatingImgGenModel(model) || this.openAIGptImgModel(model)
    );
  }

  public geminiNanoBananaTwo(m: string) {
    return m === "gemini-3.1-flash-image-preview";
  }
  public geminiNanoBananasModel(m: string) {
    return (
      m === "deep-research-pro-preview-12-2025" ||
      this.geminiNanoBananaTwo(m) ||
      m === "gemini-2.5-flash-image" ||
      m === "gemini-3-pro-image-preview"
    );
  }
  public geminiImageGenModel(m: string) {
    return (
      m === "imagen-4.0-fast-generate-001" ||
      m === "imagen-4.0-generate-001" ||
      m === "imagen-4.0-ultra-generate-001"
    );
  }

  public geminiImgGenCapable(m: string) {
    return this.geminiNanoBananasModel(m) || this.geminiImageGenModel(m);
  }

  public isImgGenCapableModel(model: AllImgGenCapableModelUnion): true;
  public isImgGenCapableModel(
    model: Exclude<AllModelsUnion, AllImgGenCapableModelUnion>
  ): false;
  public isImgGenCapableModel<const V extends AllModelsUnion = AllModelsUnion>(
    model = "gpt-5.4" as V
  ) {
    if (
      this.grokImgGenCapable(model) ||
      this.geminiImgGenCapable(model) ||
      this.openAIImgGenCapable(model)
    )
      return true;
    else return false;
  }

  public isPureImgGenModel(model: AllPureImgGenModelsUnion): true;
  public isPureImgGenModel(
    model: Exclude<AllModelsUnion, AllPureImgGenModelsUnion>
  ): false;
  public isPureImgGenModel<const V extends AllModelsUnion = AllModelsUnion>(
    model = "gpt-5.4" as V
  ) {
    if (
      !(
        this.grokImgGenCapable(model) ||
        this.geminiImgGenCapable(model) ||
        this.openAIGptImgModel(model)
      )
    ) {
      return false;
    } else {
      if (model === "deep-research-pro-preview-12-2025") return false;
      else return true;
    }
  }

  public handleGoogleSafetyFilter(
    model?: AllModelsUnion,
    data?: { safetyFilterLevel?: keyof typeof GoogleSafetyFilterLevel }
  ) {
    if (!model) return undefined;
    if (!this.geminiImgGenCapable(model)) {
      return undefined;
    } else {
      return data?.safetyFilterLevel ?? "BLOCK_NONE";
    }
  }

  public handleImgGenCount(
    model?: Exclude<
      AllModelsUnion,
      Exclude<AllModelsUnion, AllImgGenCapableModelUnion>
    >,
    data?: { n?: number }
  ): number;
  public handleImgGenCount(
    model?: AllModelsUnion,
    data?: { n?: number }
  ): undefined;
  public handleImgGenCount(
    model: AllModelsUnion = "gpt-5.4",
    data?: { n?: number }
  ) {
    if (this.grokImgGenCapable(model)) {
      if (data?.n) {
        if (data.n < 1) return 1;
        if (data.n > 10) return 10;
        return data.n;
      } else return 1;
    }
    if (this.geminiImgGenCapable(model)) {
      if (this.geminiImageGenModel(model)) {
        if (data?.n) {
          if (data.n < 1) return 1;
          if (data.n > 4) return 4;
          return data.n;
        } else return 1;
      } else {
        if (data?.n) {
          if (data.n < 1) return 1;
          if (data.n > 10) return 10;
          return data.n;
        } else return 1;
      }
    }

    if (this.openAIImgGenCapable(model)) {
      if (data?.n) {
        if (data.n < 1) return 1;
        if (data.n > 10) return 10;
        return data.n;
      } else return 1;
    } else return undefined;
  }

  public isValidGeminiOutputFormat(format: string) {
    return format === "image/png" || format === "image/jpeg";
  }
  public isValidOpenAIOutputFormat(f: string) {
    return f === "png" || f === "jpeg" || f === "webp";
  }

  public handleImgGenOutputFormat(
    model: AllModelsUnion = "gpt-5.4",
    data?: { format?: ModelToOutputFormatOpts<typeof model> }
  ) {
    const m = model;
    const f = data?.format;
    if (!m) return undefined;

    if (!(this.openAIImgGenCapable(m) || this.geminiImageGenModel(m))) return;
    if (f && this.isValidOpenAIOutputFormat(f)) {
      return f;
    }
    if (f && this.isValidGeminiOutputFormat(f)) {
      return f;
    } else return f;
  }

  public handleImgGenBg(
    model?: AllModelsUnion,
    data?: {
      background?: "transparent" | "opaque" | "auto";
      format?: "png" | "jpeg" | "webp";
    }
  ) {
    if (!model) return;
    if (!this.openAIImgGenCapable(model)) return;
    if (!data?.format) return;
    if (!(data?.format === "png" || data?.format === "webp")) return;
    if (
      data?.background &&
      /^(transparent|opaque|auto)$/gm.test(data.background)
    )
      return data.background;
    else return "auto";
  }

  /**
   * **gpt-image-1 and gpt-image-1.5 only**
   */
  public handleInputFidelity(
    provider: Provider,
    model?: GetModelUtilRT<typeof provider>,
    data?: {
      input_fidelity?: "low" | "high" | (string & {}) | null;
    }
  ) {
    if (!model) return;
    if (!this.openAIImgGenCapable(model)) return;

    const d = data?.input_fidelity;

    if (d && /^(low|high)$/gm.test(d)) {
      return d;
    } else return "high";
  }

  public handleImgGenCompression(
    model?: AllModelsUnion,
    data?: {
      output_compression?: number | undefined;
      output_format?: "png" | "jpeg" | "webp" | (string & {}) | undefined;
    }
  ) {
    if (!model) return;

    const m = model;

    if (
      !(
        this.geminiImageGenModel(m) ||
        this.openAIFacilitatingImgGenModel(m) ||
        this.openAIGptImgModel(m)
      )
    ) {
      return;
    }
    const f = data?.output_format as "png" | "jpeg" | "webp" | undefined;

    if (this.geminiImageGenModel(m)) {
      if (typeof data?.output_compression === "undefined") return 75;
      return data?.output_compression >= 0 && data?.output_compression <= 100
        ? data.output_compression
        : data.output_compression > 100
          ? 100
          : 75;
    } else {
      if (typeof f !== "undefined") {
        if (typeof data?.output_compression !== "undefined") {
          return f === "png"
            ? undefined
            : data.output_compression >= 0 && data.output_compression <= 100
              ? data.output_compression
              : 100;
        } else return 100;
      } else return;
    }
  }

  public handleModeration(
    model?: AllModelsUnion,
    data?: { moderation?: "auto" | "low" | (string & {}) }
  ) {
    if (!model) return;
    if (
      !(
        this.openAIFacilitatingImgGenModel(model) ||
        this.openAIGptImgModel(model)
      )
    )
      return;
    if (
      typeof data?.moderation !== "undefined" &&
      /^(low|auto)$/gm.test(data.moderation)
    ) {
      return data.moderation;
    } else return "low";
  }

  public handlePersonGeneration(
    model?: AllModelsUnion,
    data?: {
      personGeneration?:
        | "DONT_ALLOW"
        | "ALLOW_ADULT"
        | "ALLOW_ALL"
        | (string & {});
    }
  ) {
    if (!model) return;
    if (!this.geminiImageGenModel(model)) return;
    const p = data?.personGeneration;
    if (typeof p !== "undefined") {
      if (/^(dont_allow|allow_(all|adult))$/gim.test(p)) {
        return p;
      } else return "ALLOW_ADULT";
    } else return "ALLOW_ADULT";
  }

  /**1:1 | 2:3 | 3:2 | 3:4 | 4:3 | 16:9 | 9:16 | 19\.5:9 | 9:19\.5 | 9:20 | 20:9 | 1:2 | 2:1 | auto */

  public isValidGrokAR(ar: string) {
    return (
      ar === "1:1" ||
      ar === "1:2" ||
      ar === "2:1" ||
      ar === "2:3" ||
      ar === "3:2" ||
      ar === "3:4" ||
      ar === "4:3" ||
      ar === "9:16" ||
      ar === "16:9" ||
      ar === "19.5:9" ||
      ar === "9:19.5" ||
      ar === "20:9" ||
      ar === "9:20" ||
      ar === "auto"
    );
  }

  public isValidOpenAIQuality(ar: string) {
    return ar === "low" || ar === "medium" || ar === "high" || ar === "auto";
  }

  public isValidGrokQuality(q: string) {
    return q === "1k" || q === "2k";
  }

  public isValidImagenAR(ar: string) {
    return (
      ar === "1:1" ||
      ar === "3:4" ||
      ar === "4:3" ||
      ar === "9:16" ||
      ar === "16:9"
    );
  }

  public isValidNanoBananaGenOneAR(ar: string) {
    return (
      this.isValidImagenAR(ar) ||
      ar === "2:3" ||
      ar === "3:2" ||
      ar === "4:5" ||
      ar === "5:4" ||
      ar === "21:9"
    );
  }

  public isValidNanoBananaGenTwoAR(ar: string) {
    return (
      this.isValidNanoBananaGenOneAR(ar) ||
      ar === "1:4" ||
      ar === "4:1" ||
      ar === "8:1" ||
      ar === "1:8"
    );
  }

  public geminiAspectRatio(
    m: "gemini-3.1-flash-image-preview",
    data?: { output_size: NanoBanana2OutputAR }
  ): NanoBanana2OutputAR | undefined;

  public geminiAspectRatio(
    m:
      | "gemini-3-pro-image-preview"
      | "gemini-2.5-flash-image"
      | "deep-research-pro-preview-12-2025",
    data?: { output_size: BaseNanoBananaOutputAR }
  ): BaseNanoBananaOutputAR | undefined;
  public geminiAspectRatio(
    m:
      | "imagen-4.0-generate-001"
      | "imagen-4.0-fast-generate-001"
      | "imagen-4.0-ultra-generate-001",
    data?: { output_size: ImagenOutputSize }
  ): ImagenOutputSize | undefined;
  public geminiAspectRatio(
    m: GeminiImgGenModels,
    data?: {
      output_size:
        | BaseNanoBananaOutputAR
        | NanoBanana2OutputAR
        | ImagenOutputSize;
    }
  ) {
    if (!data?.output_size) return;
    if (this.geminiImageGenModel(m) && this.isValidImagenAR(data.output_size)) {
      return data.output_size;
    }
    if (this.geminiNanoBananasModel(m)) {
      if (
        m === "gemini-3.1-flash-image-preview" &&
        this.isValidNanoBananaGenTwoAR(data.output_size)
      ) {
        return data.output_size;
      }
      if (this.isValidNanoBananaGenOneAR(data.output_size)) {
        return data.output_size;
      }
    }
  }

  public isValidImagenOutputQuality(q: string) {
    return q === "1K" || q === "2K";
  }

  public isValidNanoBananaProAndTwoOutputQuality(q: string) {
    return this.isValidImagenOutputQuality(q) || q === "4K";
  }

  public isValidNanoBananaTwoOutputQuality(q: string) {
    return this.isValidNanoBananaProAndTwoOutputQuality(q) || q === "0.5K";
  }

  public handleImgGenOutputQuality(
    model: AllModelsUnion = "gpt-5.4",
    data?: { output_quality: ModelToQualityOpts<typeof model> }
  ) {
    const q = data?.output_quality;
    if (!model) return;
    const m = model;

    if (this.geminiNanoBananasModel(m) && m !== "gemini-2.5-flash-image") {
      if (q && this.isValidNanoBananaProAndTwoOutputQuality(q)) {
        return q;
      } else return "2K";
    }
    if (this.geminiNanoBananaTwo(m)) {
      if (q && this.isValidNanoBananaTwoOutputQuality(q)) {
        return q;
      } else {
        return "2K" as const satisfies GeminiImageQuality["gemini-3.1-flash-image-preview"];
      }
    }
    if (this.geminiImageGenModel(m)) {
      if (q && this.isValidImagenOutputQuality(q)) {
        return q;
      } else return "1K";
    }
    if (this.grokImagineImgGenModel(model)) {
      if (q && this.isValidGrokQuality(q)) {
        return q;
      } else {
        if (m === "grok-imagine-image-pro") {
          return "2k";
        } else return "1k";
      }
    }
    if (this.openAIImgGenCapable(model)) {
      if (q && this.isValidOpenAIQuality(q)) {
        return q;
      } else return "auto";
    }
  }

  public fallbackImgGenModelByProvider(provider: Provider) {
    switch (provider) {
      case "gemini": {
        return "gemini-3.1-flash-image-preview" satisfies AllModelsUnion;
      }
      case "grok": {
        return "grok-imagine-image" satisfies AllModelsUnion;
      }
      case "openai": {
        return "gpt-5.4" satisfies AllModelsUnion;
      }
      case "cohere":
      case "mistral":
      case "anthropic":
      case "deepseek":
      case "moonshotai":
      case "zai":
      case "meta":
      case "vercel":
      default: {
        return undefined;
      }
    }
  }

  public isValidOpenAISize(ar: string) {
    return (
      ar === "1024x1024" ||
      ar === "1024x1536" ||
      ar === "1536x1024" ||
      ar === "auto"
    );
  }

  public handlePartialImgGen(
    model: AllModelsUnion = "gpt-5.4",
    data?: { partialImagesRequested?: number }
  ) {
    if (this.openAIImgGenCapable(model)) {
      if (data?.partialImagesRequested) {
        if (
          data.partialImagesRequested >= 0 &&
          data.partialImagesRequested <= 3
        ) {
          return data.partialImagesRequested;
        }
        if (data.partialImagesRequested > 3) {
          return 3;
        }
        if (data.partialImagesRequested <= 0) {
          return 0;
        }
      } else return 0;
    }
  }

  public handleOutputSize<const M extends AllModelsUnion = AllModelsUnion>(
    model = "gpt-5.4" as M,
    data?: { output_size?: ModelToAspectRatioOpts<typeof model> }
  ) {
    if (!model) return;
    const m = model;
    if (
      !(
        this.geminiImgGenCapable(m) ||
        this.grokImagineImgGenModel(m) ||
        this.openAIImgGenCapable(m)
      )
    )
      return;

    if (this.grokImagineImgGenModel(m)) {
      const ar = data?.output_size;

      if (ar && this.isValidGrokAR(ar)) {
        return ar;
      } else return "auto" as const;
    }

    if (this.geminiImgGenCapable(m)) {
      const ar = data?.output_size;
      if (this.geminiImageGenModel(m)) {
        if (ar && this.isValidImagenAR(ar)) {
          return ar;
        } else return "1:1";
      }

      if (m === "gemini-3.1-flash-image-preview") {
        if (ar && this.isValidNanoBananaGenTwoAR(ar)) {
          return ar;
        } else return "1:1";
      }
      if (this.geminiNanoBananasModel(m)) {
        if (ar && this.isValidNanoBananaGenOneAR(ar)) {
          return ar;
        } else return "1:1";
      } else return "1:1" satisfies NanoBanana2OutputAR;
    }
    if (this.openAIImgGenCapable(m)) {
      const ar = data?.output_size;
      if (ar && this.isValidOpenAISize(ar)) {
        return data.output_size;
      } else return "auto" as const;
    }
  }

  public providerToPrismaFormat(props: Provider) {
    return props.toUpperCase() as Uppercase<typeof props>;
  }

  public handleAiChatRequestImgGenWorkup({
    userId,
    batchId,
    provider,
    conversationId,
    ...data
  }: Rm<AIChatRequest, "type"> & {
    userId: string;
    apiKey: string | null;
    keyId: string | null;
  }) {
    const model =
      data?.model ?? this.fallbackImgGenModelByProvider(provider) ?? "gpt-5.4";

    const outputCompression = this.handleImgGenCompression(model, {
        output_compression: data.imgGenFields?.output_compression,
        output_format: data.imgGenFields?.output_format
      }),
      outputBackground = this.handleImgGenBg(model, {
        background: data.imgGenFields?.output_background,
        format:
          (data.imgGenFields?.output_format as
            | "jpeg"
            | "png"
            | "webp"
            | undefined) ?? "png"
      }),
      moderation = this.handleModeration(model, {
        moderation: data.imgGenFields?.moderation
      }),
      negativePrompt = data?.imgGenFields?.negativePrompt ?? undefined,
      seed = data?.imgGenFields?.seed ?? undefined,
      nRequested = this.handleImgGenCount(model, {
        n: data.imgGenFields?.n
      }),
      inputFidelity = this.handleInputFidelity(provider, model, {
        input_fidelity: data.imgGenFields?.input_fidelity
      }),
      personGeneration = this.handlePersonGeneration(model, {
        personGeneration: data.imgGenFields?.personGeneration
      }),
      progress = 0,
      partialImagesRequested = this.handlePartialImgGen(model, {
        partialImagesRequested: data.imgGenFields?.output_partial_images
      }),
      outputFormat =
        provider === "grok"
          ? "png"
          : (data?.imgGenFields?.output_format ?? "png"),
      outputSize = this.handleOutputSize(
        model,
        data.imgGenFields?.output_size as Parameters<
          typeof this.handleOutputSize
        >["1"]
      ),
      stage = "QUEUED",
      temperature = data.temperature,
      systemPrompt = data.systemPrompt,
      maxTokens = data.maxTokens,
      prompt = data?.prompt,
      topP = data?.topP,
      nCompleted = 0,
      outputQuality = this.handleImgGenOutputQuality(
        model,
        data.imgGenFields?.output_quality as Parameters<
          typeof this.handleImgGenOutputQuality
        >["1"]
      ),
      apiKey = data.apiKey,
      keyId = data.keyId,
      userKeyId = keyId,
      isImageGen = true,
      imageGenJob = {
        create: {
          userKeyId,
          userId,
          inputFidelity,
          moderation,
          negativePrompt,
          nRequested,
          nCompleted,
          outputBackground,
          outputCompression,
          outputFormat,
          partialImagesRequested,
          outputSize,
          progress,
          seed,
          personGeneration,
          stage,
          outputQuality,
          topP,
          model:
            model ??
            this.fallbackImgGenModelByProvider(provider) ??
            "gpt-image-1.5",
          prompt,
          provider: this.providerToPrismaFormat(provider)
        }
      } as const,
      messageBlocks = {
        create: [
          {
            content: prompt,
            durationMs: 0,
            type: "TEXT",
            conversationId,
            ordinal: 0
          }
        ]
      } as const,
      messageData = {
        content: prompt,
        provider: this.providerToPrismaFormat(provider),
        senderType: "USER",
        model: model ?? "gpt-image-1.5",
        messageType: "IMAGE_GEN",
        userId,
        userKeyId,
        isImageGen,
        imageGenJob,
        messageBlocks
      } as const,
      includeWithAttachments = {
        conversationSettings: true,
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            imageGenJob: true,
            messageBlocks: { orderBy: { ordinal: "asc" } },
            attachments: {
              where: {
                OR: [
                  { origin: { not: "GENERATED" } },
                  {
                    AND: [
                      { origin: "GENERATED" },
                      { imageGenOutput: { kind: "FINAL" } }
                    ]
                  }
                ]
              },
              orderBy: { createdAt: "asc" },
              include: {
                image: true,
                document: true,
                audio: true,
                imageGenOutput: true
              }
            }
          }
        }
      } as const,
      includeSansAttachments = {
        conversationSettings: true,
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            imageGenJob: true,
            messageBlocks: { orderBy: { ordinal: "asc" } },
            attachments: {
              where: {
                OR: [
                  { origin: { not: "GENERATED" } },
                  {
                    AND: [
                      { origin: "GENERATED" },
                      { imageGenOutput: { kind: "FINAL" } }
                    ]
                  }
                ]
              },
              orderBy: { createdAt: "asc" },
              include: {
                image: true,
                document: true,
                audio: true,
                imageGenOutput: true
              }
            }
          }
        }
      } as const;
    return {
      outputBackground,
      outputCompression,
      outputFormat,
      outputQuality,
      outputSize,
      partialImagesRequested,
      personGeneration,
      progress,
      prompt,
      provider,
      model,
      moderation,
      imageGenJob,
      nCompleted,
      nRequested,
      topP,
      negativePrompt,
      seed,
      temperature,
      stage,
      userId,
      userKeyId,
      systemPrompt,
      messageData,
      includeSansAttachments,
      includeWithAttachments,
      inputFidelity,
      maxTokens,
      conversationId,
      batchId,
      apiKey
    };
  }
}

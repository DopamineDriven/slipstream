import type {
  AIChatRequest,
  AllModelsUnion,
  BaseNanoBananaOutputAR,
  BaseOpenAISize,
  GeminiImageQuality,
  GeminiImgGenModels,
  GetModelUtilRT,
  GoogleImgSizeQualityOpts,
  GoogleSafetyFilterLevel,
  GPTImage2Size,
  GrokImagine2ARUnion,
  GrokImagine2QualityUnion,
  GrokImagineARUnion,
  GrokImagineImgModelUnion,
  GrokImagineQualityUnion,
  GrokImgGenModels,
  ImagenOutputSize,
  MetaImgGenModels,
  MetaImgSize,
  NanoBanana2OutputAR,
  OpenAIBaseQuality,
  OpenAIGptImage2Point5Quality,
  OpenAIImgCapableModels,
  OpenAIImgGenModels,
  Provider,
  Rm
} from "@slipstream/types";

export type AllPureImgGenModelsUnion =
  | OpenAIImgGenModels
  | Exclude<
      GeminiImgGenModels,
      "deep-research-max-preview-04-2026" | "deep-research-preview-04-2026"
    >
  | GrokImgGenModels
  | MetaImgGenModels;

export type AllImgGenCapableModelUnion =
  | OpenAIImgCapableModels
  | GeminiImgGenModels
  | GrokImgGenModels
  | MetaImgGenModels;

export type AllNonImgGenCapableUnion = Exclude<
  AllModelsUnion,
  AllImgGenCapableModelUnion
>;

export type ModelToAspectRatioOpts<T extends AllModelsUnion> =
  T extends AllNonImgGenCapableUnion
    ? undefined
    : T extends MetaImgGenModels
      ? MetaImgSize
      : T extends Exclude<GrokImagineImgModelUnion, "grok-imagine-image-2.0">
        ? GrokImagineARUnion
        : T extends "grok-imagine-image-2.0"
          ? GrokImagine2ARUnion
          : T extends
                "gemini-3.1-flash-image-preview" | "gemini-3.1-flash-lite-image"
            ? NanoBanana2OutputAR
            : T extends Exclude<
                  GeminiImgGenModels,
                  | "gemini-3.1-flash-image-preview"
                  | "gemini-3.1-flash-lite-image"
                >
              ? BaseNanoBananaOutputAR
              : T extends "gpt-image-1-mini" | "gpt-image-1" | "gpt-image-1.5"
                ? BaseOpenAISize
                : T extends Exclude<
                      OpenAIImgCapableModels,
                      "gpt-image-1-mini" | "gpt-image-1" | "gpt-image-1.5"
                    >
                  ? GPTImage2Size
                  : never;

export type ModelToQuality<T extends AllModelsUnion> =
  T extends AllNonImgGenCapableUnion
    ? undefined
    : T extends
          "gpt-image-1-mini" | "gpt-image-1" | "gpt-image-1.5" | "gpt-image-2"
      ? OpenAIBaseQuality
      : T extends Exclude<
            OpenAIImgCapableModels,
            "gpt-image-1-mini" | "gpt-image-1" | "gpt-image-1.5" | "gpt-image-2"
          >
        ? OpenAIGptImage2Point5Quality
        : T extends "grok-imagine-image-2.0"
          ? GrokImagine2QualityUnion
          : T extends Exclude<
                GrokImagineImgModelUnion,
                "grok-imagine-image-2.0"
              >
            ? GrokImagineQualityUnion
            : T extends "gemini-3.1-flash-image-preview"
              ? GoogleImgSizeQualityOpts["quality"][T]
              : T extends "gemini-2.5-flash-image"
                ? GeminiImageQuality[T]
                : T extends "gemini-3.1-flash-lite-image"
                  ? GeminiImageQuality[T]
                  : T extends
                        | "gemini-3-pro-image-preview"
                        | "deep-research-max-preview-04-2026"
                        | "deep-research-preview-04-2026"
                    ? GeminiImageQuality[T]
                    : undefined;

export type ModelToOutputFormatOpts<Q extends AllModelsUnion> =
  Q extends OpenAIImgCapableModels
    ? "png" | "jpeg" | "webp" | undefined
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
  output_quality: ModelToQuality<T>;
};
export class ProviderValidation {
  public grokImgGenCapable(m: string) {
    return this.grokImagineImgGenModel(m);
  }

  public grokImagineImgGenModel(m: string) {
    return (
      m === "grok-imagine-image" ||
      m === "grok-imagine-image-quality" ||
      m === "grok-imagine-image-2.0"
    );
  }

  public metaImgGenCapable(m: string) {
    return m === "muse-image-1.0";
  }

  public baseOpenAIGptImgModel(m: string) {
    return (
      m === "gpt-image-1" || m === "gpt-image-1-mini" || m === "gpt-image-1.5"
    );
  }

  public gptImg2Model(m: string) {
    return m === "gpt-image-2";
  }

  public gptImg2dot5Model(m: string) {
    return m === "gpt-image-2.5-flare" || m === "gpt-image-2.5-sunburst";
  }

  public openAIGptImgModel(m: string) {
    return (
      this.baseOpenAIGptImgModel(m) ||
      this.gptImg2Model(m) ||
      this.gptImg2dot5Model(m)
    );
  }

  public openAIFacilitatingImgGenModel(model: string) {
    return (
      model === "gpt-6-astra" ||
      model === "gpt-5.6-sol" ||
      model === "gpt-5.6-terra" ||
      model === "gpt-5.6-luna" ||
      model === "gpt-5.5" ||
      model === "gpt-5.5-pro" ||
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
  public geminiNanoBananaTwoLite(m: string) {
    return m === "gemini-3.1-flash-lite-image";
  }
  public geminiNanoBananaTwo(m: string) {
    return m === "gemini-3.1-flash-image-preview";
  }
  public geminiDeepResearchModel(m: string) {
    return (
      m === "deep-research-max-preview-04-2026" ||
      m === "deep-research-preview-04-2026"
    );
  }

  public geminiNanoBananasModel(m: string) {
    return (
      this.geminiNanoBananaTwoLite(m) ||
      this.geminiDeepResearchModel(m) ||
      this.geminiNanoBananaTwo(m) ||
      m === "gemini-2.5-flash-image" ||
      m === "gemini-3-pro-image-preview"
    );
  }

  public geminiImgGenCapable(m: string) {
    return this.geminiNanoBananasModel(m);
  }

  public isImgGenCapableModel<const V extends string = string>(
    model = "gpt-6-astra" as V
  ) {
    if (
      this.grokImgGenCapable(model) ||
      this.geminiImgGenCapable(model) ||
      this.openAIImgGenCapable(model) ||
      this.metaImgGenCapable(model)
    )
      return true;
    else return false;
  }

  public isPureImgGenModel(model: AllPureImgGenModelsUnion): true;
  public isPureImgGenModel(
    model: Exclude<AllModelsUnion, AllPureImgGenModelsUnion>
  ): false;
  public isPureImgGenModel<const V extends AllModelsUnion = AllModelsUnion>(
    model = "gpt-6-astra" as V
  ) {
    if (!(
      this.grokImgGenCapable(model) ||
      this.geminiImgGenCapable(model) ||
      this.openAIGptImgModel(model) ||
      this.metaImgGenCapable(model)
    )) {
      return false;
    } else {
      if (
        model === "deep-research-max-preview-04-2026" ||
        model === "deep-research-preview-04-2026"
      )
        return false;
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
    model: AllModelsUnion = "gpt-6-astra",
    data?: { n?: number }
  ) {
    if (this.grokImgGenCapable(model)) {
      if (data?.n) {
        if (data.n < 1) return 1;
        if (data.n > 10) return 10;
        return data.n;
      } else return 1;
    } else if (this.geminiImgGenCapable(model)) {
      if (data?.n) {
        if (data.n < 1) return 1;
        if (data.n > 10) return 10;
        return data.n;
      } else return 1;
    } else if (this.openAIImgGenCapable(model)) {
      if (data?.n) {
        if (data.n < 1) return 1;
        if (data.n > 10) return 10;
        return data.n;
      } else return 1;
    } else if (this.metaImgGenCapable(model)) {
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
  public isValidOpenAIBg(b: string) {
    return b === "auto" || b === "transparent" || b === "opaque";
  }
  public isValidMetaOututFormat(f: string) {
    return f === "png" || f === "jpeg" || f === "webp";
  }
  public handleImgGenOutputFormat(
    model: AllModelsUnion = "gpt-6-astra",
    data?: { format?: ModelToOutputFormatOpts<typeof model> }
  ) {
    const m = model;
    const f = data?.format;
    if (!m) return undefined;
    if (this.metaImgGenCapable(m)) {
      if (f && this.isValidMetaOututFormat(f)) {
        return f;
      } else return "webp" as const;
    }
    if (!this.openAIImgGenCapable(m)) return;
    if (f && this.isValidOpenAIOutputFormat(f)) {
      return f;
    }
    if (f && this.isValidGeminiOutputFormat(f)) {
      return f;
    } else return f;
  }

  public handleImgGenBg(
    model?: string,
    data?: {
      background?: "transparent" | "opaque" | "auto";
      format?: "png" | "jpeg" | "webp";
    }
  ) {
    if (!model) return;
    if (!this.openAIImgGenCapable(model)) return;
    if (!data?.format) return;
    if (!(data?.format === "png" || data?.format === "webp")) return;
    if (data?.background && this.isValidOpenAIBg(data.background))
      return data.background;
    else return "auto";
  }

  /**
   * **gpt-image-1 and gpt-image-1.5 only and gpt-image-2 **
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
    if (!(model === "gpt-image-1" || model === "gpt-image-1.5")) return;

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

    if (!(this.openAIFacilitatingImgGenModel(m) || this.openAIGptImgModel(m))) {
      return;
    }
    const f = data?.output_format as "png" | "jpeg" | "webp" | undefined;

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

  public handleModeration(
    model?: AllModelsUnion,
    data?: { moderation?: "auto" | "low" | (string & {}) }
  ) {
    if (!model) return;
    if (!(
      this.openAIFacilitatingImgGenModel(model) || this.openAIGptImgModel(model)
    ))
      return;
    if (
      typeof data?.moderation !== "undefined" &&
      /^(low|auto)$/gm.test(data.moderation)
    ) {
      return data.moderation;
    } else return "low";
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

  public isValidGrok2AR(ar: string) {
    return this.isValidGrokAR(ar) || ar === "5:2" || ar === "21:9";
  }

  public isValidOpenAIQuality(q: string) {
    return q === "low" || q === "medium" || q === "high" || q === "auto";
  }

  public isValidOpenAI2Dot5Quality(q: string) {
    return this.isValidOpenAIQuality(q) || q === "xhigh" || q === "max";
  }

  public isValidGrokResolution(q: string) {
    return q === "1k" || q === "2k";
  }

  public isValidGrok2Resolution(q: string) {
    return this.isValidGrokResolution(q) || q === "1.5k";
  }

  public isValidNanoBananaGenOneAR(ar: string) {
    return (
      ar === "16:9" ||
      ar === "1:1" ||
      ar === "3:4" ||
      ar === "4:3" ||
      ar === "9:16" ||
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
      | "gemini-3.1-flash-lite-image"
      | "gemini-3-pro-image-preview"
      | "gemini-2.5-flash-image"
      | "deep-research-preview-04-2026"
      | "deep-research-max-preview-04-2026",
    data?: { output_size: BaseNanoBananaOutputAR }
  ): BaseNanoBananaOutputAR | undefined;
  public geminiAspectRatio(
    m: GeminiImgGenModels,
    data?: {
      output_size:
        BaseNanoBananaOutputAR | NanoBanana2OutputAR | ImagenOutputSize;
    }
  ) {
    if (!data?.output_size) return;
    if (this.geminiNanoBananasModel(m)) {
      if (
        (m === "gemini-3.1-flash-image-preview" ||
          m === "gemini-3.1-flash-lite-image") &&
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

  public isValidGptOutputQuality(q: string) {
    return q === "low" || q === "medium" || q === "high" || q === "auto";
  }

  public isValidGpt2Dot5OutputQuality(q: string) {
    return q === "xhigh" || q === "max" || this.isValidGptOutputQuality(q);
  }

  public isValidNanoBananaProAndTwoOutputQuality(q: string) {
    return this.isValidImagenOutputQuality(q) || q === "4K";
  }

  public isValidNanoBananaTwoOutputQuality(q: string) {
    return this.isValidNanoBananaProAndTwoOutputQuality(q) || q === "0.5K";
  }

  public isValidNanoBananaTwoLiteOutputQuality(q: string) {
    return q === "0.5K" || q === "1K";
  }

  public handleImgGenOutputQuality(
    model: Exclude<
      AllModelsUnion,
      Exclude<AllModelsUnion, AllNonImgGenCapableUnion>
    >,
    data?: { output_quality: undefined }
  ): undefined;
  public handleImgGenOutputQuality(
    model: Exclude<
      AllModelsUnion,
      Exclude<
        AllModelsUnion,
        Exclude<GrokImgGenModels, "grok-imagine-image-2.0">
      >
    >,
    data?: { output_quality: "1k" | "2k" }
  ): "1k" | "2k";
  public handleImgGenOutputQuality(
    model: Exclude<
      AllModelsUnion,
      Exclude<AllModelsUnion, "grok-imagine-image-2.0">
    >,
    data?: { output_quality: "1k" | "1.5k" | "2k" }
  ): "1k" | "1.5k" | "2k";
  public handleImgGenOutputQuality(
    model: Exclude<
      AllModelsUnion,
      Exclude<
        AllModelsUnion,
        | "gemini-3-pro-image-preview"
        | "deep-research-preview-04-2026"
        | "deep-research-max-preview-04-2026"
      >
    >,
    data?: { output_quality: "1K" | "2K" | "4K" }
  ): "1K" | "2K" | "4K";
  public handleImgGenOutputQuality(
    model: Exclude<
      AllModelsUnion,
      Exclude<AllModelsUnion, "gemini-3.1-flash-image-preview">
    >,
    data?: { output_quality: "0.5K" | "1K" | "2K" | "4K" }
  ): "0.5K" | "1K" | "2K" | "4K";
  public handleImgGenOutputQuality(
    model: Exclude<
      AllModelsUnion,
      Exclude<AllModelsUnion, "gemini-3.1-flash-lite-image">
    >,
    data?: { output_quality: "0.5K" | "1K" }
  ): "0.5K" | "1K";
  public handleImgGenOutputQuality(
    model: Exclude<
      AllModelsUnion,
      Exclude<AllModelsUnion, "gemini-2.5-flash-image">
    >,
    data?: { output_quality: "1K" }
  ): "1K";
  public handleImgGenOutputQuality(
    model: Exclude<
      AllModelsUnion,
      Exclude<
        AllModelsUnion,
        "gpt-image-1" | "gpt-image-1-mini" | "gpt-image-1.5" | "gpt-image-2"
      >
    >,
    data?: { output_quality: "high" | "medium" | "low" | "auto" }
  ): "high" | "medium" | "low" | "auto";
  public handleImgGenOutputQuality(
    model: Exclude<
      AllModelsUnion,
      Exclude<
        AllModelsUnion,
        Exclude<
          OpenAIImgCapableModels,
          "gpt-image-1" | "gpt-image-1-mini" | "gpt-image-1.5" | "gpt-image-2"
        >
      >
    >,
    data?: {
      output_quality: "max" | "xhigh" | "high" | "medium" | "low" | "auto";
    }
  ): "max" | "xhigh" | "high" | "medium" | "low" | "auto";
  public handleImgGenOutputQuality(
    model: AllModelsUnion,
    data?: {
      output_quality:
        | "0.5K"
        | "1K"
        | "1k"
        | "1.5k"
        | "2K"
        | "2k"
        | "4K"
        | "auto"
        | "high"
        | "low"
        | "max"
        | "medium"
        | "xhigh"
        | undefined;
    }
  ):
    | "0.5K"
    | "1K"
    | "1k"
    | "1.5k"
    | "2K"
    | "2k"
    | "4K"
    | "auto"
    | "high"
    | "low"
    | "max"
    | "medium"
    | "xhigh"
    | undefined;
  public handleImgGenOutputQuality(
    model: AllModelsUnion,
    data?: { output_quality: ModelToQuality<typeof model> }
  ) {
    const q = data?.output_quality;
    const m = model;
    if (this.geminiNanoBananasModel(m) && m !== "gemini-2.5-flash-image") {
      if (
        m === "gemini-3.1-flash-lite-image" &&
        q &&
        this.isValidNanoBananaTwoLiteOutputQuality(q)
      ) {
        return q;
      } else if (
        m === "gemini-3.1-flash-image-preview" &&
        q &&
        this.isValidNanoBananaTwoOutputQuality(q)
      ) {
        return q;
      }

      if (q && this.isValidNanoBananaProAndTwoOutputQuality(q)) {
        return q;
      } else return "2K";
    } else if (this.geminiNanoBananaTwo(m)) {
      if (q && this.isValidNanoBananaTwoOutputQuality(q)) {
        return q;
      } else {
        return "2K" as const satisfies GeminiImageQuality["gemini-3.1-flash-image-preview"];
      }
    } else if (this.grokImagineImgGenModel(m)) {
      if (m === "grok-imagine-image-2.0") {
        if (q && this.isValidGrok2Resolution(q)) {
          return q;
        } else return "1.5k";
      } else {
        if (q && this.isValidGrokResolution(q)) return q;
        else return "1k";
      }
    } else if (this.openAIImgGenCapable(m)) {
      if (
        (this.baseOpenAIGptImgModel(m) || this.gptImg2Model(m)) &&
        q &&
        this.isValidOpenAIQuality(q)
      ) {
        return q;
      } else if (q && this.isValidGpt2Dot5OutputQuality(q)) {
        return q;
      } else return "auto";
    } else return;
  }

  public fallbackImgGenModelByProvider(provider: Provider) {
    switch (provider) {
      case "gemini": {
        return "gemini-3.1-flash-image-preview" satisfies AllModelsUnion;
      }
      case "grok": {
        return "grok-imagine-image-2.0" satisfies AllModelsUnion;
      }
      case "openai": {
        return "gpt-6-astra" satisfies AllModelsUnion;
      }
      case "meta": {
        return "muse-image-1.0" satisfies AllModelsUnion;
      }
      case "cohere":
      case "mistral":
      case "anthropic":
      case "deepseek":
      case "moonshotai":
      case "zai":
      case "vercel":
      case "alibaba":
      case "sakana":
      case "minimax":
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

  public isValidGPTImage2Size(m: string) {
    return (
      this.isValidOpenAISize(m) ||
      m === "1536x1536" ||
      m === "2048x2048" ||
      m === "2560x2560" ||
      m === "2880x2880" ||
      // 2:3
      m === "1536x2304" ||
      m === "2048x3072" ||
      m === "2304x3456" ||
      // 3:2
      m === "2304x1536" ||
      m === "3072x2048" ||
      m === "3456x2304" ||
      // 3:4
      m === "1152x1536" ||
      m === "1536x2048" ||
      m === "1920x2560" ||
      m === "2304x3072" ||
      // 4:3
      m === "1536x1152" ||
      m === "2048x1536" ||
      m === "2560x1920" ||
      m === "3072x2304" ||
      // 4:5
      m === "1024x1280" ||
      m === "1536x1920" ||
      m === "2048x2560" ||
      m === "2304x2880" ||
      m === "2560x3200" ||
      // 5:4
      m === "1280x1024" ||
      m === "1920x1536" ||
      m === "2560x2048" ||
      m === "2880x2304" ||
      m === "3200x2560" ||
      // 9:16
      m === "1152x2048" ||
      m === "1440x2560" ||
      m === "1728x3072" ||
      m === "2016x3584" ||
      m === "2160x3840" ||
      // 16:9
      m === "2048x1152" ||
      m === "2560x1440" ||
      m === "3072x1728" ||
      m === "3584x2016" ||
      m === "3840x2160" ||
      // 10:16
      m === "960x1536" ||
      m === "1280x2048" ||
      m === "1600x2560" ||
      m === "1920x3072" ||
      m === "2240x3584" ||
      // 16:10
      m === "1536x960" ||
      m === "2048x1280" ||
      m === "2560x1600" ||
      m === "3072x1920" ||
      m === "3584x2240" ||
      // 1:2
      m === "1024x2048" ||
      m === "1280x2560" ||
      m === "1536x3072" ||
      m === "1792x3584" ||
      m === "1920x3840" ||
      // 2:1
      m === "2048x1024" ||
      m === "2560x1280" ||
      m === "3072x1536" ||
      m === "3584x1792" ||
      m === "3840x1920" ||
      // 9:21
      m === "864x2016" ||
      m === "1152x2688" ||
      m === "1440x3360" ||
      m === "1632x3808" ||
      // 21:9
      m === "2016x864" ||
      m === "2688x1152" ||
      m === "3360x1440" ||
      m === "3808x1632" ||
      // 1:3
      m === "512x1536" ||
      m === "768x2304" ||
      m === "1024x3072" ||
      m === "1280x3840" ||
      // 3:1
      m === "1536x512" ||
      m === "2304x768" ||
      m === "3072x1024" ||
      m === "3840x1280"
    );
  }

  public isValidMetaSize(s: string) {
    return this.isValidGPTImage2Size(s);
  }

  public handlePartialImgGen(
    model: AllModelsUnion = "gpt-6-astra",
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

  public handleOutputSize(
    model: AllModelsUnion = "gpt-6-astra",
    data?: { output_size?: ModelToAspectRatioOpts<typeof model> }
  ) {
    const m = model;
    const ar = data?.output_size;
    if (!m) return;
    else if (!(
      this.geminiImgGenCapable(m) ||
      this.grokImagineImgGenModel(m) ||
      this.openAIImgGenCapable(m) ||
      this.metaImgGenCapable(m)
    ))
      return;
    else if (this.metaImgGenCapable(m)) {
      if (ar && this.isValidMetaSize(ar)) {
        return ar;
      } else return "auto" as const;
    } else if (this.grokImagineImgGenModel(m)) {
      if (m === "grok-imagine-image-2.0") {
        if (ar && this.isValidGrok2AR(ar)) {
          return ar;
        } else return "auto" as const;
      } else {
        if (ar && this.isValidGrokAR(ar)) {
          return ar;
        } else return "auto" as const;
      }
    } else if (this.geminiImgGenCapable(m)) {
      if (
        m === "gemini-3.1-flash-image-preview" ||
        m === "gemini-3.1-flash-lite-image"
      ) {
        if (ar && this.isValidNanoBananaGenTwoAR(ar)) {
          return ar;
        } else return "1:1" as const;
      } else {
        if (ar && this.isValidNanoBananaGenOneAR(ar)) {
          return ar;
        } else return "1:1" as const;
      }
    } else {
      if (this.baseOpenAIGptImgModel(m)) {
        if (ar && this.isValidOpenAISize(ar)) {
          return ar;
        } else return "auto";
      } else {
        if (ar && this.isValidGPTImage2Size(ar)) {
          return ar;
        } else return "auto" as const;
      }
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
      data?.model ??
      this.fallbackImgGenModelByProvider(provider) ??
      "gpt-6-astra";
    const outputCompression = this.handleImgGenCompression(model, {
        output_compression: data.imgGenFields?.output_compression,
        output_format: data.imgGenFields?.output_format
      }),
      outputBackground = this.handleImgGenBg(model, {
        background: data.imgGenFields?.output_background,
        format:
          (data.imgGenFields?.output_format as
            "jpeg" | "png" | "webp" | undefined) ?? "png"
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
      personGeneration = undefined,
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
            "gpt-image-2",
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
        model: model ?? "gpt-image-2",
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
          // ordinal is the authoritative dense sequence — createdAt can tie
          orderBy: { ordinal: "asc" },
          include: {
            imageGenJob: true,
            audioGenJob: true,
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
                imageGenOutput: true,
                audioGenOutput: true
              }
            }
          }
        }
      } as const,
      includeSansAttachments = {
        conversationSettings: true,
        messages: {
          // ordinal is the authoritative dense sequence — createdAt can tie
          orderBy: { ordinal: "asc" },
          include: {
            imageGenJob: true,
            audioGenJob: true,
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
                imageGenOutput: true,
                audioGenOutput: true
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

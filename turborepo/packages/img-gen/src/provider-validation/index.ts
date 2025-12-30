import type {
  AIChatRequest,
  AllModelsUnion,
  GetModelUtilRT,
  GoogleSafetyFilterLevel,
  OpenAIModelAspectRatio,
  OutputSizeProps,
  Provider,
  Rm
} from "@slipstream/types";

export class ProviderValidation {
  public grokImgGenCapable(m: AllModelsUnion) {
    return m === "grok-2-image-1212";
  }

  public openAIDalle2(m: AllModelsUnion) {
    return m === "dall-e-2";
  }

  public openAIDalle3(m: AllModelsUnion) {
    return m === "dall-e-3";
  }

  public openAIGptImgModel(m: AllModelsUnion) {
    return (
      m === "gpt-image-1" || m === "gpt-image-1-mini" || m === "gpt-image-1.5"
    );
  }

  public openAINativeImgGenModel(m: AllModelsUnion) {
    return (
      this.openAIDalle2(m) || this.openAIDalle3(m) || this.openAIGptImgModel(m)
    );
  }
  public openAIFacilitatingImgGenModel(model: AllModelsUnion) {
    return (
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
  public openAIImgGenCapable(model: AllModelsUnion) {
    return (
      this.openAIFacilitatingImgGenModel(model) ||
      this.openAINativeImgGenModel(model)
    );
  }
  public geminiNanoBananasModel(m: AllModelsUnion) {
    return (
      m === "deep-research-pro-preview-12-2025" ||
      m === "gemini-2.5-flash-image" ||
      m === "gemini-3-pro-image-preview"
    );
  }
  public geminiImageGenModel(m: AllModelsUnion) {
    return (
      m === "imagen-4.0-fast-generate-001" ||
      m === "imagen-4.0-generate-001" ||
      m === "imagen-4.0-ultra-generate-001"
    );
  }

  public geminiImgGenCapable(m: AllModelsUnion) {
    return this.geminiNanoBananasModel(m) || this.geminiImageGenModel(m);
  }
  public isImgGenCapableModel<const T extends Provider = Provider>(
    provider: T,
    model?: GetModelUtilRT<typeof provider>
  ) {
    if (typeof model === "undefined") return false;
    return (
      this.grokImgGenCapable(model) ||
      this.geminiImgGenCapable(model) ||
      this.openAIImgGenCapable(model)
    );
  }

  public isPureImgGenModel(
    provider: Provider,
    model?: GetModelUtilRT<typeof provider>
  ) {
    if (!model) return false;
    if (
      !(
        this.grokImgGenCapable(model) ||
        this.geminiImgGenCapable(model) ||
        this.openAINativeImgGenModel(model)
      )
    )
      return false;
    else return true;
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

  public handleImgGenCount<const T extends Provider = Provider>(
    provider: T,
    model?: GetModelUtilRT<typeof provider>,
    data?: { n?: number }
  ) {
    const p = provider as Provider;
    if (!model) return undefined;
    switch (p) {
      case "anthropic":
      case "meta":
      case "vercel": {
        return undefined;
      }
      case "grok": {
        if (this.grokImgGenCapable(model)) {
          if (data?.n) {
            if (data.n < 1) return 1;
            if (data.n > 10) return 10;
            return data.n;
          } else return 1;
        } else return undefined;
      }
      case "gemini": {
        if (this.geminiImgGenCapable(model)) {
          if (this.geminiImageGenModel(model)) {
            if (data?.n) {
              if (data.n < 1) return 1;
              if (data.n > 4) return 4;
              return data.n;
            } else return 4;
          } else {
            if (data?.n) {
              if (data.n < 1) return 1;
              if (data.n > 10) return 10;
              return data.n;
            } else return 1;
          }
        } else return undefined;
      }
      case "openai": {
        const m = model as GetModelUtilRT<typeof p>;
        if (this.openAIImgGenCapable(m)) {
          if (this.openAIDalle2(m) || this.openAIGptImgModel(m)) {
            if (data?.n) {
              if (data.n < 1) return 1;
              if (data.n > 10) return 10;
              return data.n;
            } else return 1;
          } else {
            if (data?.n) {
              if (data.n < 1) return 1;
              if (data.n > 1) return 1;
              return data.n;
            } else return 1;
          }
        } else return undefined;
      }
      default: {
        return undefined;
      }
    }
  }

  public handleImgGenOutputFormat<const T extends Provider = Provider>(
    provider: T,
    model?: GetModelUtilRT<T>,
    data?: {
      format?: {
        openai?: "png" | "jpeg" | "webp";
        gemini?: "image/png" | "image/jpeg" | undefined;
        grok?: undefined;
        vercel?: undefined;
        meta?: undefined;
        anthropic?: undefined;
      }[T];
    }
  ): {
    openai?: "png" | "jpeg" | "webp";
    gemini?: "image/png" | "image/jpeg" | undefined;
    grok?: undefined;
    vercel?: undefined;
    meta?: undefined;
    anthropic?: undefined;
  }[T] {
    const p = provider as Provider;
    switch (p) {
      case "gemini": {
        const m = (model as GetModelUtilRT<typeof p>) ?? "gemini-2.5-pro";
        switch (m) {
          case "imagen-4.0-fast-generate-001":
          case "imagen-4.0-generate-001":
          case "imagen-4.0-ultra-generate-001": {
            if (data?.format)
              return data.format as {
                openai?: "png" | "jpeg" | "webp";
                gemini?: "image/png" | "image/jpeg" | undefined;
                grok?: undefined;
                vercel?: undefined;
                meta?: undefined;
                anthropic?: undefined;
              }[T];
            else return;
          }
          case "deep-research-pro-preview-12-2025":
          case "gemini-3-flash-preview":
          case "gemini-3-pro-image-preview":
          case "gemini-2.0-flash":
          case "gemini-2.0-flash-lite":
          case "gemini-2.5-flash":
          case "gemini-2.5-flash-image":
          case "gemini-2.5-flash-lite":
          case "gemini-2.5-pro":
          case "gemini-3-pro-preview":
          case "veo-2.0-generate-001":
          case "veo-3.0-fast-generate-001":
          case "veo-3.0-generate-001":
          case "veo-3.1-fast-generate-preview":
          case "veo-3.1-generate-preview":
          default: {
            return;
          }
        }
      }
      case "openai": {
        const m = model as GetModelUtilRT<typeof p>;
        switch (m) {
          case "gpt-image-1":
          case "gpt-image-1-mini":
          case "gpt-4.1":
          case "gpt-4.1-mini":
          case "gpt-4.1-nano":
          case "gpt-4o":
          case "gpt-4o-mini":
          case "o3":
          case "gpt-5-chat-latest":
          case "gpt-5-pro":
          case "gpt-5-mini":
          case "gpt-5-nano":
          case "gpt-5.2":
          case "gpt-5.2-pro":
          case "gpt-image-1.5":
          case "gpt-5":
          case "gpt-5.1": {
            if (
              !(
                data?.format === "png" ||
                data?.format === "webp" ||
                data?.format === "jpeg"
              )
            ) {
              return;
            } else
              return data.format as {
                openai?: "png" | "jpeg" | "webp";
                gemini?: "image/png" | "image/jpeg" | undefined;
                grok?: undefined;
                vercel?: undefined;
                meta?: undefined;
                anthropic?: undefined;
              }[T];
          }
          case "dall-e-2":
          case "dall-e-3":
          case "gpt-3.5-turbo":
          case "gpt-4":
          case "chatgpt-4o-latest":
          case "gpt-5.1-chat-latest":
          case "gpt-5.1-codex-max":
          case "gpt-5.2-chat-latest":
          case "gpt-5.1-codex":
          case "gpt-5.1-codex-mini":
          case "o1-pro":
          case "sora-2":
          case "sora-2-pro":
          case "gpt-4-turbo":
          case "gpt-5-codex":
          case "o1":
          case "o3-deep-research":
          case "o4-mini-deep-research":
          case "o3-mini":
          case "o3-pro":
          case "o4-mini":
          default: {
            return;
          }
        }
      }
      case "anthropic":
      case "grok":
      case "meta":
      case "vercel":
      default: {
        return;
      }
    }
  }

  public handleImgGenBg(
    provider: Provider,
    model?: GetModelUtilRT<typeof provider>,
    data?: {
      background?: "transparent" | "opaque" | "auto";
      format?: "png" | "jpeg" | "webp";
    }
  ) {
    if (!model) return;
    if (
      !(
        this.openAIFacilitatingImgGenModel(model) ||
        this.openAIGptImgModel(model)
      )
    )
      return;
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
    if (
      !(
        this.openAIFacilitatingImgGenModel(model) ||
        this.openAIGptImgModel(model)
      )
    )
      return;

    const d = data?.input_fidelity;

    if (d && /^(low|high)$/gm.test(d)) {
      return d;
    } else return "high";
  }

  public handleImgGenCompression(
    provider: Provider,
    model?: GetModelUtilRT<typeof provider>,
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

  public handleModeration<const T extends Provider>(
    provider: T,
    model?: GetModelUtilRT<typeof provider>,
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

  public handlePersonGeneration<const T extends Provider>(
    provider: T,
    model?: GetModelUtilRT<typeof provider>,
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

  public handleImgGenOutputQuality<const T extends Provider = Provider>(
    provider: T,
    model?: GetModelUtilRT<typeof provider>,
    data?: {
      output_quality?: {
        gemini?: "1K" | "2K" | "4K" | undefined;
        openai?:
          | "high"
          | "medium"
          | "low"
          | "auto"
          | "standard"
          | "hd"
          | undefined;
        grok?: undefined;
        meta?: undefined;
        vercel?: undefined;
        anthropic?: undefined;
      }[typeof provider];
    }
  ): {
    gemini?: "1K" | "2K" | "4K" | undefined;
    openai?: "high" | "medium" | "low" | "auto" | "standard" | "hd" | undefined;
    grok?: undefined;
    meta?: undefined;
    vercel?: undefined;
    anthropic?: undefined;
  }[T] {
    switch (provider) {
      case "gemini": {
        const m = model as GetModelUtilRT<"gemini">;
        switch (m) {
          case "deep-research-pro-preview-12-2025":
          case "gemini-3-pro-image-preview":
          case "gemini-2.5-flash-image": {
            if (
              data?.output_quality &&
              /^(1|2|4)K$/gm.test(data.output_quality)
            ) {
              return data.output_quality as "1K" | "2K" | "4K" as {
                gemini?: "1K" | "2K" | "4K" | undefined;
                openai?:
                  | "high"
                  | "medium"
                  | "low"
                  | "auto"
                  | "standard"
                  | "hd"
                  | undefined;
                grok?: undefined;
                meta?: undefined;
                vercel?: undefined;
                anthropic?: undefined;
              }[T];
            } else
              return "1K" as {
                gemini?: "1K" | "2K" | "4K" | undefined;
                openai?:
                  | "high"
                  | "medium"
                  | "low"
                  | "auto"
                  | "standard"
                  | "hd"
                  | undefined;
                grok?: undefined;
                meta?: undefined;
                vercel?: undefined;
                anthropic?: undefined;
              }[T];
          }
          case "imagen-4.0-fast-generate-001":
          case "imagen-4.0-generate-001":
          case "imagen-4.0-ultra-generate-001": {
            if (
              data?.output_quality &&
              /^(1|2)K$/gm.test(data.output_quality)
            ) {
              return data.output_quality as "1K" | "2K" as {
                gemini?: "1K" | "2K" | "4K" | undefined;
                openai?:
                  | "high"
                  | "medium"
                  | "low"
                  | "auto"
                  | "standard"
                  | "hd"
                  | undefined;
                grok?: undefined;
                meta?: undefined;
                vercel?: undefined;
                anthropic?: undefined;
              }[T];
            } else
              return "1K" as {
                gemini?: "1K" | "2K" | "4K" | undefined;
                openai?:
                  | "high"
                  | "medium"
                  | "low"
                  | "auto"
                  | "standard"
                  | "hd"
                  | undefined;
                grok?: undefined;
                meta?: undefined;
                vercel?: undefined;
                anthropic?: undefined;
              }[T];
          }
          case "gemini-3-flash-preview":
          case "gemini-3-pro-preview":
          case "gemini-2.0-flash":
          case "gemini-2.0-flash-lite":
          case "gemini-2.5-flash":
          case "gemini-2.5-flash-lite":
          case "gemini-2.5-pro":
          case "veo-2.0-generate-001":
          case "veo-3.0-fast-generate-001":
          case "veo-3.0-generate-001":
          case "veo-3.1-fast-generate-preview":
          case "veo-3.1-generate-preview":
          default: {
            return undefined;
          }
        }
      }
      case "openai": {
        if (!model) return undefined;
        const m = model as GetModelUtilRT<"openai">;
        switch (m) {
          case "dall-e-2": {
            if (
              data?.output_quality &&
              /^(standard|auto)$/gm.test(data.output_quality)
            ) {
              return data.output_quality as "standard" | "auto" as {
                gemini?: "1K" | "2K" | "4K" | undefined;
                openai?:
                  | "high"
                  | "medium"
                  | "low"
                  | "auto"
                  | "standard"
                  | "hd"
                  | undefined;
                grok?: undefined;
                meta?: undefined;
                vercel?: undefined;
                anthropic?: undefined;
              }[T];
            } else
              return "auto" as {
                gemini?: "1K" | "2K" | "4K" | undefined;
                openai?:
                  | "high"
                  | "medium"
                  | "low"
                  | "auto"
                  | "standard"
                  | "hd"
                  | undefined;
                grok?: undefined;
                meta?: undefined;
                vercel?: undefined;
                anthropic?: undefined;
              }[T];
          }
          case "dall-e-3": {
            if (
              data?.output_quality &&
              /^(standard|auto|hd)$/gm.test(data.output_quality)
            ) {
              return data.output_quality as "standard" | "hd" | "auto" as {
                gemini?: "1K" | "2K" | "4K" | undefined;
                openai?:
                  | "high"
                  | "medium"
                  | "low"
                  | "auto"
                  | "standard"
                  | "hd"
                  | undefined;
                grok?: undefined;
                meta?: undefined;
                vercel?: undefined;
                anthropic?: undefined;
              }[T];
            } else
              return "auto" as {
                gemini?: "1K" | "2K" | "4K" | undefined;
                openai?:
                  | "high"
                  | "medium"
                  | "low"
                  | "auto"
                  | "standard"
                  | "hd"
                  | undefined;
                grok?: undefined;
                meta?: undefined;
                vercel?: undefined;
                anthropic?: undefined;
              }[T];
          }
          case "gpt-4.1":
          case "gpt-4.1-mini":
          case "gpt-4.1-nano":
          case "gpt-4o":
          case "gpt-4o-mini":
          case "gpt-5.1":
          case "gpt-5":
          case "gpt-5.2":
          case "gpt-5.2-pro":
          case "gpt-image-1.5":
          case "gpt-5-mini":
          case "gpt-5-chat-latest":
          case "gpt-5-pro":
          case "gpt-5-nano":
          case "gpt-image-1":
          case "gpt-image-1-mini":
          case "o3": {
            if (
              data?.output_quality &&
              /^(high|medium|low|auto)$/gm.test(data.output_quality)
            ) {
              return data.output_quality as
                | "high"
                | "medium"
                | "low"
                | "auto" as {
                gemini?: "1K" | "2K" | "4K" | undefined;
                openai?:
                  | "high"
                  | "medium"
                  | "low"
                  | "auto"
                  | "standard"
                  | "hd"
                  | undefined;
                grok?: undefined;
                meta?: undefined;
                vercel?: undefined;
                anthropic?: undefined;
              }[T];
            } else
              return "auto" as {
                gemini?: "1K" | "2K" | "4K" | undefined;
                openai?:
                  | "high"
                  | "medium"
                  | "low"
                  | "auto"
                  | "standard"
                  | "hd"
                  | undefined;
                grok?: undefined;
                meta?: undefined;
                vercel?: undefined;
                anthropic?: undefined;
              }[T];
          }
          case "gpt-5.1-chat-latest":
          case "gpt-5.1-codex":
          case "gpt-5.1-codex-mini":
          case "gpt-3.5-turbo":
          case "gpt-4":
          case "gpt-4-turbo":
          case "gpt-5.1-codex-max":
          case "gpt-5.2-chat-latest":
          case "chatgpt-4o-latest":
          case "o1":
          case "o3-deep-research":
          case "o4-mini-deep-research":
          case "o1-pro":
          case "sora-2":
          case "sora-2-pro":
          case "gpt-5-codex":
          case "o3-mini":
          case "o3-pro":
          case "o4-mini": {
            return undefined;
          }
          default: {
            return "auto" as {
              gemini?: "1K" | "2K" | "4K" | undefined;
              openai?:
                | "high"
                | "medium"
                | "low"
                | "auto"
                | "standard"
                | "hd"
                | undefined;
              grok?: undefined;
              meta?: undefined;
              vercel?: undefined;
              anthropic?: undefined;
            }[T];
          }
        }
      }
      case "anthropic":
      case "meta":
      case "vercel":
      case "grok":
      default: {
        return undefined as {
          gemini?: "1K" | "2K" | "4K" | undefined;
          openai?:
            | "high"
            | "medium"
            | "low"
            | "auto"
            | "standard"
            | "hd"
            | undefined;
          grok?: undefined;
          meta?: undefined;
          vercel?: undefined;
          anthropic?: undefined;
        }[T];
      }
    }
  }

  public fallbackImgGenModelByProvider(provider: Provider) {
    switch (provider) {
      case "gemini": {
        return "gemini-3-pro-image-preview" satisfies AllModelsUnion;
      }
      case "grok": {
        return "grok-2-image-1212" satisfies AllModelsUnion;
      }
      case "openai": {
        return "gpt-5.2" satisfies AllModelsUnion;
      }
      case "anthropic":
      case "meta":
      case "vercel":
      default: {
        return undefined;
      }
    }
  }

  public handlePartialImgGen(
    provider: Provider,
    model?: AllModelsUnion,
    data?: { partialImagesRequested?: number }
  ) {
    switch (provider) {
      case "openai": {
        if (model) {
          const m = model as GetModelUtilRT<typeof provider>;
          switch (m) {
            case "dall-e-2":
            case "dall-e-3":
            case "o3-mini":
            case "o3-pro":
            case "o4-mini":
            case "gpt-3.5-turbo":
            case "gpt-4":
            case "chatgpt-4o-latest":
            case "o3-deep-research":
            case "o4-mini-deep-research":
            case "o1-pro":
            case "sora-2":
            case "sora-2-pro":
            case "gpt-5.1-codex-max":
            case "gpt-5.2-chat-latest":
            case "gpt-4-turbo":
            case "gpt-5-codex":
            case "gpt-5.1-chat-latest":
            case "gpt-5.1-codex":
            case "gpt-5.1-codex-mini":
            case "o1": {
              return undefined;
            }
            case "gpt-5.2":
            case "gpt-5.2-pro":
            case "gpt-image-1.5":
            case "gpt-4.1":
            case "gpt-4.1-mini":
            case "gpt-4.1-nano":
            case "gpt-4o":
            case "gpt-4o-mini":
            case "gpt-5-chat-latest":
            case "gpt-5-pro":
            case "gpt-5.1":
            case "gpt-5":
            case "gpt-5-mini":
            case "gpt-5-nano":
            case "gpt-image-1":
            case "gpt-image-1-mini":
            case "o3": {
              if (
                data?.partialImagesRequested &&
                data.partialImagesRequested >= 0 &&
                data.partialImagesRequested <= 3
              ) {
                return data.partialImagesRequested;
              } else return 0;
            }
            default: {
              return undefined;
            }
          }
        } else return undefined;
      }
      case "anthropic":
      case "gemini":
      case "grok":
      case "meta":
      case "vercel":
      default: {
        return undefined;
      }
    }
  }

  public handleOutputSize<const T extends Provider = Provider>(
    provider: T,
    model?: GetModelUtilRT<T>,
    data?: { output_size?: OutputSizeProps<typeof provider> }
  ): OutputSizeProps<typeof provider> {
    switch (provider) {
      case "anthropic":
      case "meta":
      case "vercel":
      case "grok": {
        return undefined;
      }
      case "gemini": {
        const m = model as GetModelUtilRT<"gemini"> | undefined;
        switch (m) {
          case "deep-research-pro-preview-12-2025":
          case "gemini-3-pro-image-preview":
          case "gemini-2.5-flash-image": {
            if (
              data?.output_size &&
              /^(1:1|2:3|3:2|3:4|4:3|4:5|5:4|9:16|16:9|21:9)$/gm.test(
                data.output_size
              )
            ) {
              return data.output_size as OutputSizeProps<typeof provider>;
            } else return "1:1" as OutputSizeProps<typeof provider>;
          }
          case "imagen-4.0-fast-generate-001":
          case "imagen-4.0-generate-001":
          case "imagen-4.0-ultra-generate-001": {
            if (
              data?.output_size &&
              /^(1:1|3:4|4:3|9:16|16:9)$/gm.test(data.output_size)
            ) {
              return data.output_size as OutputSizeProps<typeof provider>;
            } else return "1:1" as OutputSizeProps<typeof provider>;
          }
          case "gemini-3-flash-preview":
          case "gemini-3-pro-preview":
          case "gemini-2.0-flash":
          case "gemini-2.0-flash-lite":
          case "gemini-2.5-flash":
          case "gemini-2.5-flash-lite":
          case "gemini-2.5-pro":
          case "veo-2.0-generate-001":
          case "veo-3.0-fast-generate-001":
          case "veo-3.0-generate-001":
          case "veo-3.1-fast-generate-preview":
          case "veo-3.1-generate-preview": {
            return undefined;
          }
          case undefined:
          default: {
            return "1:1" as OutputSizeProps<typeof provider>;
          }
        }
      }
      case "openai": {
        const m = model as GetModelUtilRT<"openai"> | undefined;
        switch (m) {
          case "dall-e-2": {
            if (
              data?.output_size &&
              /^(256x256|512x512|1024x1024|auto)$/gm.test(data.output_size)
            ) {
              return data.output_size as OpenAIModelAspectRatio[GetModelUtilRT<"openai">] as OutputSizeProps<
                typeof provider
              >;
            } else return "auto" as OutputSizeProps<typeof provider>;
          }
          case "dall-e-3": {
            if (
              data?.output_size &&
              /^(1792x1024|1024x1792|1024x1024|auto)$/gm.test(data.output_size)
            ) {
              return data.output_size as OpenAIModelAspectRatio[GetModelUtilRT<"openai">] as OutputSizeProps<
                typeof provider
              >;
            } else return "auto" as OutputSizeProps<typeof provider>;
          }
          case "gpt-4.1":
          case "gpt-4.1-mini":
          case "gpt-4.1-nano":
          case "gpt-4o":
          case "gpt-4o-mini":
          case "gpt-5":
          case "gpt-5.2":
          case "gpt-image-1.5":
          case "gpt-5.2-pro":
          case "gpt-5.1":
          case "gpt-5-pro":
          case "gpt-5-chat-latest":
          case "gpt-5-mini":
          case "gpt-5-nano":
          case "gpt-image-1":
          case "gpt-image-1-mini":
          case "o3": {
            if (
              data?.output_size &&
              /^(1536x1024|1024x1536|1024x1024|auto)$/gm.test(data.output_size)
            ) {
              return data.output_size as OpenAIModelAspectRatio[GetModelUtilRT<"openai">] as OutputSizeProps<
                typeof provider
              >;
            } else return "auto" as OutputSizeProps<typeof provider>;
          }
          case "gpt-5.1-codex-max":
          case "gpt-5.2-chat-latest":
          case "gpt-3.5-turbo":
          case "gpt-4":
          case "gpt-5.1-chat-latest":
          case "gpt-5.1-codex":
          case "gpt-5.1-codex-mini":
          case "gpt-4-turbo":
          case "chatgpt-4o-latest":
          case "o1":
          case "o3-deep-research":
          case "o4-mini-deep-research":
          case "o1-pro":
          case "sora-2":
          case "sora-2-pro":
          case "gpt-5-codex":
          case "o3-mini":
          case "o3-pro":
          case "o4-mini": {
            return undefined;
          }
          case undefined:
          default: {
            return "auto" as OutputSizeProps<typeof provider>;
          }
        }
      }
      default: {
        return undefined;
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
    const model = (data?.model ??
        this.fallbackImgGenModelByProvider(provider)) satisfies
        | AllModelsUnion
        | undefined,
      outputCompression = this.handleImgGenCompression(provider, model, {
        output_compression: data.imgGenFields?.output_compression,
        output_format: data.imgGenFields?.output_format
      }),
      outputBackground = this.handleImgGenBg(provider, model, {
        background: data.imgGenFields?.output_background,
        format:
          (data.imgGenFields?.output_format as
            | "jpeg"
            | "png"
            | "webp"
            | undefined) ?? "png"
      }),
      moderation = this.handleModeration(provider, model, {
        moderation: data.imgGenFields?.moderation
      }),
      negativePrompt = data?.imgGenFields?.negativePrompt ?? undefined,
      seed = data?.imgGenFields?.seed ?? undefined,
      nRequested = this.handleImgGenCount(provider, model, {
        n: data.imgGenFields?.n
      }),
      inputFidelity = this.handleInputFidelity(provider, model, {
        input_fidelity: data.imgGenFields?.input_fidelity
      }),
      personGeneration = this.handlePersonGeneration(provider, model, {
        personGeneration: data.imgGenFields?.personGeneration
      }),
      progress = 0,
      partialImagesRequested = this.handlePartialImgGen(provider, model, {
        partialImagesRequested: data.imgGenFields?.output_partial_images
      }),
      outputFormat =
        provider === "grok"
          ? "png"
          : (data?.imgGenFields?.output_format ?? "png"),
      outputSize = this.handleOutputSize(
        provider,
        model,
        data.imgGenFields?.output_size as Parameters<
          typeof this.handleOutputSize
        >["2"]
      ),
      stage = "QUEUED",
      temperature = data.temperature,
      systemPrompt = data.systemPrompt,
      maxTokens = data.maxTokens,
      prompt = data?.prompt,
      topP = data?.topP,
      nCompleted = 0,
      outputQuality = this.handleImgGenOutputQuality<typeof provider>(
        provider,
        model,
        data.imgGenFields?.output_quality as Parameters<
          typeof this.handleImgGenOutputQuality
        >["2"]
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
      messageData = {
        content: prompt,
        provider: this.providerToPrismaFormat(provider),
        senderType: "USER",
        model: model ?? "gpt-image-1.5",
        messageType: "IMAGE_GEN",
        userId,
        userKeyId,
        isImageGen,
        imageGenJob
      } as const,
      includeWithAttachments = {
        conversationSettings: true,
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            imageGenJob: true,
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

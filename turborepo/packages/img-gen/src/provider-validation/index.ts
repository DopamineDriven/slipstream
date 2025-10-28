import type {
  AIChatRequest,
  AllModelsUnion,
  GoogleImagenGenerateImagesConfig,
  GoogleSafetyFilterLevel,
  Provider,
  Rm
} from "@slipstream/types";

export class ProviderValidation {
  public isImgGenCapableModel(provider: Provider, model?: AllModelsUnion) {
    if (!model) return false;
    switch (provider) {
      case "anthropic":
      case "meta":
      case "vercel": {
        return false;
      }
      case "grok": {
        switch (model) {
          case "grok-2-image-1212": {
            return true;
          }
          case "grok-2-vision-1212":
          case "grok-3":
          case "grok-3-fast":
          case "grok-3-mini":
          case "grok-3-mini-fast":
          case "grok-4-0709":
          case "grok-4-fast-non-reasoning":
          case "grok-4-fast-reasoning":
          case "grok-code-fast-1":
          default: {
            return false;
          }
        }
      }
      case "gemini": {
        switch (model) {
          case "gemini-2.5-flash-image":
          case "imagen-3.0-generate-002":
          case "imagen-4.0-fast-generate-001":
          case "imagen-4.0-generate-001":
          case "imagen-4.0-ultra-generate-001": {
            return true;
          }
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
            return false;
          }
        }
      }
      case "openai": {
        switch (model) {
          case "dall-e-2":
          case "dall-e-3":
          case "gpt-image-1":
          case "gpt-image-1-mini":
          case "gpt-4.1":
          case "gpt-4.1-mini":
          case "gpt-4.1-nano":
          case "gpt-4o":
          case "gpt-4o-mini":
          case "o3":
          case "gpt-5-mini":
          case "gpt-5-nano":
          case "gpt-5": {
            return true;
          }
          case "gpt-3.5-turbo":
          case "gpt-4":
          case "gpt-4-turbo":
          case "gpt-5-codex":
          case "gpt-5-pro":
          case "o3-mini":
          case "o3-pro":
          case "o4-mini":
          default: {
            return false;
          }
        }
      }
      default: {
        return false;
      }
    }
  }

  public isPureImgGenModel(provider: Provider, model?: AllModelsUnion) {
    if (!model) return false;
    switch (provider) {
      case "anthropic":
      case "meta":
      case "vercel": {
        return false;
      }
      case "grok": {
        switch (model) {
          case "grok-2-image-1212": {
            return true;
          }
          case "grok-2-vision-1212":
          case "grok-3":
          case "grok-3-fast":
          case "grok-3-mini":
          case "grok-3-mini-fast":
          case "grok-4-0709":
          case "grok-4-fast-non-reasoning":
          case "grok-4-fast-reasoning":
          case "grok-code-fast-1":
          default: {
            return false;
          }
        }
      }
      case "gemini": {
        switch (model) {
          case "gemini-2.5-flash-image":
          case "imagen-3.0-generate-002":
          case "imagen-4.0-fast-generate-001":
          case "imagen-4.0-generate-001":
          case "imagen-4.0-ultra-generate-001": {
            return true;
          }
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
            return false;
          }
        }
      }
      case "openai": {
        switch (model) {
          case "dall-e-2":
          case "dall-e-3":
          case "gpt-image-1":
          case "gpt-image-1-mini": {
            return true;
          }
          case "gpt-3.5-turbo":
          case "gpt-4":
          case "gpt-4-turbo":
          case "gpt-4.1":
          case "gpt-4.1-mini":
          case "gpt-4.1-nano":
          case "gpt-4o":
          case "gpt-4o-mini":
          case "gpt-5":
          case "gpt-5-codex":
          case "gpt-5-mini":
          case "gpt-5-nano":
          case "gpt-5-pro":
          case "o3":
          case "o3-mini":
          case "o3-pro":
          case "o4-mini":
          default: {
            return false;
          }
        }
      }
      default: {
        return false;
      }
    }
  }

  public handleGoogleSafetyFilter(
    model?: AllModelsUnion,
    data?: { safetyFilterLevel?: keyof typeof GoogleSafetyFilterLevel }
  ) {
    if (
      !(
        model === "imagen-4.0-generate-001" ||
        model === "imagen-3.0-generate-002" ||
        model === "imagen-4.0-fast-generate-001" ||
        model === "imagen-4.0-ultra-generate-001" ||
        model === "gemini-2.5-flash-image"
      )
    ) {
      return undefined;
    } else {
      return data?.safetyFilterLevel ?? "BLOCK_NONE";
    }
  }

  public handleImgGenCount = (
    model?: AllModelsUnion,
    data?: { n?: number }
  ) => {
    if (!model) return undefined;
    if (
      !(
        model === "gpt-4.1" ||
        model === "dall-e-2" ||
        model === "dall-e-3" ||
        model === "imagen-3.0-generate-002" ||
        model === "imagen-4.0-fast-generate-001" ||
        model === "imagen-4.0-generate-001" ||
        model === "imagen-4.0-ultra-generate-001" ||
        model === "gemini-2.5-flash-image" ||
        model === "grok-2-image-1212" ||
        model === "gpt-4.1-mini" ||
        model === "gpt-4.1-nano" ||
        model === "gpt-5" ||
        model === "gpt-5-mini" ||
        model === "gpt-5-nano" ||
        model === "gpt-4o" ||
        model === "gpt-4o-mini" ||
        model === "o3" ||
        model === "gpt-image-1" ||
        model === "gpt-image-1-mini"
      )
    )
      return undefined;
    switch (model) {
      case "dall-e-3": {
        if (data?.n && data?.n > 0 && data.n < 2) {
          return data.n;
        } else return 1;
      }
      case "imagen-3.0-generate-002":
      case "imagen-4.0-fast-generate-001":
      case "imagen-4.0-generate-001":
      case "imagen-4.0-ultra-generate-001": {
        if (data?.n && data.n >= 1 && data.n < 5) {
          return data.n;
        } else return 4;
      }
      case "dall-e-2":
      case "gemini-2.5-flash-image":
      case "gpt-4.1":
      case "gpt-4.1-mini":
      case "gpt-4.1-nano":
      case "gpt-4o":
      case "gpt-4o-mini":
      case "gpt-5":
      case "gpt-5-mini":
      case "gpt-5-nano":
      case "gpt-image-1":
      case "gpt-image-1-mini":
      case "grok-2-image-1212":
      case "o3":
      default: {
        if (data?.n) {
          if (data.n < 1) return 1;
          if (data.n > 10) return 10;
          return data.n;
        } else return 1;
      }
    }
  };

  public handleImgGenBg(
    provider: Provider,
    model?: AllModelsUnion,
    data?: {
      background?: "transparent" | "opaque" | "auto" | undefined;
      format?: "png" | "jpeg" | "webp";
    }
  ) {
    if (provider !== "openai") return undefined;
    if (!model) return undefined;
    if (
      !(
        model === "gpt-4.1" ||
        model === "gpt-4.1-mini" ||
        model === "gpt-4.1-nano" ||
        model === "gpt-5" ||
        model === "gpt-5-mini" ||
        model === "gpt-5-nano" ||
        model === "gpt-4o" ||
        model === "gpt-4o-mini" ||
        model === "o3" ||
        model === "gpt-image-1" ||
        model === "gpt-image-1-mini"
      )
    )
      return undefined;
    if (!(data?.format === "png" || data?.format === "webp")) return undefined;
    if (
      typeof data?.background !== "undefined" &&
      /^(transparent|opaque|auto)$/gm.test(data.background)
    ) {
      return data?.background;
    } else return "auto";
  }

  /**
   * **gpt-image-1 only**
   */
  public handleInputFidelity(
    provider: Provider,
    model?: AllModelsUnion,
    data?: {
      input_fidelity?: string;
    }
  ) {
    if (provider !== "openai") return undefined;
    if (
      !(
        model === "gpt-4.1" ||
        model === "gpt-4.1-mini" ||
        model === "gpt-4.1-nano" ||
        model === "gpt-5" ||
        model === "gpt-5-mini" ||
        model === "gpt-5-nano" ||
        model === "gpt-4o" ||
        model === "gpt-4o-mini" ||
        model === "o3" ||
        model === "gpt-image-1"
      )
    )
      return undefined;

    const d = data?.input_fidelity as "low" | "high" | undefined;

    if (typeof d !== "undefined" && /^(low|high)$/gm.test(d)) {
      return d;
    } else return "high";
  }

  public handleImgGenCompression(
    provider: Provider,
    model?: AllModelsUnion,
    data?: {
      output_compression?: number | undefined;
      output_format?: string;
    }
  ) {
    if (!model) return undefined;
    if (
      !(
        model === "gpt-4.1" ||
        model === "imagen-3.0-generate-002" ||
        model === "imagen-4.0-fast-generate-001" ||
        model === "imagen-4.0-generate-001" ||
        model === "imagen-4.0-ultra-generate-001" ||
        model === "gpt-4.1-mini" ||
        model === "gpt-4.1-nano" ||
        model === "gpt-5" ||
        model === "gpt-5-mini" ||
        model === "gpt-5-nano" ||
        model === "gpt-4o" ||
        model === "gpt-4o-mini" ||
        model === "o3" ||
        model === "gpt-image-1" ||
        model === "gpt-image-1-mini"
      )
    )
      return undefined;
    if (!(provider === "openai" || provider === "gemini")) return undefined;
    const f = data?.output_format as "png" | "jpeg" | "webp" | undefined;

    if (
      model === "imagen-3.0-generate-002" ||
      model === "imagen-4.0-fast-generate-001" ||
      model === "imagen-4.0-generate-001" ||
      model === "imagen-4.0-ultra-generate-001"
    ) {
      if (typeof data?.output_compression === "undefined") return 75;
      return data?.output_compression >= 0 && data?.output_compression <= 100
        ? data.output_compression
        : data.output_compression > 100
          ? 100
          : 75;
    }
    if (provider === "openai" && typeof f !== "undefined") {
      if (typeof data?.output_compression !== "undefined") {
        return f === "png"
          ? undefined
          : data.output_compression >= 0 && data.output_compression <= 100
            ? data.output_compression
            : 100;
      } else return 100;
    } else return undefined;
  }

  public handleModeration<const T extends Provider>(
    provider: T,
    model?: AllModelsUnion,
    data?: { moderation?: string }
  ) {
    if (provider !== "openai") return undefined;
    if (
      !(
        model === "gpt-4.1" ||
        model === "gpt-4.1-mini" ||
        model === "gpt-4.1-nano" ||
        model === "gpt-5" ||
        model === "gpt-5-mini" ||
        model === "gpt-5-nano" ||
        model === "gpt-4o" ||
        model === "gpt-4o-mini" ||
        model === "o3" ||
        model === "gpt-image-1" ||
        model === "gpt-image-1-mini"
      )
    )
      return undefined;
    const m = data?.moderation as "auto" | "low" | undefined;
    if (typeof m !== "undefined" && /^(low|auto)$/gm.test(m)) {
      return m;
    } else return "low";
  }

  public handlePersonGeneration<const T extends Provider>(
    provider: T,
    model?: AllModelsUnion,
    data?: { personGeneration?: string }
  ) {
    if (provider !== "gemini") {
      return undefined;
    }
    if (
      !(
        model === "imagen-3.0-generate-002" ||
        model === "imagen-4.0-fast-generate-001" ||
        model === "imagen-4.0-generate-001" ||
        model === "imagen-4.0-ultra-generate-001"
      )
    )
      return undefined;
    const p =
      data?.personGeneration as GoogleImagenGenerateImagesConfig["personGeneration"];
    if (typeof p !== "undefined") {
      if (/^(dont_allow|allow_(all|adult))$/gim.test(p)) {
        return p;
      } else return "ALLOW_ADULT";
    } else return "ALLOW_ADULT";
  }

  public handleImgGenOutputQuality(
    provider: Provider,
    model?: AllModelsUnion,
    data?: { output_quality?: string }
  ) {
    switch (provider) {
      case "anthropic":
      case "meta":
      case "vercel":
      case "grok": {
        return undefined;
      }
      case "gemini": {
        switch (model) {
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
          case "gemini-2.5-flash-image": {
            return undefined;
          }
          case "imagen-3.0-generate-002": {
            if (data?.output_quality && /^1K$/gm.test(data.output_quality)) {
              return data.output_quality;
            } else return "1K";
          }
          case "imagen-4.0-fast-generate-001":
          case "imagen-4.0-generate-001":
          case "imagen-4.0-ultra-generate-001": {
            if (
              data?.output_quality &&
              /^(1|2)K$/gm.test(data.output_quality)
            ) {
              return data.output_quality;
            } else return "1K";
          }
          default: {
            return undefined;
          }
        }
      }
      case "openai": {
        switch (model) {
          case "dall-e-2": {
            if (
              data?.output_quality &&
              /^(standard|auto)$/gm.test(data.output_quality)
            ) {
              return data.output_quality;
            } else return "auto";
          }
          case "dall-e-3": {
            if (
              data?.output_quality &&
              /^(standard|auto|hd)$/gm.test(data.output_quality)
            ) {
              return data.output_quality;
            } else return "auto";
          }
          case "gpt-4.1":
          case "gpt-4.1-mini":
          case "gpt-4.1-nano":
          case "gpt-4o":
          case "gpt-4o-mini":
          case "gpt-5":
          case "gpt-5-mini":
          case "gpt-5-nano":
          case "gpt-image-1":
          case "gpt-image-1-mini":
          case "o3": {
            if (
              data?.output_quality &&
              /^(high|medium|low|auto)$/gm.test(data.output_quality)
            ) {
              return data.output_quality;
            } else return "auto";
          }
          case "gpt-3.5-turbo":
          case "gpt-4":
          case "gpt-4-turbo":
          case "gpt-5-codex":
          case "gpt-5-pro":
          case "o3-mini":
          case "o3-pro":
          case "o4-mini": {
            return undefined;
          }
          default: {
            return "auto";
          }
        }
      }
      default: {
        return undefined;
      }
    }
  }

  public fallbackImgGenModelByProvider(provider: Provider) {
    switch (provider) {
      case "gemini": {
        return "gemini-2.5-flash-image";
      }
      case "grok": {
        return "grok-2-imagine-1212";
      }
      case "openai": {
        return "gpt-image-1";
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
          switch (model) {
            case "dall-e-2":
            case "dall-e-3":
            case "o3-mini":
            case "o3-pro":
            case "o4-mini":
            case "gpt-3.5-turbo":
            case "gpt-4":
            case "gpt-4-turbo":
            case "gpt-5-codex":
            case "gpt-5-pro": {
              return undefined;
            }
            case "gpt-4.1":
            case "gpt-4.1-mini":
            case "gpt-4.1-nano":
            case "gpt-4o":
            case "gpt-4o-mini":
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

  public handleOutputSize(
    provider: Provider,
    model?: AllModelsUnion,
    data?: { output_size?: string }
  ) {
    switch (provider) {
      case "anthropic":
      case "meta":
      case "vercel":
      case "grok": {
        return undefined;
      }
      case "gemini": {
        switch (model) {
          case "gemini-2.5-flash-image": {
            if (
              data?.output_size &&
              /^(1:1|2:3|3:2|3:4|4:3|4:5|5:4|9:16|16:9|21:9)$/gm.test(
                data.output_size
              )
            ) {
              return data.output_size;
            } else return "1:1";
          }
          case "imagen-3.0-generate-002":
          case "imagen-4.0-fast-generate-001":
          case "imagen-4.0-generate-001":
          case "imagen-4.0-ultra-generate-001": {
            if (
              data?.output_size &&
              /^(1:1|3:4|4:3|9:16|16:9)$/gm.test(data.output_size)
            ) {
              return data.output_size;
            } else return "1:1";
          }
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
          default: {
            return "1:1";
          }
        }
      }
      case "openai": {
        switch (model) {
          case "dall-e-2": {
            if (
              data?.output_size &&
              /^(256x256|512x512|1024x1024|auto)$/gm.test(data.output_size)
            ) {
              return data.output_size;
            } else return "auto";
          }
          case "dall-e-3": {
            if (
              data?.output_size &&
              /^(1792x1024|1024x1792|1024x1024|auto)$/gm.test(data.output_size)
            ) {
              return data.output_size;
            } else return "auto";
          }
          case "gpt-4.1":
          case "gpt-4.1-mini":
          case "gpt-4.1-nano":
          case "gpt-4o":
          case "gpt-4o-mini":
          case "gpt-5":
          case "gpt-5-mini":
          case "gpt-5-nano":
          case "gpt-image-1":
          case "gpt-image-1-mini":
          case "o3": {
            if (
              data?.output_size &&
              /^(1536x1024|1024x1536|1024x1024|auto)$/gm.test(data.output_size)
            ) {
              return data.output_size;
            } else return "auto";
          }
          case "gpt-3.5-turbo":
          case "gpt-4":
          case "gpt-4-turbo":
          case "gpt-5-codex":
          case "gpt-5-pro":
          case "o3-mini":
          case "o3-pro":
          case "o4-mini": {
            return undefined;
          }
          default: {
            return "auto";
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
        this.fallbackImgGenModelByProvider(provider)) as AllModelsUnion,
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
      nRequested = this.handleImgGenCount(model, { n: data.imgGenFields?.n }),
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
      outputSize = this.handleOutputSize(provider, model, {
        output_size: data.imgGenFields?.output_size
      }),
      stage = "QUEUED",
      temperature = data.temperature,
      systemPrompt = data.systemPrompt,
      maxTokens = data.maxTokens,
      prompt = data?.prompt,
      topP = data?.topP,
      nCompleted = 0,
      outputQuality = this.handleImgGenOutputQuality(provider, model, {
        output_quality: data.imgGenFields?.output_quality
      }),
      apiKey = data.apiKey,
      keyId = data.keyId,
      userKeyId = keyId,
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
          model,
          prompt,
          provider: this.providerToPrismaFormat(provider)
        }
      } as const,
      messageData = {
        content: prompt,
        provider: this.providerToPrismaFormat(provider),
        senderType: "USER",
        model,
        userId,
        userKeyId,
        imageGenJob
      } as const,
      includeWithAttachments = {
        conversationSettings: true,
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            imageGenJob: true,
            attachments: {
              orderBy: { createdAt: "asc" },
              include: {
                imageGenOutput: true,
                image: true,
                document: true
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
              orderBy: { createdAt: "asc" },
              include: {
                imageGenOutput: true,
                image: true,
                document: true
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

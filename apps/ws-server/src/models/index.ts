import type { InferTopLevelMime } from "@/types/index.ts";
import type { ExpandedDocSpecs, ExpandedImgSpecs } from "@d0paminedriven/fs";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { GetModelUtilRT, Provider } from "@slipstream/types";
import { providerModelChatApi } from "@slipstream/types";
import { ModelServiceWorkup } from "@/models/workup.ts";

export class ModelService extends ModelServiceWorkup {
  constructor() {
    super();
  }
  protected isOpenAIImgGenFacilitating(m: string) {
    return (
      m === "gpt-5.5" ||
      m === "gpt-5.5-pro" ||
      m === "gpt-5.4-mini" ||
      m === "gpt-5.4-nano" ||
      m === "gpt-4.1" ||
      m === "gpt-4.1-mini" ||
      m === "gpt-4.1-nano" ||
      m === "gpt-5" ||
      m === "gpt-5-chat-latest" ||
      m === "gpt-5-mini" ||
      m === "gpt-5-nano" ||
      m === "gpt-5-pro" ||
      m === "gpt-5.1" ||
      m === "gpt-5.2" ||
      m === "gpt-5.2-pro" ||
      m === "gpt-5.4" ||
      m === "gpt-5.4-pro" ||
      m === "o3" ||
      m === "gpt-4o" ||
      m === "gpt-4o-mini"
    );
  }

  public isOpenAIImgModel(m: string) {
    return (
      m === "gpt-image-2" ||
      m === "gpt-image-1.5" ||
      m === "gpt-image-1" ||
      m === "gpt-image-1-mini"
    );
  }

  public isOpenAIVideoModel(m: string) {
    return m === "sora-2" || m === "sora-2-pro";
  }

  public isOpenAICodexModel(m: string) {
    return (
      m === "gpt-5.3-codex" ||
      m === "gpt-5.2-codex" ||
      m === "gpt-5.1-codex-max" ||
      m === "gpt-5.1-codex-mini" ||
      m === "gpt-5.1-codex" ||
      m === "gpt-5-codex"
    );
  }

  public isOpenAIModel(m: string) {
    return (
      this.isOpenAIImgGenFacilitating(m) ||
      this.isOpenAIImgModel(m) ||
      this.isOpenAIVideoModel(m) ||
      this.isOpenAICodexModel(m) ||
      m === "gpt-5.2-chat-latest" ||
      m === "gpt-5.1-chat-latest" ||
      m === "chatgpt-4o-latest" ||
      m === "o4-mini" ||
      m === "o4-mini-deep-research" ||
      m === "o3-deep-research" ||
      m === "o3-pro" ||
      m === "o3-mini" ||
      m === "o1" ||
      m === "o1-pro" ||
      m === "gpt-4" ||
      m === "gpt-4-turbo" ||
      m === "gpt-3.5-turbo"
    );
  }

  public isGeminiImgModel(m: string) {
    return (
      m === "gemini-3-pro-image-preview" ||
      m === "gemini-3.1-flash-image-preview" ||
      m === "gemini-2.5-flash-image"
    );
  }

  public isGeminiVideoModel(m: string) {
    return (
      m === "veo-3.1-lite-generate-preview" ||
      m === "veo-3.1-fast-generate-preview" ||
      m === "veo-3.1-generate-preview"
    );
  }

  public isGeminiDeepResearchModel(m: string) {
    return (
      m === "deep-research-max-preview-04-2026" ||
      m === "deep-research-preview-04-2026"
    );
  }

  public isGeminiModel(m: string) {
    return (
      m === "gemini-3.5-flash" ||
      m === "gemini-3.1-pro-preview" ||
      m === "gemini-3.1-pro-preview-customtools" ||
      m === "gemini-3.1-flash-lite-preview" ||
      m === "gemini-3-flash-preview" ||
      m === "gemini-2.5-pro" ||
      m === "gemini-2.5-flash-lite" ||
      m === "gemini-2.5-flash" ||
      m === "gemini-2.0-flash" ||
      m === "gemini-2.0-flash-lite" ||
      this.isGeminiDeepResearchModel(m) ||
      this.isGeminiImgModel(m) ||
      this.isGeminiVideoModel(m)
    );
  }

  public isGrokImgModel(m: string) {
    return m === "grok-imagine-image-quality" || m === "grok-imagine-image";
  }

  public isGrokVideoModel(m: string) {
    return m === "grok-imagine-video" || m === "grok-imagine-video-1.5";
  }

  public isGrokModel(m: string) {
    return (
      this.isGrokVideoModel(m) ||
      this.isGrokImgModel(m) ||
      m === "grok-4.3" ||
      m === "grok-4.20-multi-agent-0309" ||
      m === "grok-4.20-0309-reasoning" ||
      m === "grok-4.20-0309-non-reasoning" ||
      m === "grok-build-0.1"
    );
  }
  public isAnthropicAdaptiveModel(mod: string) {
    return (
      mod === "claude-opus-4-8" ||
      mod === "claude-opus-4-7" ||
      mod === "claude-opus-4-6" ||
      mod === "claude-sonnet-4-6" ||
      mod === "claude-fable-5" ||
      mod === "claude-sonnet-5"
    );
  }

  public isAnthropicNonAdaptiveModel(m: string) {
    return (
      m === "claude-opus-4-5-20251101" ||
      m === "claude-sonnet-4-5-20250929" ||
      m === "claude-haiku-4-5-20251001" ||
      m === "claude-opus-4-1-20250805"
    );
  }
  public isAnthropicModel(m: string) {
    return (
      this.isAnthropicNonAdaptiveModel(m) || this.isAnthropicAdaptiveModel(m)
    );
  }

  public isMetaModel(m: string) {
    return (
      m === "Llama-4-Maverick-17B-128E-Instruct-FP8" ||
      m === "Llama-4-Scout-17B-16E-Instruct-FP8" ||
      m === "Llama-3.3-70B-Instruct" ||
      m === "Llama-3.3-8B-Instruct"
    );
  }

  public isV0Model(m: string) {
    return m === "v0-1.5-md" || m === "v0-1.0-md";
  }
  public isMistralReasoningModel(m: string) {
    return (
      m === "mistral-small-latest" ||
      m === "mistral-medium-3" ||
      m === "mistral-medium-3.5"
    );
  }
  public isMistralModel(m: string) {
    return this.isMistralReasoningModel(m) || m === "mistral-large-latest";
  }

  public isCohereReasoningModel(m: string) {
    return (
      m === "command-a-plus-05-2026" || m === "command-a-reasoning-08-2025"
    );
  }

  public isCohereModel(m: string) {
    return this.isCohereReasoningModel(m) || m === "command-a-03-2025";
  }

  public isKimiModel(m: string) {
    return m === "kimi-k2.6" || m === "kimi-k2.5" || m === "kimi-k2-thinking";
  }

  public isDeepSeekModel(m: string) {
    return (
      m === "deepseek-r1" ||
      m === "deepseek-v4-pro" ||
      m === "deepseek-v4-flash"
    );
  }

  public isZaiModel(m: string) {
    return (
      m === "glm-5.2" ||
      m === "glm-5.1" ||
      m === "glm-5" ||
      m === "glm-4.7" ||
      m === "glm-4.6" ||
      m === "glm-4.5"
    );
  }

  public isQwenModel(m: string) {
    return (
      m === "qwen3.7-max" ||
      m === "qwen3.7-plus" ||
      m === "qwen3.6-plus" ||
      m === "qwen3.5-plus" ||
      m === "qwen3.5-flash"
    );
  }

  public isMinimaxModel(m: string) {
    return (
      m === "minimax-m3" ||
      m === "minimax-m2.7" ||
      m === "minimax-m2.5" ||
      m === "minimax-m2.1"
    );
  }

  public isSakanaModel(m: string) {
    return m === "fugu" || m === "fugu-ultra";
  }

  public concatBytes(arrays: Uint8Array[]) {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }

  public findDoubleNewlineIndex(buffer: Uint8Array) {
    const LF = 0x0a;
    const CR = 0x0d;

    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i] === LF && buffer[i + 1] === LF) return i + 2;
      if (buffer[i] === CR && buffer[i + 1] === CR) return i + 2;
      if (
        buffer[i] === CR &&
        buffer[i + 1] === LF &&
        i + 3 < buffer.length &&
        buffer[i + 2] === CR &&
        buffer[i + 3] === LF
      ) {
        return i + 4;
      }
    }
    return -1;
  }

  public sanitizeTitle = (generatedTitle: string) => {
    return generatedTitle.trim().replace(/^(['"])(.*?)\1$/, "$2");
  };

  public contentTypeToExt(contentType?: string) {
    return contentType
      ? this.mimeToExt[contentType as keyof typeof this.mimeToExt][0]
      : undefined;
  }
  public getTopLevelMime(
    target: keyof typeof this.mimeToExt
  ):
    | "audio"
    | "application"
    | "image"
    | "video"
    | "multipart"
    | "text"
    | "model"
    | "haptics"
    | "font" {
    return target.split("/")?.[0] as InferTopLevelMime<typeof target>;
  }

  // TODO finish this
  // public getMod<const Z extends "alibaba" = "alibaba", const L extends ProviderModelRecord[Z] = ProviderModelRecord[Z]>(
  //   provider: Z,
  //   model: L
  // ): typeof model
  // public getMod<const Z extends "anthropic", const L extends GetModelUtilRT<Z>>(
  //   provider: Z,
  //   model?: L
  // ): typeof model extends undefined
  //   ? "claude-opus-4.6"
  //   : Exclude<typeof model, undefined>;
  // public getMod<const Z extends "cohere", const L extends GetModelUtilRT<Z>>(
  //   provider: Z,
  //   model?: L
  // ): typeof model extends undefined
  //   ? "command-a-plus-05-2026"
  //   : Exclude<typeof model, undefined>;
  // public getMod<const Z extends "deepseek", const L extends GetModelUtilRT<Z>>(
  //   provider: Z,
  //   model?: L
  // ): typeof model extends undefined
  //   ? "deepseek-v4-pro"
  //   : Exclude<typeof model, undefined>;
  // public getMod<const Z extends "gemini", const L extends GetModelUtilRT<Z>>(
  //   provider: Z,
  //   model?: L
  // ): typeof model extends undefined
  //   ? "gemini-3.1-pro-preview"
  //   : Exclude<typeof model, undefined>;
  // public getMod<const Z extends "grok", const L extends GetModelUtilRT<Z>>(
  //   provider: Z,
  //   model?: L
  // ): typeof model extends undefined
  //   ? "grok-4.20-0309-reasoning"
  //   : Exclude<typeof model, undefined>;
  // public getMod<const Z extends "meta", const L extends GetModelUtilRT<Z>>(
  //   provider: Z,
  //   model?: L
  // ): typeof model extends undefined
  //   ? "Llama-4-Maverick-17B-128E-Instruct-FP8"
  //   : Exclude<typeof model, undefined>;
  // public getMod<const Z extends "minimax", const L extends GetModelUtilRT<Z>>(
  //   provider: Z,
  //   model?: L
  // ): typeof model extends undefined
  //   ? "minimax-m3"
  //   : Exclude<typeof model, undefined>;
  // public getMod<
  //   const Z extends "moonshotai",
  //   const L extends GetModelUtilRT<Z>
  // >(
  //   provider: Z,
  //   model?: L
  // ): typeof model extends undefined
  //   ? "kimi-k2.6"
  //   : Exclude<typeof model, undefined>;
  // public getMod<
  //   const Z extends "openai",
  //   const L extends OpenAiModelIdUnion | undefined
  // >(
  //   provider: Z,
  //   model?: L
  // ): L extends undefined ? "gpt-5.5" : Exclude<L, undefined>;
  // public getMod<const Z extends "sakana", const L extends GetModelUtilRT<Z>>(
  //   provider: Z,
  //   model?: L
  // ): typeof model extends undefined ? "fugu" : Exclude<typeof model, undefined>;
  // public getMod<const Z extends "vercel", const L extends GetModelUtilRT<Z>>(
  //   provider: Z,
  //   model?: L
  // ): typeof model extends undefined
  //   ? "vercel-md-1.5"
  //   : Exclude<typeof model, undefined>;
  // public getMod<const Z extends "zai", const L extends GetModelUtilRT<Z>>(
  //   provider: Z,
  //   model?: L
  // ): typeof model extends undefined
  //   ? "glm-5.2"
  //   : Exclude<typeof model, undefined>;
  // public getMod<const Z extends Provider>(provider: Z, model?: ModelMap[Z]) {
  //   if (provider === "alibaba") {
  //     if (model && this.isQwenModel(model)) return model;
  //     return "qwen3.7-plus";
  //   }
  //   if (provider === "anthropic") {
  //     if (model && this.isAnthropicModel(model)) return model;
  //     return "claude-opus-4-6";
  //   }
  //   if (provider === "cohere") {
  //     if (model && this.isCohereModel(model)) return model;
  //     return "command-a-plus-05-2026";
  //   }
  //   if (provider === "deepseek") {
  //     if (model && this.isDeepSeekModel(model)) return model;
  //     return "deepseek-v4-pro";
  //   }
  //   if (provider === "gemini") {
  //     if (model && this.isGeminiModel(model)) return model;
  //     return "gemini-3.1-pro-preview";
  //   }
  //   if (provider === "grok") {
  //     if (model && this.isGrokModel(model)) return model;
  //     return "grok-4.20-0309-reasoning";
  //   }
  //   if (provider === "meta") {
  //     if (model && this.isMetaModel(model)) return model;
  //     return "Llama-4-Maverick-17B-128E-Instruct-FP8";
  //   }
  //   if (provider === "minimax") {
  //     if (model && this.isMinimaxModel(model)) return model;
  //     return "minimax-m3";
  //   }
  //   if (provider === "mistral") {
  //     if (model && this.isMistralModel(model)) return model;
  //     return "mistral-medium-3.5";
  //   }
  //   if (provider === "moonshotai") {
  //     if (model && this.isKimiModel(model)) return model;
  //     return "kimi-k2.6";
  //   }
  //   if (provider === "openai") {
  //     if (model && this.isOpenAIModel(model)) return model;
  //     return "gpt-5.5";
  //   }
  //   if (provider === "sakana") {
  //     if (model && this.isSakanaModel(model)) return model;
  //     return "fugu";
  //   }
  //   if (provider === "vercel") {
  //     if (model && this.isV0Model(model)) return model;
  //     return "v0-1.5-md";
  //   }
  //   if (provider === "zai") {
  //     if (model && this.isZaiModel(model)) return model;
  //     return "glm-5.2";
  //   } else
  //     throw new Error(
  //       `incorrect provider (${provider}) model (${model}) combo`
  //     );
  // }

  public getModel = <
    const V extends Provider,
    const K extends GetModelUtilRT<V>
  >(
    target: V,
    model?: K
  ): NonNullable<K> => {
    let xTarget = target as Provider;
    switch (xTarget) {
      case "gemini": {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"gemini">
          )
        ) {
          return model;
        } else return "gemini-3.1-pro-preview" as const as NonNullable<K>;
      }
      case "grok": {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"grok">
          )
        ) {
          return model;
        } else return "grok-4.3" as const as NonNullable<K>;
      }
      case "anthropic": {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"anthropic">
          )
        ) {
          return model;
        } else return "claude-opus-4-6" as const as NonNullable<K>;
      }
      case "meta": {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"meta">
          )
        ) {
          return model;
        } else return "Llama-3.3-70B-Instruct" as const as NonNullable<K>;
      }
      case "vercel": {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"vercel">
          )
        ) {
          return model;
        } else return "v0-1.5-md" as const as NonNullable<K>;
      }
      case "mistral": {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"mistral">
          )
        ) {
          return model;
        } else return "mistral-medium-3.5" as const as NonNullable<K>;
      }
      case "cohere": {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"cohere">
          )
        ) {
          return model;
        } else return "command-a-plus-05-2026" as const as NonNullable<K>;
      }
      case "deepseek": {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"deepseek">
          )
        ) {
          return model;
        } else return "deepseek-v4-pro" as const as NonNullable<K>;
      }
      case "moonshotai": {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"moonshotai">
          )
        ) {
          return model;
        } else return "kimi-k2.6" as const as NonNullable<K>;
      }
      case "zai": {
        if (
          model &&
          providerModelChatApi[xTarget].includes(model as GetModelUtilRT<"zai">)
        ) {
          return model;
        } else return "glm-5.2" as const as NonNullable<K>;
      }
      case "alibaba": {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"alibaba">
          )
        ) {
          return model;
        } else return "qwen3.7-max" as const as NonNullable<K>;
      }
      case "minimax": {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"minimax">
          )
        ) {
          return model;
        } else return "minimax-m3" as const as NonNullable<K>;
      }
      case "sakana": {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"sakana">
          )
        ) {
          return model;
        } else return "fugu" as const as NonNullable<K>;
      }
      case "openai":
      default: {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"openai">
          )
        ) {
          return model;
        } else return "gpt-5.5" as const as NonNullable<K>;
      }
    }
  };

  public fromBigInt(size: bigint | null) {
    return size ? (size === 0n ? 0 : Number(size)) : undefined;
  }
  public toBigInt(size?: number, bytesUploaded?: number) {
    return size
      ? size === 0
        ? 0n
        : BigInt(size)
      : bytesUploaded
        ? bytesUploaded === 0
          ? 0n
          : BigInt(bytesUploaded)
        : undefined;
  }
  public isValidUrl(url: string) {
    return URL.canParse(url);
  }

  public handleAssetType(mimeType: string) {
    return mimeType.startsWith("image/")
      ? ("IMAGE" as const)
      : mimeType.startsWith("application/") || mimeType.startsWith("text/")
        ? ("DOCUMENT" as const)
        : mimeType.startsWith("audio/")
          ? ("AUDIO" as const)
          : mimeType.startsWith("video/")
            ? ("VIDEO" as const)
            : ("UNKNOWN" as const);
  }

  public handleAssetMetadata(specs: ExpandedDocSpecs | ExpandedImgSpecs): {
    type: "DOCUMENT" | "IMAGE";
    doc:
      | {
          author: string | undefined;
          encoding: string | undefined;
          format: string;
          isEncrypted: boolean | undefined;
          isSearchable: boolean | undefined;
          keywords: string[] | undefined;
          language: string | undefined;
          lineCount: number | undefined;
          isLinearized: boolean | undefined;
          pageCount: number | undefined;
          pdfVersion: string | undefined;
          subject: string | undefined;
          textPreview: string | undefined;
          title: undefined;
          wordCount: number | undefined;
        }
      | undefined;
    img:
      | {
          animated: boolean;
          aspectRatio: number;
          cameraMake: null;
          cameraModel: null;
          colorSpace:
            | "unknown"
            | "srgb"
            | "display_p3"
            | "adobe_rgb"
            | "prophoto_rgb"
            | "rec2020"
            | "rec709"
            | "cmyk"
            | "lab"
            | "xyz"
            | "gray";
          colorModel: $Enums.ColorModel | null;
          dominantColorHex: null;
          exifDateTimeOriginal: Date | null;
          format:
            | "apng"
            | "png"
            | "jpeg"
            | "gif"
            | "bmp"
            | "webp"
            | "avif"
            | "heic"
            | "svg"
            | "ico"
            | "tiff"
            | undefined;
          frames: number;
          gpsLat: null;
          gpsLon: null;
          hasAlpha: boolean;
          height: number;
          width: number;
          iccProfile: string | null;
          lensModel: null;
          orientation: number | null;
        }
      | undefined;
  } {
    return {
      type: specs.type,
      doc:
        specs.type === "DOCUMENT"
          ? {
              author: specs.author ?? undefined,
              encoding: specs.encoding ?? undefined,
              format: specs.format ?? "application/pdf",
              isEncrypted: specs.isEncrypted ?? undefined,
              isSearchable: specs.isSearchable ?? undefined,
              isLinearized: specs.isLinearized ?? undefined,
              keywords: specs.keywords ?? undefined,
              language: specs.language ?? undefined,
              lineCount: specs.lineCount ?? undefined,
              pageCount: specs.pageCount ?? undefined,
              pdfVersion: specs.pdfVersion ?? undefined,
              subject: specs.subject ?? undefined,
              textPreview: specs.textPreview ?? undefined,
              title: undefined,
              wordCount: specs.wordCount ?? undefined
            }
          : undefined,
      img:
        specs.type === "IMAGE"
          ? {
              animated: specs.animated,
              aspectRatio: specs.aspectRatio,
              cameraMake: null,
              cameraModel: null,
              colorModel:
                specs.colorModel === "grayscale-alpha"
                  ? "grayscale_alpha"
                  : specs.colorModel,
              colorSpace: specs.colorSpace ?? null,
              dominantColorHex: null,
              exifDateTimeOriginal: specs.exifDateTimeOriginal
                ? new Date(specs.exifDateTimeOriginal)
                : null,
              format: specs.format !== "unknown" ? specs.format : "jpeg",
              frames: specs.animated === true ? specs.frames : 1,
              gpsLat: null,
              gpsLon: null,
              hasAlpha: specs.hasAlpha ?? false,
              height: specs.height,
              width: specs.width,
              iccProfile: specs.iccProfile,
              lensModel: null,
              orientation: specs.orientation
            }
          : undefined
    };
  }

  public formatProvider(provider?: Provider) {
    switch (provider) {
      case "anthropic":
        return "Anthropic";
      case "gemini":
        return "Gemini";
      case "grok":
        return "Grok";
      case "meta":
        return "Meta";
      case "vercel":
        return "Vercel";
      case "mistral":
        return "Mistral";
      case "alibaba":
        return "Alibaba";
      case "cohere":
        return "Cohere";
      case "deepseek":
        return "DeepSeek";
      case "minimax":
        return "MiniMax";
      case "moonshotai":
        return "Moonshotai";
      case "sakana":
        return "Sakana";
      case "zai":
        return "Zai";
      case "openai":
      default:
        return "OpenAI";
    }
  }
  public safeErrMsg(err: unknown) {
    if (err instanceof Error) {
      return err.message;
    } else if (typeof err === "object" && err != null) {
      return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
    } else if (typeof err === "string") {
      return err;
    } else if (typeof err === "number") {
      return err.toPrecision(5);
    } else if (typeof err === "boolean") {
      return `${err}`;
    } else return String(err);
  }

  public handleLatLng(latlng?: string) {
    const [lat, lng] = latlng
      ? (latlng?.split(",")?.map(p => {
          return Number.parseFloat(p);
        }) as [number, number])
      : [47.7749, -122.4194];
    return [lat, lng] as const;
  }

  public providerToPrismaFormat<const T extends Provider>(provider: T) {
    return provider.toUpperCase() as Uppercase<T>;
  }
}

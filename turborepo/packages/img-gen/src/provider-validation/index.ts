import type {
  AllImgGenFacilitatingModelsUnion,
  GetModelUtilRT,
  GoogleImagenGenerateImagesConfig,
  GoogleImgSizeQualityOpts,
  GoogleSafetyFilterLevel,
  ImageGenModels,
  ImageGenProviders,
  OpenAISizeQualityOpts,
  Provider
} from "@slipstream/types";

export class ProviderValidation {
  public isImgGenCapableModel(
    provider: Provider,
    model?: GetModelUtilRT<typeof provider>
  ) {
    if (!model) return false;
    switch (provider) {
      case "anthropic":
      case "meta":
      case "vercel": {
        return false;
      }
      case "grok": {
        return model === "grok-2-image-1212" ? true : false;
      }
      case "gemini": {
        const capable = [
          "gemini-2.5-flash-image",
          "imagen-3.0-generate-002",
          "imagen-4.0-fast-generate-001",
          "imagen-4.0-generate-001",
          "imagen-4.0-ultra-generate-001"
        ];
        return capable.includes(model) ? true : false;
      }
      case "openai": {
        const nonCapable = [
          "gpt-3.5-turbo",
          "gpt-4-turbo",
          "gpt-4",
          "o4-mini",
          "o3-mini",
          "o3-pro",
          "gpt-5-codex",
          "gpt-5-pro"
        ];
        return nonCapable.includes(model) ? false : true;
      }
      default: {
        return false;
      }
    }
  }

  public isPureImgGenModel(
    provider: Provider,
    model?: GetModelUtilRT<typeof provider>
  ) {
    if (!model) return false;
    switch (provider) {
      case "anthropic":
      case "meta":
      case "vercel": {
        return false;
      }
      case "grok": {
        const pure = ["grok-2-image-1212"];
        return pure.includes(model) ? true : false;
      }
      case "gemini": {
        const pure = [
          "gemini-2.5-flash-image",
          "imagen-3.0-generate-002",
          "imagen-4.0-fast-generate-001",
          "imagen-4.0-generate-001",
          "imagen-4.0-ultra-generate-001"
        ];
        return pure.includes(model) ? true : false;
      }
      case "openai": {
        const pure = [
          "gpt-image-1",
          "gpt-image-1-mini",
          "dall-e-2",
          "dall-e-3"
        ];
        return pure.includes(model) ? true : false;
      }
      default: {
        return false;
      }
    }
  }

  public handleGoogleSafetyFilter(
    model?: ImageGenModels | AllImgGenFacilitatingModelsUnion,
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
    model?: ImageGenModels | AllImgGenFacilitatingModelsUnion,
    data?: { n?: number }
  ) => {
    if (model === "dall-e-3") {
      if (typeof data?.n !== "undefined") {
        return data.n > 1 ? 1 : data.n < 1 ? 1 : data.n;
      }
      return 1;
    }
    if (
      model === "imagen-3.0-generate-002" ||
      model === "imagen-4.0-fast-generate-001" ||
      model === "imagen-4.0-generate-001" ||
      model === "imagen-4.0-ultra-generate-001"
    ) {
      if (typeof data?.n !== "undefined") {
        return data.n > 4 ? 4 : data.n < 1 ? 1 : data.n;
      }
      return 1;
    }
    if (typeof data?.n !== "undefined") {
      return data.n > 10 ? 10 : data.n < 1 ? 1 : data.n;
    }
    return 1;
  };

  public handleImgGenBg(
    provider: ImageGenProviders,
    model?: ImageGenModels | AllImgGenFacilitatingModelsUnion,
    data?: {
      background?: "transparent" | "opaque" | "auto" | undefined;
      format?: "png" | "jpeg" | "webp";
    }
  ) {
    if (provider !== "openai") return undefined;
    if (!model) return undefined;
    if (
      model === "grok-2-image-1212" ||
      model === "dall-e-3" ||
      model === "dall-e-2" ||
      model === "imagen-4.0-generate-001" ||
      model === "imagen-3.0-generate-002" ||
      model === "imagen-4.0-fast-generate-001" ||
      model === "imagen-4.0-ultra-generate-001" ||
      model === "gemini-2.5-flash-image"
    )
      return undefined;
    if (
      typeof data?.background !== "undefined" &&
      typeof data?.format !== "undefined" &&
      data.format !== "jpeg" &&
      /^(transparent|opaque|auto)$/gm.test(data.background)
    ) {
      return data?.background;
    } else return "auto";
  }

  /**
   * **gpt-image-1 only**
   */
  public handleInputFidelity(
    provider: ImageGenProviders,
    model?: ImageGenModels | AllImgGenFacilitatingModelsUnion,
    data?: {
      input_fidelity?: string;
    }
  ) {
    if (provider !== "openai") return undefined;
    if (
      model === "gpt-image-1-mini" ||
      model === "dall-e-2" ||
      model === "dall-e-3" ||
      model === "imagen-4.0-generate-001" ||
      model === "imagen-3.0-generate-002" ||
      model === "imagen-4.0-fast-generate-001" ||
      model === "imagen-4.0-ultra-generate-001" ||
      model === "gemini-2.5-flash-image" ||
      model === "grok-2-image-1212"
    )
      return undefined;
    const iF = data?.input_fidelity as "low" | "high" | undefined;

    if (typeof iF !== "undefined" && /^(low|high)$/gm.test(iF)) {
      return iF;
    } else return "high";
  }

  public handleImgGenCompression(
    provider: "grok" | "gemini" | "openai",
    model?: ImageGenModels | AllImgGenFacilitatingModelsUnion,
    data?: {
      output_compression?: number | undefined;
      output_format?: string;
    }
  ) {
    if (provider === "grok") return undefined;
    const f = data?.output_format as "png" | "jpeg" | "webp" | undefined;
    if (
      model === "dall-e-2" ||
      model === "dall-e-3" ||
      model === "grok-2-image-1212" ||
      model === "gemini-2.5-flash-image"
    ) {
      return undefined;
    }
    if (typeof data?.output_compression === "undefined") return undefined;
    if (!model) return undefined;
    if (
      model === "imagen-3.0-generate-002" ||
      model === "imagen-4.0-fast-generate-001" ||
      model === "imagen-4.0-generate-001" ||
      model === "imagen-4.0-ultra-generate-001"
    ) {
      return data.output_compression >= 0 && data.output_compression <= 100
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
      } else return undefined;
    } else return undefined;
  }

  public handleModeration<const T extends ImageGenProviders>(
    provider: T,
    model?: ImageGenModels | AllImgGenFacilitatingModelsUnion,
    data?: { moderation?: string }
  ) {
    if (provider !== "openai") return undefined;
    if (
      model === "dall-e-2" ||
      model === "dall-e-3" ||
      model === "imagen-4.0-generate-001" ||
      model === "imagen-3.0-generate-002" ||
      model === "imagen-4.0-fast-generate-001" ||
      model === "imagen-4.0-ultra-generate-001" ||
      model === "gemini-2.5-flash-image" ||
      model === "grok-2-image-1212"
    )
      return undefined;

    const m = data?.moderation as "auto" | "low" | undefined;
    if (typeof m !== "undefined" && /^(low|auto)$/gm.test(m)) {
      return m;
    } else return "low";
  }

  public handlePersonGeneration<const T extends ImageGenProviders>(
    provider: T,
    model?: ImageGenModels,
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
    provider: ImageGenProviders,
    model?: ImageGenModels | AllImgGenFacilitatingModelsUnion,
    data?: { output_quality?: string }
  ) {
    let oq;
    if (provider === "grok") return undefined;
    if (!model) return undefined;
    if (model === "gemini-2.5-flash-image" || model === "grok-2-image-1212")
      return undefined;
    if (
      !(
        model === "dall-e-2" ||
        model === "dall-e-3" ||
        model === "gpt-image-1" ||
        model === "gpt-image-1-mini" ||
        model === "gpt-4.1" ||
        model === "gpt-4.1-mini" ||
        model === "gpt-4.1-nano" ||
        model === "gpt-4o" ||
        model === "gpt-4o-mini" ||
        model === "gpt-5" ||
        model === "gpt-5-mini" ||
        model === "gpt-5-nano" ||
        model === "o3" ||
        model === "imagen-3.0-generate-002"
      )
    ) {
      oq =
        data?.output_quality as GoogleImgSizeQualityOpts["quality"]["imagen-4.0-fast-generate-001"];
      if (typeof oq !== "undefined" && /^(1|2)K$/gm.test(oq)) {
        return oq;
      } else return "1K";
    }
    if (model === "dall-e-2") {
      oq = data?.output_quality as "standard" | "auto" | undefined;
      if (typeof oq !== "undefined" && /^(standard|auto)$/gm.test(oq)) {
        return oq;
      } else return "auto";
    } else if (model === "dall-e-3") {
      oq = data?.output_quality as "hd" | "standard" | "auto" | undefined;
      if (typeof oq !== "undefined" && /^(hd|standard|auto)$/gm.test(oq)) {
        return oq;
      } else return "auto";
    } else {
      oq = data?.output_quality as
        | "high"
        | "medium"
        | "low"
        | "auto"
        | undefined;
      if (typeof oq !== "undefined" && /^(high|medium|low|auto)$/gm.test(oq)) {
        return oq;
      } else return "auto";
    }
  }

  public fallbackImgGenModelByProvider(
    provider: ImageGenProviders,
    model?: ImageGenModels
  ) {
    return (
      model ??
      (provider === "openai"
        ? ("gpt-image-1" as const)
        : provider === "gemini"
          ? ("gemini-2.5-flash-image" as const)
          : ("grok-2-image-1212" as const))
    );
  }

  public handlePartialImgGen(
    provider: ImageGenProviders,
    model?: ImageGenModels | AllImgGenFacilitatingModelsUnion,
    data?: { partialImagesRequested?: number }
  ) {
    if (provider !== "openai") return undefined;
    if (typeof model === "undefined") return undefined;
    if (model === "dall-e-2" || model === "dall-e-3") return undefined;
    if (typeof data?.partialImagesRequested !== "undefined") {
      if (
        data.partialImagesRequested >= 0 &&
        data.partialImagesRequested <= 3
      ) {
        return data.partialImagesRequested;
      }
      if (data.partialImagesRequested > 3) {
        return 3;
      } else return 0;
    } else return 0;
  }

  public handleOutputSize(
    model?: ImageGenModels | AllImgGenFacilitatingModelsUnion,
    data?: { output_size?: string }
  ) {
    let os;
    if (model === "grok-2-image-1212") return undefined;
    else if (model === "dall-e-2") {
      os = data?.output_size as OpenAISizeQualityOpts["size"]["dall-e-2"];
      if (
        typeof os !== "undefined" &&
        /^(256x256|512x512|1024x1024|auto)$/gm.test(os)
      ) {
        return os;
      } else return "auto";
    } else if (model === "dall-e-3") {
      os = data?.output_size as OpenAISizeQualityOpts["size"]["dall-e-3"];
      if (
        typeof os !== "undefined" &&
        /^(1792x1024|1024x1792|1024x1024|auto)$/gm.test(os)
      ) {
        return os;
      } else return "auto";
    } else if (model === "gemini-2.5-flash-image") {
      os =
        data?.output_size as GoogleImgSizeQualityOpts["size"]["gemini-2.5-flash-image"];
      if (
        typeof os !== "undefined" &&
        /^(1:1|2:3|3:2|3:4|4:3|4:5|5:4|9:16|16:9|21:9)$/gm.test(os)
      ) {
        return os;
      } else return "1:1";
    } else if (
      model === "imagen-4.0-generate-001" ||
      model === "imagen-3.0-generate-002" ||
      model === "imagen-4.0-fast-generate-001" ||
      model === "imagen-4.0-ultra-generate-001"
    ) {
      model;
      os = data?.output_size as GoogleImgSizeQualityOpts["size"][
        | "imagen-4.0-ultra-generate-001"
        | "imagen-3.0-generate-002"
        | "imagen-4.0-fast-generate-001"
        | "imagen-4.0-generate-001"];
      if (typeof os !== "undefined" && /^(1:1|3:4|4:3|9:16|16:9)$/gm.test(os)) {
        return os;
      } else return "1:1";
    } else {
      os = data?.output_size as OpenAISizeQualityOpts["size"][
        | "gpt-image-1"
        | "gpt-image-1-mini"];
      if (
        typeof os !== "undefined" &&
        /^(1536x1024|1024x1536|1024x1024|auto)$/gm.test(os)
      ) {
        return os;
      } else return "1:1";
    }
  }
}

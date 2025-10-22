import { Dalle2OutputSize, Dalle3OutputSize, GptImageOutputSize, ImagenOutputSize, NanoBananaOutputSize } from "@/types/index.ts";
import type {
  GeminiImgGenModels,
  GetModelUtilRT,
  GrokImgGenModels,
  ImageGenModels,
  ImageGenProviders,
  OpenAIImgGenModels,
  Provider
} from "@slipstream/types";
import { providerModelChatApi } from "@slipstream/types";
import { imageModelSets } from "@slipstream/types/models";

export class ModelService {
  constructor() {}

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
        } else return "gemini-2.5-flash" as const as NonNullable<K>;
      }
      case "grok": {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"grok">
          )
        ) {
          return model;
        } else return "grok-4-fast-reasoning" as const as NonNullable<K>;
      }
      case "anthropic": {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"anthropic">
          )
        ) {
          return model;
        } else return "claude-haiku-4-5-20251001" as const as NonNullable<K>;
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
        } else return "v0-1.0-md" as const as NonNullable<K>;
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
        } else return "gpt-5-mini" as const as NonNullable<K>;
      }
    }
  };

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

    public handleImgGenCount = (
      model?: ImageGenModels,
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
      model?: ImageGenModels,
      data?: {
        background?: "transparent" | "opaque" | "auto" | undefined;
        format?: "png" | "jpeg" | "webp";
      }
    ) {
      if (provider !== "openai") return undefined;
      if (!model) return undefined;
      if (!(model === "gpt-image-1" || model === "gpt-image-1-mini"))
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
      model?: ImageGenModels,
      data?: {
        input_fidelity?: string;
      }
    ) {
      if (provider !== "openai") return undefined;
      if (!(model === "gpt-image-1")) return undefined;
      const iF = data?.input_fidelity as "low" | "high" | undefined;
      if (typeof iF !== "undefined" && /^(low|high)$/gm.test(iF)) {
        return iF;
      } else return "high";
    }

    public handleImgGenCompression(
      provider: "grok" | "gemini" | "openai",
      model?: ImageGenModels,
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
      if (!model) return undefined;
      if (provider === "openai" && typeof f !== "undefined") {
        if (
          (model === "gpt-image-1" || model === "gpt-image-1-mini") &&
          typeof data?.output_compression !== "undefined"
        ) {
          return f === "png"
            ? undefined
            : data.output_compression >= 0 && data.output_compression <= 100
              ? data.output_compression
              : 100;
        } else return undefined;
      }
      if (
        provider === "gemini" &&
        typeof data?.output_compression !== "undefined" &&
        (model === "imagen-3.0-generate-002" ||
          model === "imagen-4.0-fast-generate-001" ||
          model === "imagen-4.0-generate-001" ||
          model === "imagen-4.0-ultra-generate-001")
      ) {
        return data.output_compression >= 0 && data.output_compression <= 100
          ? data.output_compression
          : data.output_compression > 100
            ? 100
            : 75;
      } else return undefined;
    }

    public handleModeration<const T extends ImageGenProviders>(
      provider: T,
      model?: ImageGenModels,
      data?: { moderation?: string }
    ) {
      if (provider !== "openai") return undefined;
      if (!(model === "gpt-image-1" || model === "gpt-image-1-mini"))
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
      const p = data?.personGeneration as
        | "allow_adult"
        | "allow_all"
        | "dont_allow"
        | undefined;
      if (typeof p !== "undefined") {
        if (/^(dont_allow|allow_(all|adult))$/gm.test(p)) {
          return p;
        } else return "allow_adult";
      } else return "allow_adult";
    }

    public handleImgGenOutputQuality(
      provider: ImageGenProviders,
      model?: ImageGenModels,
      data?: { output_quality?: string }
    ) {
      let oq;
      if (provider === "grok") return undefined;
      if (model === "gemini-2.5-flash-image" || model === "grok-2-image-1212")
        return undefined;
      if (
        !(
          model === "dall-e-2" ||
          model === "dall-e-3" ||
          model === "gpt-image-1" ||
          model === "gpt-image-1-mini"
        )
      ) {
        oq = data?.output_quality as "1K" | "2K" | undefined;
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
      model?: ImageGenModels,
      data?: { partialImagesRequested?: number }
    ) {
      if (provider !== "openai") return undefined;
      if (typeof model === "undefined") return undefined;
      if (!(model === "gpt-image-1" || model === "gpt-image-1-mini"))
        return undefined;
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
      model?: ImageGenModels,
      data?: { output_size?: string }
    ) {
      let os;
      if (model === "grok-2-image-1212") return undefined;
      else if (model === "dall-e-2") {
        os = data?.output_size as Dalle2OutputSize;
        if (
          typeof os !== "undefined" &&
          /^(256x256|512x512|1024x1024|auto)$/gm.test(os)
        ) {
          return os;
        } else return "auto";
      } else if (model === "dall-e-3") {
        os = data?.output_size as Dalle3OutputSize;
        if (
          typeof os !== "undefined" &&
          /^(1792x1024|1024x1792|1024x1024|auto)$/gm.test(os)
        ) {
          return os;
        } else return "auto";
      } else if (model === "gemini-2.5-flash-image") {
        os = data?.output_size as NanoBananaOutputSize;
        if (
          typeof os !== "undefined" &&
          /^(1:1|2:3|3:2|3:4|4:3|4:5|5:4|9:16|16:9|21:9)$/gm.test(os)
        ) {
          return os;
        } else return "1:1";
      } else if (model === "gpt-image-1" || model === "gpt-image-1-mini") {
        os = data?.output_size as GptImageOutputSize;
        if (
          typeof os !== "undefined" &&
          /^(1536x1024|1024x1536|1024x1024|auto)$/gm.test(os)
        ) {
          return os;
        } else return "1:1";
      } else {
        os = data?.output_size as ImagenOutputSize;
        if (typeof os !== "undefined" && /^(1:1|3:4|4:3|9:16|16:9)$/gm.test(os)) {
          return os;
        } else return "1:1";
      }
    }


    public isValidUrl(url: string) {
    return URL.canParse(url);
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

  public isImgGenModel<
    const K extends Provider = Provider,
    const V extends GetModelUtilRT<K> = GetModelUtilRT<K>
  >(target: K, model: V) {
    switch (target) {
      case "gemini":
        return imageModelSets.gemini.has(model as GeminiImgGenModels);
      case "grok":
        return imageModelSets.grok.has(model as GrokImgGenModels);
      case "openai":
        return imageModelSets.openai.has(model as OpenAIImgGenModels);
      case "anthropic":
      case "meta":
      case "vercel":
      default:
        return false;
    }
  }

  public providerToPrismaFormat<const T extends Provider>(provider: T) {
    return provider.toUpperCase() as Uppercase<T>;
  }

  public mimeToExt = {
    "audio/aac": ["aac"],
    "application/x-abiword": ["abw"],
    "image/aces": ["aces"],
    "image/apng": ["apng"],
    "application/x-freearc": ["arc"],
    "image/avci": ["avci"],
    "image/avif": ["avif"],
    "video/x-msvideo": ["avi"],
    "application/vnd.amazon.ebook": ["azw"],
    "application/octet-stream": ["bin", "obj"],
    "multipart/voice-message": ["bin"],
    "image/bmp": ["bmp"],
    "application/x-bzip": ["bz"],
    "application/x-bzip2": ["bz2"],
    "application/x-cdf": ["cda"],
    "text/javascript": ["cjs", "js", "mjs"],
    "application/x-csh": ["csh"],
    "text/css": ["css"],
    "text/csv": ["csv"],
    "application/msword": ["doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
      "docx"
    ],
    "image/dpx": ["dpx"],
    "image/emf": ["emf"],
    "application/vnd.ms-fontobject": ["eot"],
    "application/epub+zip": ["epub"],
    "image/gif": ["gif"],
    "model/gltf-binary": ["glb"],
    "model/gltf+json": ["gltf"],
    "application/gzip": ["gz"],
    "application/node": ["node", "js"],
    "application/x-gzip": ["gz"],
    "haptics/hjif": ["hjif"],
    "haptics/hmpg": ["hmpg"],
    "text/html": ["html", "htm"],
    "image/vnd.microsoft.icon": ["ico"],
    "text/calendar": ["ics"],
    "haptics/ivs": ["ivs", "ivt"],
    "application/java-archive": ["jar"],
    "image/jpeg": ["jpg"],
    "application/json": ["json"],
    "application/ld+json": ["jsonld"],
    "image/ktx": ["ktx"],
    "image/ktx2": ["ktx2"],
    "application/vnd.apple.mpegurl": ["m3u8"],
    "audio/mp4": ["m4a"],
    "video/mp4": ["mp4"],
    "text/markdown": ["md"],
    "application/x-mdx": ["mdx"],
    "audio/midi": ["mid"],
    "audio/x-midi": ["midi"],
    "audio/mpeg": ["mp3"],
    "video/mpeg": ["mpeg"],
    "application/vnd.apple.installer+xml": ["mpkg"],
    "application/x-ndjson": ["ndjson"],
    "model/obj": ["obj"],
    "application/vnd.oasis.opendocument.presentation": ["odp"],
    "application/vnd.oasis.opendocument.spreadsheet": ["ods"],
    "application/vnd.oasis.opendocument.text": ["odt"],
    "audio/ogg": ["opus", "ogg", "oga"],
    "video/ogg": ["ogv"],
    "application/ogg": ["ogx"],
    "font/otf": ["otf"],
    "image/png": ["png"],
    "application/pdf": ["pdf"],
    "application/x-httpd-php": ["php"],
    "application/vnd.apple.pkpass": ["pkpass"],
    "application/vnd.ms-powerpoint": ["ppt"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      ["pptx"],
    "text/x-python": ["py"],
    "application/x-python-code": ["pyc"],
    "application/vnd.rar": ["rar"],
    "application/rtf": ["rtf"],
    "application/x-sh": ["sh"],
    "application/sql": ["sql"],
    "text/event-stream": ["sse", "ts", "rs", "py", "txt"],
    "image/svg+xml": ["svg"],
    "application/x-tar": ["tar"],
    "image/tiff": ["tiff"],
    "application/toml": ["toml"],
    "video/vnd.dlna.mpeg-tts": ["ts"],
    "video/mp2t": ["ts"],
    "text/typescript": ["ts"],
    "application/font-sfnt": ["ttf"],
    "font/ttf": ["ttf"],
    "text/plain": ["txt"],
    "model/vnd.usdz+zip": ["usdz"],
    "application/vnd.visio": ["vsd"],
    "text/vtt": ["vtt"],
    "application/wasm": ["wasm"],
    "audio/wav": ["wav"],
    "video/webm": ["weba"],
    "image/webp": ["webp"],
    "font/woff": ["woff"],
    "font/woff2": ["woff2"],
    "application/xhtml+xml": ["xhtml"],
    "application/vnd.ms-excel": ["xls"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
      "xlsx"
    ],
    "application/xml": ["xml"],
    "application/vnd.mozilla.xul+xml": ["xul"],
    "application/yaml": ["yml", "yaml"],
    "application/x-zip-compressed": ["zip"],
    "application/zip": ["zip"],
    "video/3gpp": ["3gp"],
    "video/3gpp2": ["3g2"],
    "application/x-7z-compressed": ["7z"]
  } as const;

  public isSupportedType(
    type: "IMAGE" | "DOCUMENT" | "VIDEO" | "AUDIO" | "UNKNOWN",
    ext: string
  ) {
    switch (type) {
      case "IMAGE": {
        if (
          [
            "apng",
            "png",
            "jpeg",
            "jpg",
            "heic",
            "svg",
            "ico",
            "gif",
            "bmp",
            "webp",
            "avif",
            "tiff",
            "tif"
          ].includes(ext)
        ) {
          return true;
        } else return false;
      }
      case "DOCUMENT": {
        if (
          [
            "pdf",
            "docx",
            "doc",
            "md",
            "txt",
            "csv",
            "tsv",
            "json",
            "ndjson",
            "jsonl",
            "yaml",
            "htm",
            "html",
            "mhtml",
            "pages",
            "numbers",
            "keynote",
            "xps",
            "yml",
            "xml",
            "tex",
            "rtf",
            "odt",
            "pptx",
            "ppt",
            "xlsx",
            "xls",
            "ods",
            "odp",
            "epub",
            "mobi",
            "azw",
            "fb2",
            "js",
            "jsx",
            "mjs",
            "cjs",
            "ts",
            "tsx",
            "mts",
            "cts",
            "py",
            "java",
            "cpp",
            "c",
            "cs",
            "go",
            "rs",
            "rb",
            "swift",
            "sql",
            "php",
            "sh",
            "toml"
          ].includes(ext)
        ) {
          return true;
        } else return false;
      }
      case "AUDIO": {
        if (
          [
            "mp3",
            "aac",
            "ogg",
            "opus",
            "wma",
            "m4a", // music/general audio
            "m4b", // audiobooks
            "m4p", // protected/DRM audio (iTunes Store)
            "m4r", // iPhone ringtones
            "amr",
            "flac",
            "alac",
            "ape",
            "wv",
            "tta",
            "wav",
            "aiff",
            "pcm",
            "dsd",
            "mka",
            "ac3",
            "dts",
            "webm",
            "m3u8",
            "weba",
            "oga"
          ].includes(ext)
        ) {
          return true;
        } else return false;
      }
      case "VIDEO": {
        if (["mp4", "mkv", "webm", "mov", "ogv", "avi"].includes(ext)) {
          return true;
        } else return false;
      }
      case "UNKNOWN":
      default: {
        return false;
      }
    }
  }
}

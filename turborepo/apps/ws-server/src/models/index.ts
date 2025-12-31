import fsSync from "fs";
import { join, relative, resolve } from "path";
import type { InferTopLevelMime } from "@/types/index.ts";
import type {
  ExpandedDocSpecs,ExpandedImgSpecs
} from "@d0paminedriven/fs";
import { ByteCodec } from "@/byte-codec/index.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  GeminiImgGenModels,
  GetModelUtilRT,
  GrokImgGenModels,
  OpenAIImgGenModels,
  Provider
} from "@slipstream/types";
import { ProviderValidation } from "@slipstream/img-gen";
import { providerModelChatApi } from "@slipstream/types";
import { imageModelSets } from "@slipstream/types/models";

export class ModelService extends ProviderValidation {
  constructor() {
    super();
  }

  public encodeUTF8(text: string) {
    return ByteCodec.encode(text);
  }

  public decodeUTF8(bytes: Uint8Array | NodeJS.NonSharedUint8Array) {
    return ByteCodec.decode(bytes);
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


  public toPathnameExtTuple(path: string) {
    const extAndPath = (path.split(/\//gim).at(-1) ?? "")?.split(/\./gm);
    if (extAndPath.length > 2) {
      const handleFalsePositives = extAndPath
        .slice(0, extAndPath.length - 1)
        ?.join("--");
      const ext = extAndPath.at(-1) ?? "";
      return [handleFalsePositives, ext] as const;
    } else return [extAndPath?.[0] ?? "", extAndPath.at?.(-1) ?? ""] as const;
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
  /**
   *
   * @param target path to the file or directory to check for existence
   * @returns true if the file or directory exists, false otherwise
   * @example
   * ```ts
   * const fs = new Fs(process.cwd());
   * const exists = fs.exists("my-file.txt");
   * console.log(exists); // true if the file exists, false otherwise
   * ```
   * @description
   * This method checks if a file or directory exists at the specified path input
   *
   * Additional Note:
   *
   * say you have a directory that begins with a dot, such as `.turbo`;
   *
   * in this scenario, both `./.turbo` and `.turbo` will return true if the directory exists
   *
   */
  public exists<const T extends string>(target: T) {
    if (!/\//gm.test(target)) {
      if (/\./g.test(target)) {
        return fsSync.existsSync(resolve(join(process.cwd(), target)));
      } else {
        const statsSync = fsSync.statSync(
          resolve(join(process.cwd(), target)),
          {
            throwIfNoEntry: false
          }
        );
        const isDir = statsSync?.isDirectory();
        if (isDir) {
          return isDir;
        } else return false;
      }
    } else {
      if (/\./g.test(target)) {
        return fsSync.existsSync(relative(process.cwd(), target));
      } else {
        const statsSync = fsSync.statSync(relative(process.cwd(), target), {
          throwIfNoEntry: false
        });
        const isDir = statsSync?.isDirectory();
        if (isDir) {
          return isDir;
        } else return false;
      }
    }
  }

  public arrToArrOfArrs = <const T>(
    arr: T[],
    int = 10,
    agg = Array.of<T[]>()
  ) => {
    for (let i = 0; i < arr.length; i++) {
      agg.push(arr.slice(i, i + int));
    }
    return agg;
  };

  public extToContentType(metadata?: ExpandedImgSpecs | ExpandedDocSpecs) {
    return metadata?.format && metadata.format !== "unknown"
      ? metadata.type === "IMAGE"
        ? this.extToMime[metadata.format][0]
        : metadata.type === "DOCUMENT"
          ? (metadata.mimeType ?? "application/octet-stream")
          : "application/octet-stream"
      : "application/octet-stream";
  }

  public mimeToExt = {
    "application/dash+xml": ["mpd"],
    "application/epub+zip": ["epub"],
    "application/font-sfnt": ["ttf"],
    "application/gzip": ["gz"],
    "application/java-archive": ["jar"],
    "application/json": ["json", "jsonc"],
    "application/jsonc": ["jsonc"],
    "application/json5": ["json5"],
    "application/ld+json": ["jsonld"],
    "application/manifest+json": ["webmanifest"],
    "application/msword": ["doc"],
    "application/node": ["node", "js"],
    "application/octet-stream": ["bin", "obj"],
    "application/ogg": ["ogx"],
    "application/pdf": ["pdf"],
    "application/rtf": ["rtf"],
    "application/sql": ["sql"],
    "application/text": ["md"],
    "application/toml": ["toml"],
    "application/vnd.amazon.ebook": ["azw"],
    "application/vnd.apple.installer+xml": ["mpkg"],
    "application/vnd.apple.mpegurl": ["m3u8"],
    "application/vnd.apple.pkpass": ["pkpass"],
    "application/vnd.json5": ["json5"],
    "application/vnd.mozilla.xul+xml": ["xul"],
    "application/vnd.ms-excel": ["xls"],
    "application/vnd.ms-fontobject": ["eot"],
    "application/vnd.ms-powerpoint": ["ppt"],
    "application/vnd.oasis.opendocument.presentation": ["odp"],
    "application/vnd.oasis.opendocument.spreadsheet": ["ods"],
    "application/vnd.oasis.opendocument.text": ["odt"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      ["pptx"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
      "xlsx"
    ],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
      "docx"
    ],
    "application/vnd.rar": ["rar"],
    "application/vnd.visio": ["vsd"],
    "application/wasm": ["wasm"],
    "application/x-7z-compressed": ["7z"],
    "application/x-abiword": ["abw"],
    "application/x-bzip": ["bz"],
    "application/x-bzip2": ["bz2"],
    "application/x-cdf": ["cda"],
    "application/x-csh": ["csh"],
    "application/x-freearc": ["arc"],
    "application/x-gzip": ["gz"],
    "application/x-httpd-php": ["php"],
    "application/x-mdx": ["mdx"],
    "application/x-ndjson": ["ndjson"],
    "application/x-python-code": ["pyc"],
    "application/x-sh": ["sh"],
    "application/x-tar": ["tar"],
    "application/x-zip-compressed": ["zip"],
    "application/xhtml+xml": ["xhtml"],
    "application/xml": ["xml"],
    "application/yaml": ["yml", "yaml"],
    "application/zip": ["zip"],
    "audio/aac": ["aac"],
    "audio/midi": ["mid"],
    "audio/mp4": ["m4a"],
    "audio/mpeg": ["mp3"],
    "audio/ogg": ["opus", "ogg", "oga"],
    "audio/wav": ["wav"],
    "audio/webm": ["weba"],
    "audio/x-midi": ["midi"],
    "font/otf": ["otf"],
    "font/ttf": ["ttf"],
    "font/woff": ["woff"],
    "font/woff2": ["woff2"],
    "haptics/hjif": ["hjif"],
    "haptics/hmpg": ["hmpg"],
    "haptics/ivs": ["ivs", "ivt"],
    "image/aces": ["aces"],
    "image/apng": ["apng"],
    "image/avci": ["avci"],
    "image/avif": ["avif"],
    "image/bmp": ["bmp"],
    "image/dpx": ["dpx"],
    "image/emf": ["emf"],
    "image/gif": ["gif"],
    "image/heic": ["heic"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/ktx": ["ktx"],
    "image/ktx2": ["ktx2"],
    "image/png": ["png"],
    "image/svg+xml": ["svg"],
    "image/tiff": ["tiff"],
    "image/vnd.microsoft.icon": ["ico"],
    "image/webp": ["webp"],
    "image/x-icon": ["ico", "cur"],
    "model/gltf-binary": ["glb"],
    "model/gltf+json": ["gltf"],
    "model/obj": ["obj"],
    "model/vnd.usdz+zip": ["usdz"],
    "multipart/voice-message": ["bin"],
    "text/calendar": ["ics"],
    "text/css": ["css"],
    "text/csv": ["csv"],
    "text/event-stream": ["sse", "ts", "rs", "py", "txt"],
    "text/html": ["html", "htm"],
    "text/javascript": ["cjs", "js", "mjs"],
    "text/markdown": ["md"],
    "text/plain": ["txt"],
    "text/rust": ["rs"],
    "text/typescript": ["ts"],
    "text/vtt": ["vtt"],
    "text/x-c": ["c"],
    "text/x-c++": ["cpp"],
    "text/x-csharp": ["cs"],
    "text/x-java": ["java"],
    "text/x-php": ["php"],
    "text/x-python": ["py"],
    "text/x-ruby": ["rb"],
    "text/x-script.python": ["py"],
    "text/x-tex": ["tex"],
    "text/xml": ["xml"],
    "video/3gpp": ["3gp"],
    "video/3gpp2": ["3g2"],
    "video/mp2t": ["ts"],
    "video/mp4": ["mp4"],
    "video/mpeg": ["mpeg"],
    "video/ogg": ["ogv"],
    "video/vnd.dlna.mpeg-tts": ["ts"],
    "video/webm": ["weba"],
    "video/x-msvideo": ["avi"]
  } as const;

  public extToMime = {
    aac: ["audio/aac"],
    abw: ["application/x-abiword"],
    aces: ["image/aces"],
    apng: ["image/apng"],
    arc: ["application/x-freearc"],
    avci: ["image/avci"],
    avif: ["image/avif"],
    avi: ["video/x-msvideo"],
    azw: ["application/vnd.amazon.ebook"],
    bin: ["application/octet-stream", "multipart/voice-message"],
    bmp: ["image/bmp"],
    bz: ["application/x-bzip"],
    bz2: ["application/x-bzip2"],
    c: ["text/x-c"],
    cda: ["application/x-cdf"],
    cjs: ["text/javascript", "application/node"],
    cpp: ["text/x-c++"],
    cs: ["text/x-csharp"],
    csh: ["application/x-csh"],
    css: ["text/css"],
    csv: ["text/csv"],
    cur: ["image/x-icon"],
    doc: ["application/msword"],
    docx: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ],
    dpx: ["image/dpx"],
    emf: ["image/emf"],
    eot: ["application/vnd.ms-fontobject"],
    epub: ["application/epub+zip"],
    gif: ["image/gif"],
    glb: ["model/gltf-binary"],
    gltf: ["model/gltf+json"],
    gz: ["application/gzip", "application/x-gzip"],
    heic: ["image/heic"],
    hjif: ["haptics/hjif"],
    hmpg: ["haptics/hmpg"],
    htm: ["text/html"],
    html: ["text/html"],
    ico: ["image/vnd.microsoft.icon", "image/x-icon"],
    ics: ["text/calendar"],
    ivs: ["haptics/ivs"],
    ivt: ["haptics/ivs"],
    jar: ["application/java-archive"],
    java: ["text/x-java"],
    jfif: ["image/jpeg"],
    jif: ["image/jpeg"],
    jpe: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    jpg: ["image/jpeg"],
    js: ["text/javascript", "application/node"],
    json: ["application/json"],
    jsonc: ["application/json", "application/jsonc"],
    json5: ["application/json", "application/json5"],
    jsonld: ["application/ld+json"],
    ktx: ["image/ktx"],
    ktx2: ["image/ktx2"],
    m3u8: ["application/vnd.apple.mpegurl"],
    m4a: ["audio/mp4"],
    m4v: ["video/mp4"],
    md: ["text/markdown"],
    mdx: ["application/x-mdx"],
    mid: ["audio/midi"],
    midi: ["audio/x-midi"],
    mjs: ["text/javascript"],
    mp3: ["audio/mpeg"],
    mp4: ["video/mp4"],
    mpd: ["application/dash+xml"],
    mpeg: ["video/mpeg"],
    mpkg: ["application/vnd.apple.installer+xml"],
    mtlx: ["application/xml"],
    ndjson: ["application/x-ndjson"],
    node: ["application/node", "text/javascript"],
    obj: ["model/obj", "application/octet-stream", "text/plain"],
    odp: ["application/vnd.oasis.opendocument.presentation"],
    ods: ["application/vnd.oasis.opendocument.spreadsheet"],
    odt: ["application/vnd.oasis.opendocument.text"],
    oga: ["audio/ogg"],
    ogg: ["audio/ogg"],
    ogv: ["video/ogg"],
    ogx: ["application/ogg"],
    opus: ["audio/ogg"],
    otf: ["font/otf"],
    pk1: ["application/octet-stream"],
    png: ["image/png"],
    pdf: ["application/pdf"],
    php: ["text/x-php", "application/x-httpd-php"],
    pjp: ["image/jpeg"],
    pjpeg: ["image/jpeg"],
    pkpass: ["application/vnd.apple.pkpass"],
    ppt: ["application/vnd.ms-powerpoint"],
    pptx: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ],
    py: ["text/x-python", "text/x-script.python"],
    pyc: ["application/x-python-code"],
    rar: ["application/vnd.rar"],
    rb: ["text/x-ruby"],
    rs: ["text/rust"],
    rtf: ["application/rtf"],
    sh: ["application/x-sh"],
    sql: ["application/sql"],
    sse: ["text/event-stream"],
    svg: ["image/svg+xml"],
    tar: ["application/x-tar"],
    tex: ["text/x-tex"],
    tif: ["image/tiff"],
    tiff: ["image/tiff"],
    toml: ["application/toml"],
    ts: [
      "text/typescript",
      "application/typescript",
      "video/mp2t",
      "video/vnd.dlna.mpeg-tts"
    ],
    ttf: ["application/font-sfnt", "font/ttf"],
    txt: ["text/plain"],
    usdz: ["model/vnd.usdz+zip"],
    vsd: ["application/vnd.visio"],
    vtt: ["text/vtt"],
    wasm: ["application/wasm"],
    wav: ["audio/wav"],
    weba: ["audio/webm"],
    webm: ["video/webm"],
    webmanifest: ["application/manifest+json"],
    webp: ["image/webp"],
    woff: ["font/woff"],
    woff2: ["font/woff2"],
    xhtml: ["application/xhtml+xml"],
    xls: ["application/vnd.ms-excel"],
    xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    xml: ["application/xml", "text/xml"],
    xul: ["application/vnd.mozilla.xul+xml"],
    yaml: ["application/yaml"],
    yml: ["application/yaml"],
    zip: ["application/zip", "application/x-zip-compressed"],
    "3gp": ["video/3gpp"],
    "3g2": ["video/3gpp2"],
    "7z": ["application/x-7z-compressed"]
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
            "heif",
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

  private units = {
    PB: 5,
    TB: 4,
    GB: 3,
    MB: 2,
    KB: 1,
    B: 0
  } as const;
  private u = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

  public autoFileSizeRaw(size: number | bigint) {
    let s = typeof size === "bigint" ? Number(size) : size;
    let i = 0;
    while (s >= 1024 && i < this.u.length - 1) {
      s /= 1024;
      i++;
    }
    return { value: s, unit: this.u[i] };
  }

  public getSize<
    const S extends
      | keyof typeof this.units
      | Lowercase<keyof typeof this.units>
      | "auto"
  >(
    size: number | bigint,
    target: S,
    opts: { decimals?: number; includeUnits?: boolean } = {
      decimals: 4,
      includeUnits: true
    }
  ) {
    const { decimals, includeUnits } = opts;

    if (target === "auto") {
      const { value, unit } = this.autoFileSizeRaw(size);
      const rounded = value.toFixed(decimals);
      return includeUnits ? `${rounded} ${unit}` : Number.parseFloat(rounded);
    }

    const key = (
      target as Exclude<S, "auto">
    ).toUpperCase() as keyof typeof this.units;
    const exp = this.units[key];
    const divisor =
      typeof size === "bigint" ? 1024n ** BigInt(exp) : 1024 ** exp;
    let v = 0;
    if (typeof size === "bigint" || typeof divisor === "bigint") {
      if (typeof size === "bigint" && typeof divisor === "bigint")
        v = Number(size / divisor);
      else if (typeof size !== "bigint" && typeof divisor === "bigint")
        v = size / Number(divisor);
      else if (typeof size === "bigint" && typeof divisor !== "bigint")
        v = Number(size) / divisor;
    } else if (typeof size === "number" && typeof divisor === "number") {
      v = size / divisor;
    }
    const rounded = v.toFixed(decimals);

    return includeUnits
      ? (`${rounded} ${key}` as const)
      : Number.parseFloat(rounded);
  }

  public fileSizeMb<const T extends string>(path: T) {
    return fsSync.statSync(relative(process.cwd(), path)).size / (1024 * 1024);
  }

  public fileSize<
    const T extends string,
    const S extends
      | keyof typeof this.units
      | Lowercase<keyof typeof this.units>
      | "auto"
  >(path: T, target: S, opts?: { decimals?: number; includeUnits?: boolean }) {
    if (!this.exists(path)) throw new Error(`path ${path} does not exist`);
    else {
      return this.getSize(
        fsSync.statSync(relative(process.cwd(), path)).size,
        target,
        opts
      );
    }
  }

  public chunkArray<T extends number>(arr: string[], maxChunkLength: T) {
    const chunks = Array.of<string[]>();
    let currentChunkLength = 0;
    let currentChunk = Array.of<string>();

    for (const [index, val] of arr.entries()) {
      if (val.length + currentChunkLength >= maxChunkLength) {
        if (currentChunk.length) {
          chunks.push(currentChunk);
        }
        currentChunkLength = val.length;
        currentChunk = [val];
      } else {
        currentChunk.push(val);
        currentChunkLength += val.length + 1; // for comma
      }

      if (arr.length === index + 1) {
        chunks.push(currentChunk);
      }
    }
    return chunks.length ? chunks : [arr];
  }
}

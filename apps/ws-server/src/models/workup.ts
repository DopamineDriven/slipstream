import type { ExpandedDocSpecs, ExpandedImgSpecs } from "@d0paminedriven/fs";
import { ByteCodec } from "@/byte-codec/index.ts";
import { ProviderValidation } from "@slipstream/img-gen";

export class ModelServiceWorkup extends ProviderValidation {
  constructor() {
    super();
  }
  public mapParams = <const T extends readonly [string, string][] | string[][]>(
    params: T
  ) =>
    params
      .reduce<string[]>((arr, [k, v]) => {
        if (v) arr.push(`${k}=${encodeURIComponent(v)}`);
        return arr;
      }, [])
      .join("&");
  public encodeUTF8(text: string) {
    return ByteCodec.encode(text);
  }

  public decodeUTF8(bytes: Uint8Array | NodeJS.NonSharedUint8Array) {
    return ByteCodec.decode(bytes);
  }

  public get sysNote() {
    return "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.\nOlder messages are made searchable via tooling to keep things light." as const;
  }

  public formatSysNote(systemPrompt?: string) {
    return systemPrompt ? `${systemPrompt}\n\n${this.sysNote}` : this.sysNote;
  }

  /**
   * Twin of packages/db/src/test/scrub-model-wrappers.ts: anchored strip of
   * model-mimicked <model provider name> wrapper stacks — leading opening-tag
   * stacks and trailing closing-tag stacks ONLY; interior tags are content.
   * Idempotent; the trim fires only when a strip fired.
   *
   * NOT operationalized (deliberate): the mimicry root cause was the anthropic
   * formatter's XML enclosure — now bracket-prefixed — and the corpus is
   * scrubbed, so persist-time scrubbing would be a hot-path pass against a
   * cause that no longer exists. Kept as a utility.
   */
  public scrubModelWrappers(content: string) {
    const leading = /^(?:\s*<model\s+provider="[^"]*"\s+name="[^"]*"\s*>)+\s*/;
    const trailing = /(?:\s*<\/model>)+\s*$/;
    const stripped = content.replace(leading, "").replace(trailing, "");
    return stripped === content ? content : stripped.trim();
  }
  public arrToArrOfArrs = <const T = unknown>(
    arr: readonly T[],
    int = 10,
    agg = Array.of<T[]>()
  ) => {
    for (let i = 0; i < arr.length; i += int) {
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

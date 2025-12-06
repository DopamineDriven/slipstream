import type { HeadObjectCommandOutput } from "@aws-sdk/client-s3";
import type { XOR } from "@slipstream/types";

export const extMimeMap = {
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
  jsonld: ["application/ld+json"],
  jsonc: ["application/json", "application/jsonc"],
  json5: ["application/json", "application/json5"],
  ktx: ["image/ktx"],
  ktx2: ["image/ktx2"],
  m3u8: ["application/vnd.apple.mpegurl"],
  m4a: ["audio/mp4"],
  m4s: ["video/mp4"],
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

export const mimeToExt = {
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
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    "pptx"
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
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
  "video/mp4": ["mp4", "m4v", "m4s"],
  "video/mpeg": ["mpeg"],
  "video/ogg": ["ogv"],
  "video/vnd.dlna.mpeg-tts": ["ts"],
  "video/webm": ["weba"],
  "video/x-msvideo": ["avi"]
} as const;

export type FileExtension = keyof typeof extMimeMap;

export type MimeType = keyof typeof mimeToExt;

export type MimeTypeToFileExtension<
  T extends XOR<typeof mimeToExt, typeof extMimeMap>
> = T[keyof T];

export type FileExtensionToMimeType<T extends FileExtension> =
  (typeof extMimeMap)[T][number];

export type AllMimeTypes = FileExtensionToMimeType<FileExtension>;

export type InferTopLevelPresent<T> = T extends `${infer U}/${string}` ? U : T;

export type PresentMimeTopLevelTypes = InferTopLevelPresent<AllMimeTypes>;

export type MimeTopLevelType =
  | "text"
  | "haptics"
  | "multipart"
  | "image"
  | "font"
  | "video"
  | "audio"
  | "application"
  | "model"
  | "message"
  | "example";
export type ParsedUrlInfo = {
  href: string;
  protocol: string;
  baseUrl: string;
  host: string;
  pathname: string;
  search: string;
  hash: string;
};

export class S3Utils {

    private URL_REGEX =
    /^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
  public parseUrl(url: string) {
    const parsed = this.URL_REGEX.exec(url);
    if (parsed) {
      return {
        href: parsed[0],
        protocol: parsed[1] ?? "",
        baseUrl: `${parsed[1]}${parsed[3]}`,
        host: parsed[4] ?? "",
        pathname: parsed[5] ?? "",
        search: parsed[6] ?? "",
        hash: parsed[8] ?? ""
      } satisfies ParsedUrlInfo;
    } else return null;
  }
  public stripQuotes = (s?: string | null) =>
    s ? s.replace(/^"(.*)"$/, "$1") : undefined;

  /**
   * for the following input: `"s3://my-s3-bucket/my-s3-key#versionversion"`
   *
   * the regex exec yields:  `["s3://my-s3-bucket/my-s3-key#versionversion", "my-s3-bucket", "my-s3-key", "versionversion"]`
   */
  public parseS3ObjectId(id: string): {
    bucket: string;
    key: string;
    versionId?: string;
  } {
    const m = /^s3:\/\/([^/]+)\/(.+?)(?:#(.+))?$/.exec(id);
    if (!m?.[1] || !m?.[2]) throw new Error(`Bad s3ObjectId: ${id}`);
    const versionId =
      typeof m?.[3] !== "undefined" && m[3] !== "nov" ? m[3] : undefined;
    return { bucket: m[1], key: m[2], versionId };
  }

  public extractCleanFilename(target: string) {
    return (target.split(/[/\\]/).pop() ?? "file").replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );
  }

  public checksum(head: HeadObjectCommandOutput) {
    return head.ChecksumSHA256
      ? ({ algo: "SHA256", value: head.ChecksumSHA256 } as const)
      : head.ChecksumCRC32C
        ? ({ algo: "CRC32C", value: head.ChecksumCRC32C } as const)
        : head.ChecksumCRC32
          ? ({ algo: "CRC32", value: head.ChecksumCRC32 } as const)
          : head.ChecksumSHA1
            ? ({ algo: "SHA1", value: head.ChecksumSHA1 } as const)
            : head.ChecksumCRC64NVME
              ? ({ algo: "CRC64NVME", value: head.ChecksumCRC64NVME } as const)
              : undefined;
  }

  public handleExpires(expiresString?: string) {
    return expiresString
      ? new Date(expiresString)
      : new Date(Date.now() + 604800 * 1000);
  }
   public readonly mimeTypeObj = extMimeMap;

  public readonly toExtObj = mimeToExt;

  public compareMimeToExt(p: "mime" | "ext" = "mime") {
    let a: Record<string, number> = {};
    if (p === "mime") {
      for (const [_key, vals] of Object.entries(extMimeMap)) {
        for (const val of vals) {
          a[val] = (a[val] ?? 0) + 1;
        }
      }
      for (const [key, _val] of Object.entries(mimeToExt)) {
        a[key] = (a[key] ?? 0) + 1;
      }
      return Object.fromEntries(
        Object.entries(a).sort(([_a, aa], [_b, bb]) => bb - aa)
      );
    } else {
      for (const [_key, vals] of Object.entries(mimeToExt)) {
        for (const val of vals) {
          a[val] = (a[val] ?? 0) + 1;
        }
      }
      for (const [key, _val] of Object.entries(extMimeMap)) {
        a[key] = (a[key] ?? 0) + 1;
      }
      return Object.fromEntries(
        Object.entries(a).sort(([_a, aa], [_b, bb]) => bb - aa)
      );
    }
  }

  public mimeToExt(mime: keyof typeof this.toExtObj) {
    const extensions = this.toExtObj[mime];

    if (extensions.length === 1) return extensions[0];

    // For multiple extensions, return the most common/standard one
    // Priority: prefer shorter, more common extensions
    if (extensions.length === 2) {
      // Usually the first one is more common (e.g., "jpg" before "jpeg")
      return extensions[0];
    }

    if (extensions.length === 3) {
      // For audio/ogg: ["opus", "ogg", "oga"] - ogg is most common
      if (mime === "audio/ogg") return "ogg";
      // Default to first
      return extensions[0];
    }

    if (extensions.length === 5) {
      return extensions[0]; // jpg
    }

    // Fallback (shouldn't happen with current data)
    return extensions[0];
  }

  public assetType<const T extends string>(url: T) {
    const parsed = this.parseUrl(url);
    if (!parsed) return undefined;
    const ext = parsed.pathname.split(/([.])/g)?.reverse()?.[0]?.toLowerCase();
    return ext && ext in this.mimeTypeObj ? (ext as FileExtension) : undefined;
  }

  public getMimes<const E extends FileExtension>(ext: E) {
    return this.mimeTypeObj[
      ext
    ] satisfies readonly FileExtensionToMimeType<E>[];
  }

  public getMimeFor<const E extends FileExtension>(
    ext: E,
    opts?: { type?: MimeTopLevelType }
  ): FileExtensionToMimeType<E> {
    const mimes = this.getMimes(ext);
    if (mimes.length === 1) return mimes[0];
    if (opts?.type) {
      const found = mimes.find(mime => mime.startsWith(opts.type + "/"));
      return found ?? mimes[0];
    }
    return mimes[0];
  }

  public isMimeFor<const E extends FileExtension>(
    ext: E,
    mime: FileExtensionToMimeType<E>
  ) {
    return this.getMimes(ext).find(s => s === mime);
  }
  public getMimeTypeForPath<T extends string>(
    path: T,
    opts?: { type?: MimeTopLevelType }
  ) {
    const ext = this.assetType(path);
    if (!ext) return "application/octet-stream";
    return this.getMimeFor(ext, opts);
  }
}


import type { GetModelUtilRT, Provider } from "@t3-chat-clone/types";
import { providerModelChatApi } from "@t3-chat-clone/types";

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
        } else return "grok-4" as const as NonNullable<K>;
      }
      case "anthropic": {
        if (
          model &&
          providerModelChatApi[xTarget].includes(
            model as GetModelUtilRT<"anthropic">
          )
        ) {
          return model;
        } else return "claude-sonnet-4-20250514" as const as NonNullable<K>;
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
        } else return "gpt-5-nano" as const as NonNullable<K>;
      }
    }
  };
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
}

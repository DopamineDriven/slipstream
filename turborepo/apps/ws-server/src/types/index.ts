import { WebSocket } from "ws";
import type { $Enums, Attachment } from "@slipstream/db/node/generated/client";
import type {
  AIChatRequest,
  AIChatRequestImgGenFields,
  AllModelsUnion,
  CTR,
  EventTypeMap,
  Provider,
  RTC,
  S3Checksum,
  S3StorageClass
} from "@slipstream/types";

export type ImgMetadataEntity = {
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
  createdAt: undefined;
  updatedAt: undefined;
};

export type ImageGenPartialArr = [
  number, // partial-to-final-index tracking (0 <= n <= 3) n partial images + final response)
  string, // cdnUrl (cloudfront url returned post-s3 upload)
  string, // itemId (shared by all partials and final image)
  number, // width
  number, // height
  string, // mime type
  string, // s3 bucket
  string, // s3 key
  string, // s3 versionId
  string, // s3ObjectId
  string | undefined, // filename
  string | undefined, // extension
  string | undefined, // etag
  number | undefined, // size
  string | undefined, // s3 last modified
  string | undefined, // content disposition
  string | undefined, // cache control
  S3Checksum | undefined, // s3 checksum={checksumSha256, checksumAlgo}
  S3StorageClass | undefined, // s3 storage class
  string, // generationGroupId (unique resp_id via openai -> resp_0769a1845e4ca883016900c9bfb9388193a9efbb12edd87b37 )
  ImgMetadataEntity | undefined, // ImageMetadata via extractor package
number | undefined, // upload duration
string | undefined, // requestMessageId
string | undefined // jobId
];

export type HandleAiChatRequestRT = (
  | ImageGenReqDbRes<true>
  | ConversationSingleton<true>
) & {
  requestMessageId?: string;
  jobId?: string;
  assetCounts: number;
  assets?: {
    type: $Enums.AssetType;
    compatStatus: $Enums.CompatStatus;
    url: string;
    mime: string;
    ext: string;
  }[];
};

export type IncludeCreateConvoWithImgGenProps = {
  conversationSettings: true;
  messages: {
    orderBy: {
      createdAt: "asc";
    };
    include: {
      imageGenJob: true;
      attachments: {
        orderBy: {
          createdAt: "asc";
        };
        include: {
          image: true;
          document: true;
        };
      };
    };
  };
};

export type MessageDataWorkupProps = {
  content: string;
  provider: "OPENAI" | "GEMINI" | "GROK" | "ANTHROPIC" | "META" | "VERCEL";
  senderType: "USER";
  model: AllModelsUnion;
  userId: string;
  userKeyId: string | null;
  imageGenJob: {
    create: {
      userKeyId: string | null;
      userId: string;
      inputFidelity: "low" | "high" | undefined;
      moderation: "auto" | "low" | undefined;
      negativePrompt: string | undefined;
      nRequested: number | undefined;
      nCompleted: 0;
      outputBackground: "transparent" | "opaque" | "auto" | undefined;
      outputCompression: number | undefined;
      outputFormat: string;
      partialImagesRequested: number | undefined;
      outputSize: string | undefined;
      progress: 0;
      seed: number | undefined;
      personGeneration: "DONT_ALLOW" | "ALLOW_ADULT" | "ALLOW_ALL" | undefined;
      stage: "QUEUED";
      outputQuality: string | undefined;
      topP: number | undefined;
      model: AllModelsUnion;
      prompt: string;
      provider: "OPENAI" | "GEMINI" | "GROK" | "ANTHROPIC" | "META" | "VERCEL";
    };
  };
};

export type ConversationSettingsCreateProps = {
  maxTokens: number | undefined;
  topP: number | undefined;
  enableAssetGen: boolean;
  systemPrompt: string | undefined;
  temperature: number | undefined;
};

export type HandleAiChatReqCreateSansImgGenAndAttachmentsProps = {
  batchId: string;
  prompt: string;
  provider: Provider;
  model?: AllModelsUnion;
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  create: ConversationSettingsCreatePropsSansImgGen;
};

export type HandleAiChatReqUpdateSansImgGenAndAttachmentsProps = {
  batchId: string;
  prompt: string;
  conversationId: string;
  provider: Provider;
  model?: AllModelsUnion;
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  update: ConversationSettingsCreatePropsSansImgGen;
};

export type HandleAiChatReqCreateSansImgGenSansAttachmentsProps = {
  prompt: string;
  provider: Provider;
  model?: AllModelsUnion;
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  create: ConversationSettingsCreatePropsSansImgGen;
};

export type HandleAiChatReqUpdateSansImgGenSansAttachmentsProps = {
  prompt: string;
  provider: Provider;
  model?: AllModelsUnion;
  conversationId: string;
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  update: ConversationSettingsCreatePropsSansImgGen;
};
export type ConversationSettingsCreatePropsSansImgGen = {
  maxTokens: number | undefined;
  topP: number | undefined;
  systemPrompt: string | undefined;
  temperature: number | undefined;
};

export type HandleAiChatReqCreateWithImgGenAndAttachmentsProps = {
  batchId: string;
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  create: ConversationSettingsCreateProps;
  includeWithAttachments: IncludeCreateConvoWithImgGenProps;
  messageData: MessageDataWorkupProps;
};

export type HandleAiChatReqUpdateWithImgGenAndAttachmentsProps = {
  batchId: string;
  userId: string;
  conversationId: string;
  apiKey: string | null;
  keyId: string | null;
  update: ConversationSettingsCreateProps;
  includeWithAttachments: IncludeCreateConvoWithImgGenProps;
  messageData: MessageDataWorkupProps;
};

export type HandleAiChatReqCreateWithImgGenSansAttachmentsProps = {
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  create: ConversationSettingsCreateProps;
  includeSansAttachments: IncludeCreateConvoWithImgGenProps;
  messageData: MessageDataWorkupProps;
};

export type HandleAiChatReqUpdateWithImgGenSansAttachmentsProps = {
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  conversationId: string;
  update: ConversationSettingsCreateProps;
  includeSansAttachments: IncludeCreateConvoWithImgGenProps;
  messageData: MessageDataWorkupProps;
};

export type UploadToS3Rt = {
  bucket: string;
  key: string;
  versionId: string;
  contentDisposition: string | undefined;
  cacheControl: string | undefined;
  extension:
    | "pdf"
    | "jpg"
    | "mp4"
    | "mp3"
    | "apng"
    | "png"
    | "gif"
    | "bmp"
    | "webp"
    | "avif"
    | "svg"
    | "ico"
    | "tiff"
    | "mpd"
    | "epub"
    | "ttf"
    | "gz"
    | "jar"
    | "json"
    | "jsonld"
    | "webmanifest"
    | "doc"
    | "node"
    | "js"
    | "bin"
    | "obj"
    | "ogx"
    | "rtf"
    | "sql"
    | "toml"
    | "azw"
    | "mpkg"
    | "m3u8"
    | "pkpass"
    | "xul"
    | "xls"
    | "eot"
    | "ppt"
    | "odp"
    | "ods"
    | "odt"
    | "pptx"
    | "xlsx"
    | "docx"
    | "rar"
    | "vsd"
    | "wasm"
    | "7z"
    | "abw"
    | "bz"
    | "bz2"
    | "cda"
    | "csh"
    | "arc"
    | "php"
    | "mdx"
    | "ndjson"
    | "pyc"
    | "sh"
    | "tar"
    | "zip"
    | "xhtml"
    | "xml"
    | "yml"
    | "aac"
    | "mid"
    | "m4a"
    | "opus"
    | "ogg"
    | "wav"
    | "weba"
    | "midi"
    | "otf"
    | "woff"
    | "woff2"
    | "hjif"
    | "hmpg"
    | "ivs"
    | "aces"
    | "avci"
    | "dpx"
    | "emf"
    | "ktx"
    | "ktx2"
    | "cur"
    | "glb"
    | "gltf"
    | "usdz"
    | "ics"
    | "css"
    | "csv"
    | "sse"
    | "html"
    | "md"
    | "txt"
    | "rs"
    | "ts"
    | "vtt"
    | "c"
    | "cs"
    | "cpp"
    | "java"
    | "py"
    | "rb"
    | "tex"
    | "3gp"
    | "3g2"
    | "mpeg"
    | "ogv"
    | "webm"
    | "avi"
    | undefined;
  expires: Date;
  cdnUrl:
    | `https://assets.aicoalesce.com/${string}`
    | `https://assets-dev.aicoalesce.com/${string}`;
  publicUrl: string;
  presignedUrl: string;
  presignedUrlExpiresAt: number;
  storageClass:
    | "DEEP_ARCHIVE"
    | "EXPRESS_ONEZONE"
    | "FSX_OPENZFS"
    | "GLACIER"
    | "GLACIER_IR"
    | "INTELLIGENT_TIERING"
    | "ONEZONE_IA"
    | "OUTPOSTS"
    | "REDUCED_REDUNDANCY"
    | "SNOW"
    | "STANDARD"
    | "STANDARD_IA"
    | undefined;
  s3ObjectId: `s3://${string}/${string}#${string}`;
  etag: string | undefined;
  size: number | undefined;
  contentType: string | undefined;
  lastModified: string | undefined;
  checksum:
    | {
        readonly algo: "SHA256";
        readonly value: string;
      }
    | {
        readonly algo: "CRC32C";
        readonly value: string;
      }
    | {
        readonly algo: "CRC32";
        readonly value: string;
      }
    | {
        readonly algo: "SHA1";
        readonly value: string;
      }
    | {
        readonly algo: "CRC64NVME";
        readonly value: string;
      }
    | undefined;
};

// new (suggested) way per prisma example repo -- should this be instantiated in the constructor of the PrismaService?
export type InferPromiseRT<T> = T extends Promise<infer U> ? U : T;
export type InferTopLevelMime<T extends string> =
  T extends `${infer X}/${string}` ? InferTopLevelMime<X> : T;

export type UpdateAttachment = CTR<
  RTC<Attachment>,
  "id" | "userId" | "conversationId" | "bucket" | "key" | "versionId"
>;

export type NanoBananaOutputSize =
  | "1:1"
  | "2:3"
  | "3:2"
  | "3:4"
  | "4:3"
  | "4:5"
  | "5:4"
  | "9:16"
  | "16:9"
  | "21:9"
  | undefined;

export type GptImageOutputSize =
  | "1024x1024"
  | "1536x1024"
  | "1024x1536"
  | "auto"
  | undefined;

export type Dalle3OutputSize =
  | "1024x1024"
  | "1792x1024"
  | "1024x1792"
  | "auto"
  | undefined;

export type Dalle2OutputSize =
  | "256x256"
  | "512x512"
  | "1024x1024"
  | "auto"
  | undefined;
export type ImagenOutputSize =
  | "1:1"
  | "9:16"
  | "16:9"
  | "3:4"
  | "4:3"
  | undefined;

export type BigIntToCompatProps<
  T extends "image_gen_request" | "ai_chat_request"
> = T extends "image_gen_request"
  ? {
      props: ImageGenReqDbRes<false>;
      rt: ImageGenReqDbRes<true>;
      rtExtended: ImageGenReqDbRes<true> & {
        /**
         * count of assets bound to the current user messsage
         */
        assetCounts: number;
        assets?: {
          type: $Enums.AssetType;
          compatStatus: $Enums.CompatStatus;
          url: string;
          mime: string;
          ext: string;
        }[];
      };
    }
  : {
      props: ConversationSingleton<false>;
      rt: ConversationSingleton<true>;
      rtExtended: ConversationSingleton<true> & {
        /**
         * count of assets bound to the current user messsage
         */
        assetCounts: number;
        assets?: {
          type: $Enums.AssetType;
          compatStatus: $Enums.CompatStatus;
          url: string;
          mime: string;
          ext: string;
        }[];
      };
    };

export type UpdateAttachmentMetadata = {
  img?:
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
        dominantColorHex: null;
        exifDateTimeOriginal: Date | null;
        format:
          | "jpeg"
          | "png"
          | "gif"
          | "webp"
          | "avif"
          | "heic"
          | "apng"
          | "bmp"
          | "tiff"
          | "ico"
          | "svg"
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
        createdAt: undefined;
        updatedAt: undefined;
      }
    | undefined;
  doc?:
    | {
        author: string | undefined;
        createdAt: Date | undefined;
        updatedAt: Date | undefined;
        encoding: string | undefined;
        format: string;
        isEncrypted: boolean | undefined;
        isSearchable: boolean | undefined;
        keywords: string[] | undefined;
        language: string | undefined;
        lineCount: number | undefined;
        pageCount: number | undefined;
        pdfVersion: string | undefined;
        subject: string | undefined;
        textPreview: string | undefined;
        title: undefined;
        wordCount: number | undefined;
      }
    | undefined;
  type: "IMAGE" | "DOCUMENT";
};

export type UpdateAttachmentCompatProps = {
  attachmentId: string;
  compatKey: string;
  compatStatus: $Enums.CompatStatus;
  compatCdnUrl: string;
  compatReadyAt: Date;
  compatVersionId?: string;
  compatS3ObjectId?: string;
  compatMime?: string;
  compatExt?: string;
};
export interface WSServerOptions {
  port: number;
  channel?: string;
}

export interface UserData {
  ip?: string;
  ua?: string;
  email?: string;
  city?: string;
  country?: string;
  region?: string;
  latlng?: string;
  postalCode?: string;
  tz?: string;
  locale?: string;
}

export type MessageHandler<T extends keyof EventTypeMap> = (
  event: EventTypeMap[T],
  ws: WebSocket,
  userId: string,
  userData?: UserData
) => Promise<void> | void;

export type HandlerMap = {
  [K in keyof EventTypeMap]?: MessageHandler<K>;
};

export type BufferLike =
  | string
  | Buffer
  | DataView
  | number
  | ArrayBufferView
  | Uint8Array
  | ArrayBuffer
  | SharedArrayBuffer
  | Blob
  | readonly any[]
  | readonly number[]
  | { valueOf(): ArrayBuffer }
  | { valueOf(): SharedArrayBuffer }
  | { valueOf(): Uint8Array }
  | { valueOf(): readonly number[] }
  | { valueOf(): string }
  | { [Symbol.toPrimitive](hint: string): string };

export type SSEBufferLike =
  | string
  | Buffer
  | BufferSource
  | ArrayBufferLike
  | ArrayBufferView
  | Blob
  | ArrayLike<number>
  | readonly (Uint8Array | Buffer)[]
  | {
      valueOf(): string | ArrayBufferLike | ArrayBufferView | ArrayLike<number>;
    }
  | { [Symbol.toPrimitive](hint: "string" | "number" | "default"): string };

export interface ProviderChatRequestEntity {
  isNewChat: boolean;
  conversationId: string;
  title?: string;
  apiKey?: string;
  msgs: MessageSingleton<true>[];
  systemPrompt?: string;
  userId: string;
  keyId: string | null;
  topP?: number;
  streamChannel: `stream:${string}`;
  temperature?: number;
  ws: WebSocket;
  max_tokens?: number;
  model?: string;
  chunks: string[];
  thinkingChunks: string[];
  imgGenEnabled?: boolean;
  jobId?: string;
  requestMessageId?: string;
  partialImgArr?: { b64image_url: string }[];
  imgGenFields?: AIChatRequestImgGenFields;
}

export type OpenAIPartialImgSummary = {
  seq: number;
  partial_index: number;
  length: number;
};

export type BigIntOrNumber<T extends boolean = false> = T extends true
  ? number
  : bigint;

export type DocumentSingleton = {
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  attachmentId: string;
  format: string;
  pageCount: number | null;
  wordCount: number | null;
  language: string | null;
  author: string | null;
  subject: string | null;
  keywords: string[];
  pdfVersion: string | null;
  isEncrypted: boolean;
  isSearchable: boolean;
  encoding: string | null;
  lineCount: number | null;
  textPreview: string | null;
};

export type ImageSingleton = {
  createdAt: Date;
  updatedAt: Date;
  attachmentId: string;
  format:
    | "apng"
    | "png"
    | "gif"
    | "bmp"
    | "webp"
    | "avif"
    | "svg"
    | "ico"
    | "tiff"
    | "jpeg"
    | "heic"
    | "unknown"
    | "jxl"
    | "jp2"
    | "jpx"
    | "jxr"
    | "jls"
    | "raw"
    | "dng"
    | "cr2"
    | "nef"
    | "arw"
    | "hdr"
    | "pic"
    | "rgbe"
    | "xyze";
  width: number;
  height: number;
  aspectRatio: number | null;
  frames: number;
  hasAlpha: boolean | null;
  animated: boolean;
  orientation: number | null;
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
    | "gray"
    | null;
  exifDateTimeOriginal: Date | null;
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  gpsLat: number | null;
  gpsLon: number | null;
  dominantColorHex: string | null;
  iccProfile: string | null;
};

export type ConvoSettingsSingleton = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  conversationId: string;
  systemPrompt: string | null;
  temperature: number | null;
  topP: number | null;
  maxTokens: number | null;
  enableThinking: boolean | null;
  trackUsage: boolean | null;
  enableWebSearch: boolean | null;
  enableAssetGen: boolean | null;
  usageAlerts: boolean | null;
};

export type ImageGenJobSingleton ={
            id: string;
            userKeyId: string | null;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            provider: $Enums.Provider;
            model: string;
            keyFingerprint: string | null;
            prompt: string;
            systemPrompt: string | null;
            temperature: number | null;
            topP: number | null;
            nRequested: number;
            nCompleted: number;
            seed: number | null;
            negativePrompt: string | null;
            outputSize: string | null;
            outputQuality: string | null;
            outputFormat: string | null;
            outputBackground: string | null;
            outputCompression: number | null;
            partialImagesRequested: number | null;
            inputFidelity: string | null;
            personGeneration: string | null;
            moderation: string | null;
            stage: $Enums.ImageGenStage;
            progress: number;
            etaSeconds: number | null;
            durationMs: number | null;
            usage: number | null;
            revisedPrompt: string | null;
            error: string | null;
            requestMessageId: string;
}

export type AttachmentSingleton<T extends boolean = false> = {
  id: string;
  conversationId: string | null;
  draftId: string | null;
  batchId: string | null;
  userId: string;
  messageId: string | null;
  s3ObjectId: string | null;
  origin:
    | "UPLOAD"
    | "REMOTE"
    | "GENERATED"
    | "PASTED"
    | "SCREENSHOT"
    | "IMPORTED"
    | "SCRAPED";
  status:
    | "REQUESTED"
    | "PLANNED"
    | "UPLOADING"
    | "STORED"
    | "SCANNING"
    | "READY"
    | "FAILED"
    | "QUARANTINED"
    | "ATTACHED"
    | "DELETED";
  compatKey: string | null;
  compatStatus: "FAILED" | "PENDING" | "ACTIVE" | "ALIASED" | null;
  compatCdnUrl: string | null;
  compatReadyAt: Date | null;
  generationGroupId?: string | null;
  compatVersionId: string | null;
  compatS3ObjectId: string | null;
  compatMime: string | null;
  compatExt: string | null;
  uploadMethod: "GENERATED" | "FETCHED" | "PRESIGNED" | "SERVER";
  assetType: "DOCUMENT" | "IMAGE" | "VIDEO" | "AUDIO" | "UNKNOWN";
  uploadDuration: number | null;
  cdnUrl: string | null;
  publicUrl: string | null;
  sourceUrl: string | null;
  thumbnailKey: string | null;
  bucket: string;
  key: string;
  versionId: string | null;
  region: string;
  cacheControl: string | null;
  contentDisposition: string | null;
  contentEncoding: string | null;
  expiresAt: Date | null;
  size: BigIntOrNumber<T> | null;
  filename: string | null;
  ext: string | null;
  mime: string | null;
  etag: string | null;
  checksumAlgo: "CRC32" | "CRC32C" | "SHA1" | "SHA256" | "CRC64NVME";
  checksumSha256: string | null;
  storageClass: string | null;
  sseAlgorithm: string | null;
  sseKmsKeyId: string | null;
  s3LastModified: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  image: ImageSingleton | null;
  document: DocumentSingleton | null;
};

export type MessageSingleton<T extends boolean = false> = {
  id: string;
  userId: string | null;
  provider: "OPENAI" | "GROK" | "GEMINI" | "ANTHROPIC" | "META" | "VERCEL";
  createdAt: Date;
  updatedAt: Date;
  userKeyId: string | null;
  conversationId: string;
  model: string | null;
  senderType: "USER" | "AI" | "SYSTEM";
  content: string;
  thinkingText: string | null;
  thinkingDuration: number | null;
  liked: boolean | null;
  disliked: boolean | null;
  tryAgain: boolean | null;
  imageGenJob?: ImageGenJobSingleton | null;
  attachments: AttachmentSingleton<T>[];
};

export type ConversationSingleton<T extends boolean = false> = {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  userKeyId: string | null;
  title: string | null;
  branchId: string | null;
  parentId: string | null;
  isShared: boolean;
  shareToken: string | null;
  apiKey: string | null;
  conversationSettings: ConvoSettingsSingleton | null;
  messages: MessageSingleton<T>[];
};

/**
   attachmentId: string;
  compatKey: string;
  compatStatus: $Enums.CompatStatus;
  compatCdnUrl: string;
  compatReadyAt: Date;
  compatVersionId?: string;
  compatS3ObjectId?: string;
  compatMime?: string;
  compatExt?: string;
 */

export type AssetReadyPayload = {
  publicUrl: string | null;
  bucket: string;
  cacheControl: string | null;
  contentDisposition: string | null;
  etag: string | null;
  s3ObjectId: string | null;
  key: string;
  cdnUrl: string | null;
  versionId: string | null;
  size: bigint | null;
  storageClass: string | null;
  id: string;
  conversationId: string | null;
  draftId: string | null;
  batchId: string | null;
  userId: string;
  messageId: string | null;
  origin:
    | "UPLOAD"
    | "REMOTE"
    | "GENERATED"
    | "PASTED"
    | "SCREENSHOT"
    | "IMPORTED"
    | "SCRAPED";
  status:
    | "REQUESTED"
    | "PLANNED"
    | "UPLOADING"
    | "STORED"
    | "SCANNING"
    | "READY"
    | "FAILED"
    | "QUARANTINED"
    | "ATTACHED"
    | "DELETED";
  uploadMethod: "GENERATED" | "FETCHED" | "PRESIGNED" | "SERVER";
  assetType: "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO" | "UNKNOWN";
  uploadDuration: number | null;
  sourceUrl: string | null;
  thumbnailKey: string | null;
  region: string;
  contentEncoding: string | null;
  expiresAt: Date | null;
  filename: string | null;
  ext: string | null;
  mime: string | null;
  checksumAlgo: "CRC32" | "CRC32C" | "SHA1" | "SHA256" | "CRC64NVME";
  checksumSha256: string | null;
  sseAlgorithm: string | null;
  sseKmsKeyId: string | null;
  s3LastModified: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Signals =
  | "SIGABRT"
  | "SIGALRM"
  | "SIGBREAK"
  | "SIGBUS"
  | "SIGCHLD"
  | "SIGCONT"
  | "SIGFPE"
  | "SIGHUP"
  | "SIGILL"
  | "SIGINFO"
  | "SIGINT"
  | "SIGIO"
  | "SIGIOT"
  | "SIGKILL"
  | "SIGLOST"
  | "SIGPIPE"
  | "SIGPOLL"
  | "SIGPROF"
  | "SIGPWR"
  | "SIGQUIT"
  | "SIGSEGV"
  | "SIGSTKFLT"
  | "SIGSTOP"
  | "SIGSYS"
  | "SIGTERM"
  | "SIGTRAP"
  | "SIGTSTP"
  | "SIGTTIN"
  | "SIGTTOU"
  | "SIGUNUSED"
  | "SIGURG"
  | "SIGUSR1"
  | "SIGUSR2"
  | "SIGVTALRM"
  | "SIGWINCH"
  | "SIGXCPU"
  | "SIGXFSZ";

export type ImageGenReqDbRes<T extends boolean = false> = {

  messages: ({
    attachments: ({
      image: {
        createdAt: Date;
        updatedAt: Date;
        format: $Enums.ImageFormat;
        attachmentId: string;
        width: number;
        height: number;
        aspectRatio: number | null;
        frames: number;
        hasAlpha: boolean | null;
        animated: boolean;
        orientation: number | null;
        colorSpace: $Enums.ColorSpace | null;
        exifDateTimeOriginal: Date | null;
        cameraMake: string | null;
        cameraModel: string | null;
        lensModel: string | null;
        gpsLat: number | null;
        gpsLon: number | null;
        dominantColorHex: string | null;
        iccProfile: string | null;
      } | null;
      document: DocumentSingleton | null;
    } & {
      id: string;
      userId: string;
      createdAt: Date;
      updatedAt: Date;
      conversationId: string | null;
      batchId: string | null;
      draftId: string | null;
      messageId: string | null;
      s3ObjectId: string | null;
      origin: $Enums.AssetOrigin;
      status: $Enums.AssetStatus;
      uploadMethod: $Enums.UploadMethod;
      assetType: $Enums.AssetType;
      uploadDuration: number | null;
      cdnUrl: string | null;
      publicUrl: string | null;
      sourceUrl: string | null;
      thumbnailKey: string | null;
      compatMime: string | null;
      compatExt: string | null;
      compatVersionId: string | null;
      compatKey: string | null;
      compatS3ObjectId: string | null;
      compatStatus: $Enums.CompatStatus | null;
      compatReadyAt: Date | null;
      compatCdnUrl: string | null;
      bucket: string;
      key: string;
      versionId: string | null;
      region: string;
      cacheControl: string | null;
      contentDisposition: string | null;
      contentEncoding: string | null;
      expiresAt: Date | null;
      size: BigIntOrNumber<T> | null;
      filename: string | null;
      ext: string | null;
      mime: string | null;
      etag: string | null;
      checksumAlgo: $Enums.ChecksumAlgo;
      checksumSha256: string | null;
      storageClass: string | null;
      sseAlgorithm: string | null;
      sseKmsKeyId: string | null;
      s3LastModified: Date | null;
      deletedAt: Date | null;
    })[];
    imageGenJob: {
      id: string;
      userId: string;
      provider: $Enums.Provider;
      createdAt: Date;
      updatedAt: Date;
      userKeyId: string | null;
      prompt: string;
      model: string;
      systemPrompt: string | null;
      temperature: number | null;
      topP: number | null;
      moderation: string | null;
      negativePrompt: string | null;
      personGeneration: string | null;
      seed: number | null;
      partialImagesRequested: number | null;
      keyFingerprint: string | null;
      nRequested: number;
      nCompleted: number;
      outputSize: string | null;
      outputQuality: string | null;
      outputFormat: string | null;
      outputBackground: string | null;
      outputCompression: number | null;
      inputFidelity: string | null;
      stage: $Enums.ImageGenStage;
      progress: number;
      etaSeconds: number | null;
      durationMs: number | null;
      usage: number | null;
      revisedPrompt: string | null;
      error: string | null;
      requestMessageId: string;
    } | null;
  } & {
    id: string;
    userId: string | null;
    provider: $Enums.Provider;
    createdAt: Date;
    updatedAt: Date;
    userKeyId: string | null;
    conversationId: string;
    model: string | null;
    senderType: $Enums.SenderType;
    content: string;
    thinkingText: string | null;
    thinkingDuration: number | null;
    liked: boolean | null;
    disliked: boolean | null;
    tryAgain: boolean | null;
  })[];
  conversationSettings: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    conversationId: string;
    systemPrompt: string | null;
    temperature: number | null;
    topP: number | null;
    maxTokens: number | null;
    enableThinking: boolean | null;
    trackUsage: boolean | null;
    enableWebSearch: boolean | null;
    enableAssetGen: boolean | null;
    reasoningEffort: $Enums.ReasoningEffort | null;
    outputVerbosity: $Enums.OutputVerbosity | null;
    usageAlerts: boolean | null;
  } | null;
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  userKeyId: string | null;
  title: string | null;
  branchId: string | null;
  parentId: string | null;
  isShared: boolean;
  shareToken: string | null;
  apiKey: string | null;
};
export interface ProviderOpenaiRequestEntity extends ProviderChatRequestEntity {
  user_location?: {
    type: "approximate";
    city?: string;
    region?: string;
    country?: string;
    tz?: string;
  };

  currentMsgBoundAssets?: {
    /**
     * count of assets bound to the current user messsage
     */
            jobId?: string;
        requestMessageId?: string;
    assetCounts: number;
    assets?: {
      type: $Enums.AssetType;
      compatStatus: $Enums.CompatStatus;
      url: string;
      mime: string;
      ext: string;
    }[];
  };
}

export type NormalizeAIChatReqDataRT = {
  provider: Provider;
  model: AllModelsUnion;
  topP: number | undefined;
  temperature: number | undefined;
  systemPrompt: string | undefined;
  max_tokens: number | undefined;
  hasProviderConfigured: boolean | undefined;
  isDefaultProvider: boolean | undefined;
  prompt: string;
  conversationIdInitial: string;
  batchId: string | undefined;
  imgGenEnabled: boolean | undefined;
  isNewChat: boolean;
  isImgGenCapable: boolean;
  isPureImgGenModel: boolean;
  imgGenFields: AIChatRequest["imgGenFields"];
};

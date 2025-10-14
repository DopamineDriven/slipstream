import { WebSocket } from "ws";
import type { $Enums, Attachment } from "@slipstream/db/node/generated/client";
import type { CTR, EventTypeMap, RTC } from "@slipstream/types";

// new (suggested) way per prisma example repo -- should this be instantiated in the constructor of the PrismaService?

export type InferTopLevelMime<T extends string> =
  T extends `${infer X}/${string}` ? InferTopLevelMime<X> : T;

export type UpdateAttachment = CTR<
  RTC<Attachment>,
  "id" | "userId" | "conversationId" | "bucket" | "key" | "versionId"
>;

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
}

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

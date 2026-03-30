import { WebSocket } from "ws";
import type { $Enums, Attachment } from "@slipstream/db/node/generated/client";
import type {
  AIChatRequestImgGenFields,
  AllModelsUnion,
  ClientContextWorkupProps,
  ConversationSingletonOneOff as ConversationSingleton,
  CTR,
  EventTypeMap,
  GetModelUtilRT,
  MessageSingleton,
  Provider,
  RTC,
  S3StorageClass
} from "@slipstream/types";

export type Include<T, U extends T> =  Exclude<T, Exclude<T, U>>;

export type S3FinalizePayload = {
  bucket: string;
  key: string;
  versionId: string;
  contentDisposition: string | undefined;
  cacheControl: string | undefined;
  extension?: string;
  expires: Date;
  cdnUrl:
    | `https://assets.aicoalesce.com/${string}`
    | `https://assets-dev.aicoalesce.com/${string}`;
  publicUrl: string;
  presignedUrl: string;
  presignedUrlExpiresAt: number;
  storageClass: S3StorageClass | undefined;
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

export type HandleAiChatRequestRT = (
  | ImageGenReqDbRes<true>
  | ConversationSingleton<true>
) & {
  apiKey?: string | null;
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
          imageGenOutput: true;
        };
      };
    };
  };
};

export type MessageDataWorkupProps = {
  content: string;
  provider: $Enums.Provider;
  senderType: "USER";
  model?: AllModelsUnion;
  userId: string;
  userKeyId: string | null;
  imageGenJob: {
    create: {
      userKeyId: string | null;
      userId: string;
      inputFidelity: "low" | "high" | (string & {}) | undefined;
      moderation: (string & {}) | "auto" | "low" | undefined;
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
      personGeneration:
        | (string & {})
        | "DONT_ALLOW"
        | "ALLOW_ADULT"
        | "ALLOW_ALL"
        | undefined;
      stage: "QUEUED";
      outputQuality: string | undefined;
      topP: number | undefined;
      model: GetModelUtilRT<Provider>;
      prompt: string;
      provider: $Enums.Provider;
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

// new (suggested) way per prisma example repo -- should this be instantiated in the constructor of the PrismaService?
export type InferPromiseRT<T> = T extends Promise<infer U> ? U : T;
export type InferTopLevelMime<T extends string> =
  T extends `${infer X}/${string}` ? InferTopLevelMime<X> : T;

export type UpdateAttachment = CTR<
  RTC<Attachment>,
  "id" | "userId" | "conversationId" | "bucket" | "key" | "versionId"
>;

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
        colorSpace: $Enums.ColorSpace | null;
        colorModel: $Enums.ColorModel | null;
        dominantColorHex: null;
        exifDateTimeOriginal: Date | null;
        format: $Enums.ImageFormat | undefined;
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
        isLinearized: boolean | undefined;
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
  providerContext?: ClientContextWorkupProps;
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
  userMsgId: string;
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
  docCounts: number;
  imgCounts: number;
}

export interface ImageGenReqDbRes<
  T extends boolean = false
> extends ConversationSingleton<T> {
  apiKey?: string | null;
}

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

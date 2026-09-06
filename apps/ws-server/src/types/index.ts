import { WebSocket } from "ws";
import type { $Enums, Attachment } from "@slipstream/db/node/generated/client";
import type {
  AIChatRequestImgGenFields,
  AllModelsUnion,
  AudioSingleton,
  ClientContextWorkupProps,
  ConversationSingletonOneOff as ConversationSingleton,
  CTR,
  DocumentSingleton,
  EventTypeMap,
  GetModelUtilRT,
  ImageSingleton,
  LocalToolCapabilities,
  MessageSingleton,
  Provider,
  RTC,
  S3StorageClass
} from "@slipstream/types";

export type Include<T, U extends T> = Exclude<T, Exclude<T, U>>;

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
  ImageGenReqDbRes<true> | ConversationSingleton<true>
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

export type IncludeCreateConvoWithImgGenOrAudioGenProps = {
  conversationSettings: true;
  messages: {
    orderBy: {
      // ordinal is the authoritative dense sequence — createdAt can tie
      ordinal: "asc";
    };
    include: {
      audioGenJob: true;
      imageGenJob: true;
      messageBlocks: { orderBy: { ordinal: "asc" } };
      attachments: {
        orderBy: {
          createdAt: "asc";
        };
        include: {
          image: true;
          document: true;
          audio: true;
          audioGenOutput: true;
          imageGenOutput: true;
        };
      };
    };
  };
};

export type MessageDataWithAudioGenProps = {
  content: string;
  provider: $Enums.Provider;
  senderType: "USER";
  model?: AllModelsUnion;
  userId: string;
  userKeyId: string | null;
  audioGenJob: {
    create: {
      provider: $Enums.Provider;
      model: string;
      userId: string;
      keyFingerprint?: string | null;
      prompt: string;
      systemPrompt?: string | null;
      stage?: $Enums.AudioGenStage;
      progress?: number;
      etaSeconds?: number | null;
      durationMs?: number | null;
      usage?: number | null;
      error?: string | null;
      createdAt?: Date | string;
      updatedAt?: Date | string;
    };
  };
};

export type MessageDataWithImgGenProps = {
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
        (string & {}) | "DONT_ALLOW" | "ALLOW_ADULT" | "ALLOW_ALL" | undefined;
      stage: "QUEUED";
      outputQuality: string | undefined;
      topP: number | undefined;
      model: GetModelUtilRT<Provider>;
      prompt: string;
      provider: $Enums.Provider;
    };
  };
};

export type ConversationSettingsCreatePropsWithAssetGen = {
  maxTokens: number | undefined;
  topP: number | undefined;
  enableAssetGen: boolean;
  systemPrompt: string | undefined;
  temperature: number | undefined;
};

export type HandleAiChatReqCreateSansAssetGenWithAttachmentsProps = {
  batchId: string;
  prompt: string;
  provider: Provider;
  model?: AllModelsUnion;
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  create: ConversationSettingsCreatePropsSansAssetGen;
};

export type HandleAiChatReqUpdateSansAssetGenWithAttachmentsProps = {
  batchId: string;
  prompt: string;
  conversationId: string;
  provider: Provider;
  model?: AllModelsUnion;
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  update: ConversationSettingsCreatePropsSansAssetGen;
};

export type HandleAiChatReqCreateSansAssetGenSansAttachmentsProps = {
  prompt: string;
  provider: Provider;
  model?: AllModelsUnion;
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  create: ConversationSettingsCreatePropsSansAssetGen;
};

export type HandleAiChatReqUpdateSansAssetGenSansAttachmentsProps = {
  prompt: string;
  provider: Provider;
  model?: AllModelsUnion;
  conversationId: string;
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  update: ConversationSettingsCreatePropsSansAssetGen;
};
export type ConversationSettingsCreatePropsSansAssetGen = {
  maxTokens: number | undefined;
  topP: number | undefined;
  systemPrompt: string | undefined;
  temperature: number | undefined;
};

export type HandleAiChatReqCreateWithImgGenWithAttachmentsProps = {
  batchId: string;
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  create: ConversationSettingsCreatePropsWithAssetGen;
  includeWithAttachments: IncludeCreateConvoWithImgGenOrAudioGenProps;
  messageData: MessageDataWithImgGenProps;
};

export type HandleAiChatReqCreateWithAudioGenWithAttachmentsProps = {
  batchId: string;
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  create: ConversationSettingsCreatePropsWithAssetGen;
  includeWithAttachments: IncludeCreateConvoWithImgGenOrAudioGenProps;
  messageData: MessageDataWithAudioGenProps;
};

export type HandleAiChatReqUpdateWithImgGenWithAttachmentsProps = {
  batchId: string;
  userId: string;
  conversationId: string;
  apiKey: string | null;
  keyId: string | null;
  update: ConversationSettingsCreatePropsWithAssetGen;
  includeWithAttachments: IncludeCreateConvoWithImgGenOrAudioGenProps;
  messageData: MessageDataWithImgGenProps;
};

export type HandleAiChatReqUpdateWithAudioGenWithAttachmentsProps = {
  batchId: string;
  userId: string;
  conversationId: string;
  apiKey: string | null;
  keyId: string | null;
  update: ConversationSettingsCreatePropsWithAssetGen;
  messageData: MessageDataWithAudioGenProps;
};

export type HandleAiChatReqCreateWithAudioGenSansAttachmentsProps = {
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  create: ConversationSettingsCreatePropsWithAssetGen;
  includeSansAttachments: IncludeCreateConvoWithImgGenOrAudioGenProps;
  messageData: MessageDataWithAudioGenProps;
};

export type HandleAiChatReqCreateWithImgGenSansAttachmentsProps = {
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  create: ConversationSettingsCreatePropsWithAssetGen;
  includeSansAttachments: IncludeCreateConvoWithImgGenOrAudioGenProps;
  messageData: MessageDataWithImgGenProps;
};

export type HandleAiChatReqUpdateWithImgGenSansAttachmentsProps = {
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  conversationId: string;
  update: ConversationSettingsCreatePropsWithAssetGen;
  includeSansAttachments: IncludeCreateConvoWithImgGenOrAudioGenProps;
  messageData: MessageDataWithImgGenProps;
};

export type HandleAiChatReqUpdateWithAudioGenSansAttachmentsProps = {
  userId: string;
  apiKey: string | null;
  keyId: string | null;
  conversationId: string;
  update: ConversationSettingsCreatePropsWithAssetGen;
  messageData: MessageDataWithAudioGenProps;
};

// new (suggested) way per prisma example repo -- should this be instantiated in the constructor of the PrismaService?
export type InferPromiseRT<T> = T extends Promise<infer U> ? U : T;
export type InferTopLevelMime<T extends string> =
  T extends `${infer X}/${string}` ? InferTopLevelMime<X> : T;

export type UpdateAttachment = CTR<
  RTC<Attachment>,
  "id" | "userId" | "conversationId" | "bucket" | "key" | "versionId"
>;
export type AiChatRequestType =
  "image_gen_request" | "ai_chat_request" | "audio_gen_request";
export type BigIntToCompatProps<T extends AiChatRequestType> =
  T extends "image_gen_request"
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
  img?: ImageSingleton | undefined;
  doc?: DocumentSingleton | undefined;
  audio: AudioSingleton | undefined;
  type: "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO";
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
  browserName?: string;
  browserVersion?: string;
  viewport?: string;
  via?: "web" | "cli";
  "client-tz"?: string;
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
  audioGenEnabled?: boolean;
  jobId?: string;
  requestMessageId?: string;
  partialImgArr?: { b64image_url: string }[];
  imgGenFields?: AIChatRequestImgGenFields;

  docCounts: number;
  imgCounts: number;
  hasUserStoreDocs: boolean;
  /**
   * Local read-only tool capability advertisement (Sovereign CLI) — rides
   * through from ai_chat_request. Absent means the provider request
   * carries zero local tool definitions; never inferred from user agent.
   */
  localTools?: LocalToolCapabilities;
  /**
   * client provenance from UserData (handshake cookie, server-narrowed) —
   * "cli" admits the local bridge entries into the tool catalog registry
   */
  via?: "web" | "cli";
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

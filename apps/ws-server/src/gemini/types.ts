import type {
  ProviderChatRequestEntity,
  S3FinalizePayload,
  UserData
} from "@/types/index.ts";
import type { ExpandedImgSpecs } from "@d0paminedriven/fs";
import type { File as GeminiFile } from "@google/genai";
import type { CompatStatus } from "@slipstream/db/enums-node";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  AIChatRequestImgGenFields,
  Equal,
  ImgMetadataEntity,
  MessageSingleton,
  S3Checksum,
  S3StorageClass
} from "@slipstream/types";

export type UnionToRecord<
  TUnion extends { type: string },
  TDiscriminant extends string = TUnion["type"]
> = {
  [K in TDiscriminant]: Extract<TUnion, { type: K }>;
};

// export type InteractionDeltas = CTR<
//   Interactions.Content,
//   "event_id"
// >["delta"];

// export type GeminiEventMap = UnionToRecord<InteractionDeltas>;

export interface ProviderGeminiChatRequestEntity extends ProviderChatRequestEntity {
  userData?: UserData;
}

export type StoreDocDbRegistryProps = {
  id: string | null;
  storeId: string | null;
  storeRef: string | null;
  attachmentId: string | null;
  provider: $Enums.Provider | null;
  docRef: string | null;
  docUri: string | null;
  filename: string | null;
  state: $Enums.ProviderDocState | null;
  indexedAt: Date | null;
  mimeType: string | null;
  errorMessage: string | null;
  lastAccessed: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  size: number | null;
};

export type AssetCacheProps = {
  fileUri: string;
  storeRef: string;
  expiresAt: Date;
  databaseId: string;
  storeDbId: string;
};

export type DocCountProps = {
  activeDocumentsCount?: string | undefined;
  pendingDocumentsCount?: string | undefined;
  failedDocumentsCount?: string | undefined;
};

export type FssRecordProps = {
  hasStore: boolean;
  storeRef: string;
  storeDisplayName: string;
  createdAt: string;
  updatedAt: string;
  totalDocuments: number;
};

export type DbDocsCacheProps = {
  attachmentId: string;
  dbId: string;
  docUri: string;
  docRef: string;
  mime: string;
  size: number;
  state: $Enums.ProviderDocState;
  lastAccessed: Date;
  /**
   * Unique Resource Identifier for FSS
   */
  storeName: string;
  storeDisplayName: string;
  dbStoreId: string;
};

export type StringList = {
  /** The string values of the metadata to store. */
  values?: string[];
};

export type FssCustomMetadata = {
  key: string;
  stringValue: string;
}[];
export type FssWhiteSpaceConfig = {
  maxTokensPerChunk: number;
  maxOverlapTokens: number;
};
export type FssChunkingConfig = {
  whiteSpaceConfig: FssWhiteSpaceConfig;
};

export type FssImportFileConfig = {
  chunkingConfig: FssChunkingConfig;
  customMetadata: FssCustomMetadata;
};
export type FssImportFileParams = {
  fileName: string;
  fileSearchStoreName: string;
  config: FssImportFileConfig;
};

export interface FssDoc {
  /** The resource name of the Document */
  name?: string;
  /** The human-readable display name for the Document */
  displayName?: string;
  /** The current state of the Document */
  state?:
    | "STATE_UNSPECIFIED"
    | "STATE_PENDING"
    | "STATE_ACTIVE"
    | "STATE_FAILED";
  /** The size of the Document in bytes */
  sizeBytes?: string;
  /** The MIME type of the Document */
  mimeType?: string;
  /** Output only. The Timestamp of when the `Document` was created */
  createTime?: string;
  /** Optional. User provided custom metadata stored as key-value pairs used for querying. A `Document` can have a maximum of 20 `CustomMetadata`. */
  customMetadata?: CustomMetadataSingleton[];
  /** Output only. The Timestamp of when the `Document` was last updated. */
  updateTime?: string;
}

export interface FssDocSurfacedMeta {
  attachmentId: string;
  conversationId: string;
  messageId: string;
  originalFilename: string;
  name?: string;
  displayName?: string;
  state?:
    | "STATE_UNSPECIFIED"
    | "STATE_PENDING"
    | "STATE_ACTIVE"
    | "STATE_FAILED";
  sizeBytes?: string;
  mimeType?: string;
  createTime?: string;
  updateTime?: string;
}
export type SurfaceMeta<T extends boolean = true> = T extends false
  ? FssDoc
  : FssDocSurfacedMeta;

export type EqCheck = Equal<FssDoc[], SurfaceMeta<false>[]>;

export type OOO = SurfaceMeta<true>;

export interface EphemeralFile extends GeminiFile {}
export type CustomMetadataSingleton = {
  /** Required. The key of the metadata to store. */
  key?: string;
  /** The numeric value of the metadata to store. */
  numericValue?: number;
  /** The StringList value of the metadata to store. */
  stringListValue?: StringList;
  /** The string value of the metadata to store. */
  stringValue?: string;
};
export interface AttProvider {
  fileUri: string;
  storeRef: string;
  expiresAt: Date;
  databaseId: string;
  storeDbId: string;
}

export type FSSAssetCacheProps = {
  fileUri?: string;
  fileExpiresAt?: Date;

  storeRef: string;
  fssDocumentId?: string;

  databaseId: string;
  storeDbId: string;
};

export type GenerateContentResponseProps = {
  userId: string;
  isNewChat: boolean;
  msgs: MessageSingleton<true>[];
  model: string | null;
  keyId: string | null;
  apiKey?: string;
  latlng?: string;
  topP?: number;
  temperature?: number;
  max_tokens?: number;
  systemPrompt?: string;
  imgGenFields?: AIChatRequestImgGenFields;
  requestMessageId?: string;
};

export type ImageGenArr = [
  number, // tracks image output index
  string, // cdnUrl (cloudfront url returned post-s3 upload)
  string, // itemId (image output id)
  number, // width
  number, // height
  number, // aspect ratio
  (
    | "image/png"
    | "image/jpeg"
    | "image/webp"
    | "image/heic"
    | "image/heif"
    | (string & {})
  ), // mime type (defined by google sdk)
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
  S3Checksum, // s3 checksum={checksumSha256, checksumAlgo}
  S3StorageClass, // s3 storage class
  string, // generationGroupId (unique interactionId)
  ImgMetadataEntity | undefined, // ImageMetadata via extractor package
  number | undefined, // upload duration
  string | undefined, // requestMessageId
  string | undefined, // jobId
  string | undefined, // revised_prompt
  S3FinalizePayload,
  ExpandedImgSpecs
];

export type GoogleImgGenMimeType =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/heic"
  | "image/heif"
  | (string & {});
export type GoogleImgGenExt =
  | "png"
  | "webp"
  | "jpeg"
  | "heic"
  | "heif"
  | (string & {});

export type ImageGenObj = {
  index: number;
  /**
   * image output id
   */
  itemId: string;
  cdnUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
  mimeType: GoogleImgGenMimeType;
  ext: GoogleImgGenExt;
  s3Bucket: string;
  s3Key: string;
  s3VersionId: string;
  s3ObjectId: string;
  compatStatus: CompatStatus;
  compatCdnUrl: string;
  compatMime: GoogleImgGenMimeType;
  compatExt: GoogleImgGenExt;
  compatWidth?: number;
  compatHeight?: number;
  compatAspectRatio?: number;
  size?: number;
  filename?: string;
  etag?: string;
  s3LastModified?: string;
  contentDisposition?: string;
  cacheControl?: string;
  s3Checksum: S3Checksum;
  s3StorageClass: S3StorageClass;
  imgMetadata?: ImgMetadataEntity;
  /**
   * interactionId
   */
  generationGroupId: string;
  uploadDuration?: number;
  requestMessageId?: string;
  jobId?: string;
  s3FinalizePayload: S3FinalizePayload;
  expandedImgSpecs: ExpandedImgSpecs;
};

import type {
  ProviderChatRequestEntity,
  S3FinalizePayload
} from "@/types/index.ts";
import type { ExpandedImgSpecs } from "@d0paminedriven/fs";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  ImgMetadataEntity,
  S3Checksum,
  S3StorageClass
} from "@slipstream/types";

export type MaybePromise<T> = T | Promise<T>;

export type XAIReturnedDocMetadata = {
  file_id: string;
  name: string;
  size_bytes: number;
  content_type: string;
  created_at_nanos: number;
  created_at: number; // unix timestamp (seconds)
  hash: string;
  status: number;
};

export type GlobalDictProps = {
  upload_result: Promise<XAIReturnedDocMetadata>;
};

export type PythonExecType = (
  uploadScript: string,
  global_dict: {
    upload_result: Promise<XAIReturnedDocMetadata>;
  }
) => MaybePromise<unknown>;

export type PythonGlobalsType = () => Promise<GlobalDictProps>;

export type PythonBuiltIns = {
  exec: Promise<PythonExecType>;
  globals: Promise<PythonGlobalsType>;
};

export type FieldDefinition = {
  key: string;
  required: boolean;
  inject_into_chunk: boolean;
  unique: boolean;
  description: string;
};

export type GrokEncodingNameUnion =
  | "o200k_base"
  | "cl100k_base"
  | "p50k_base"
  | "p50k_edit"
  | "r50k_base";

export type TokensConfiguration = {
  max_chunk_size_tokens: number;
  chunk_overlap_tokens: number;
  encoding_name: GrokEncodingNameUnion;
};

export type CharsConfiguration = {
  max_chunk_size_chars: number;
  chunk_overlap_chars: number;
};

export type AstConfiguration = {
  max_chunk_size_tokens: number;
  encoding_name: GrokEncodingNameUnion;
};

export type TableConfiguration = {
  max_chunk_size_tokens: number;
  encoding_name: GrokEncodingNameUnion;
};

export type MarkdownTokensConfiguration = {
  max_chunk_size_tokens: number;
  chunk_overlap_tokens: number;
  encoding_name: GrokEncodingNameUnion;
};

export type MarkdownCharsConfiguration = {
  max_chunk_size_chars: number;
  chunk_overlap_chars: number;
};

export type CodeTokensConfiguration = {
  max_chunk_size_tokens: number;
  chunk_overlap_tokens: number;
  encoding_name: GrokEncodingNameUnion;
};

export type CodeCharsConfiguration = {
  max_chunk_size_chars: number;
  chunk_overlap_chars: number;
};

export type ChunkConfigurationTarget =
  | { chars_configuration: CharsConfiguration }
  | { tokens_configuration: TokensConfiguration }
  | { ast_configuration: AstConfiguration }
  | {
      table_configuration: TableConfiguration;
    }
  | {
      markdown_tokens_configuration: MarkdownTokensConfiguration;
    }
  | {
      markdown_chars_configuration: MarkdownCharsConfiguration;
    }
  | {
      code_tokens_configuration: CodeTokensConfiguration;
    }
  | {
      code_chars_configuration: CodeCharsConfiguration;
    };

export type ChunkConfiguration = ChunkConfigurationTarget & {
  strip_whitespace: boolean;
  inject_name_into_chunks: boolean;
};

export type GrokEmbeddingModelType = "large" | "beta" | "small";

export type GrokEmbeddingModels = `grok-embedding-${GrokEmbeddingModelType}`;

export type IndexConfiguration = {
  model_name: GrokEmbeddingModels;
};

export type DocumentStatusSuffix =
  | "UNKNOWN"
  | "FAILED"
  | "PROCESSING"
  | "PROCESSED";

export type DocumentStatus = `DOCUMENT_STATUS_${DocumentStatusSuffix}`;

type MetricSpaceSuffix = "UNKNOWN" | "COSINE" | "EUCLIDEAN" | "INNER_PRODUCT";

export type MetricSpace = `HNSW_METRIC_${MetricSpaceSuffix}`;

export type CreateCollectionRequest = {
  collection_name: string;
  team_id?: string;
  index_configuration: IndexConfiguration;
  chunk_configuration: ChunkConfiguration;
  /** Distance space for the HNSW index */
  metric_space?: MetricSpace;
  field_definitions?: FieldDefinition[];
};

export type UploadFileRT = {
  bytes: number;
  created_at: number; // milliseconds
  expires_at: null; // always null
  filename: string; // always `${conversationId}-${messageId}-${attachmentId}-${hexEncodedFilename}.${extension}` format
  id: string; // always prefixed with "file_" + uuid
  object: "file"; // always "file"
  purpose: string; // always an empty string ""
};

export type FileErrorRT = {
  code: string;
  error: string;
};

export type GetFilesRT = {
  data: UploadFileRT[];
  pagination_token: string | null;
};

export interface Collection {
  collection_id: string;
  collection_name: string;
  created_at: string;
  index_configuration: IndexConfiguration;
  chunk_configuration: ChunkConfiguration;
  documents_count: number;
  field_definitions: FieldDefinition[];
  collection_description?: string;
}

export type ListCollectionsResponse = {
  collections: Collection[];
  pagination_token?: string;
};

export interface DocumentFields {
  attachmentId: string;
  conversationId: string;
  messageId: string;
  originalFilename: string;
}

export interface CollectionDocument {
  file_metadata: DocumentFilemetadata;
  fields: DocumentFields;
  status: DocumentStatus;
  error_message: string;
  last_indexed_at: string | null;
}

export type UploadStatus = "Initializing" | "Uploading" | "Complete" | "Failed";

export type ProcessingStatus =
  | "Pending"
  | "Processing"
  | "Complete"
  | "Failed"
  | "Skipped";

export interface DocumentFilemetadata {
  file_id: string;
  name: string;
  size_bytes: string;
  content_type: string;
  created_at: string;
  expires_at: null;
  hash: string;
  upload_status: UploadStatus;
  processing_status: ProcessingStatus;
  file_path: string;
}

export type GetDocumentsByCollectionId = {
  documents: CollectionDocument[];
  pagination_token?: string;
};

export type AssetCache = {
  attachmentId: string;
  fileId: string; // xAI file_id (e.g., file_a4315326-...)
  collectionId: string; // xAI collection_id
  databaseId: string; // AttachmentProvider.id
  storeDbId: string; // ProviderStore.id
  lastAccessedAt: Date | null;
};

export type xAIDocDbRegistryProps = {
  id: string;
  storeId: string;
  storeRef: string;
  attachmentId: string;
  provider: $Enums.Provider;
  docRef: string;
  docUri: string | null;
  filename: string;
  state: $Enums.ProviderDocState | null;
  indexedAt: Date | null;
  mimeType: string;
  errorMessage: string | null;
  lastAccessed: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
  size: number | null;
};
export type DeleteXaiFileResponse = {
  id: string;
  deleted: boolean;
  object: string;
};

export interface xAIImgGenResponse {
  data: {
    b64_json: string;
    revised_prompt: string;
  }[];
}

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
  string | undefined, // jobId
  string | undefined, // revised_prompt
  S3FinalizePayload,
  ExpandedImgSpecs
];

export type ImgGenMessageParts =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: { url: string; detail?: "low" | "medium" | "high" };
    };

export interface GrokProviderChatRequestEntity extends ProviderChatRequestEntity {
  management_api_key?: string;
}

export type FilesDbRegistryProps = {
  id: string;
  attachmentId: string;
  expiresAt: Date | null;
  provider: $Enums.Provider;
  keyFingerprint: string;
  userKeyId: string | null;
  providerRef: string;
  isExpired: boolean;
  providerUri: string | null;
  lastCheckedAt: Date | null;
};

export type CreateGrokProviderStoreDocParams = {
  userId: string;
  attachmentId: string;
  storeId: string;
  docRef: string;
  docUri: string;
  storeRef: string;
  filename: string;
  last_indexed_at: Date;
  mimeType: string;
  state: $Enums.ProviderDocState;
  size?: bigint;
};

export interface CreatManyGrokProviderStoreDocSingleton {
  readonly indexedAt: Date;
  readonly lastAccessed: Date;
  readonly provider: $Enums.Provider;
  readonly attachmentId: string;
  readonly storeId: string;
  readonly docRef: string;
  readonly docUri: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly state: $Enums.ProviderDocState;
  readonly size?: bigint;
}

export interface CreateManyGrokProviderStoreDocsProps {
  userId: string;
  storeRef: string;
  totalBytes: bigint;
  data: CreatManyGrokProviderStoreDocSingleton[];
}

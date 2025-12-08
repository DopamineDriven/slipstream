import type { S3FinalizePayload } from "@/types/index.ts";
import type { ExpandedImgSpecs } from "@d0paminedriven/fs";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  CTR,
  ImgMetadataEntity,
  S3Checksum,
  S3StorageClass,
  Unenumerate
} from "@slipstream/types";

export type MaybePromise<T> = T | Promise<T>;

export interface UrlExtWorkupProps {
  id: string;
  compatStatus: $Enums.CompatStatus | null;
  ext: string | null;
  compatExt: string | null;
  cdnUrl: string | null;
  compatCdnUrl: string | null;
  mime: string | null;
  compatMime: string | null;
}

export interface AssetToTmpWorkupProps extends UrlExtWorkupProps {
  userId: string;
  conversationId: string | null;
  messageId: string | null;
  assetType: $Enums.AssetType;
}

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

export type ChunkConfiguration = {
  chars_configuration?: CharsConfiguration;
  tokens_configuration?: TokensConfiguration;
  ast_configuration?: AstConfiguration;
  strip_whitespace: boolean;
  inject_name_into_chunks: boolean;
};

export type GrokEmbeddingModels =
  | "grok-embedding-large"
  | "grok-embedding-beta"
  | "grok-embedding-small";

export type IndexConfiguration = {
  model_name: GrokEmbeddingModels;
};

type MetricSpaceWorkup = "UNKNOWN" | "COSINE" | "EUCLIDEAN" | "INNER_PRODUCT";

export type MetricSpace = `HNSW_METRIC_${MetricSpaceWorkup}`;

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
  created_at: number;
  expires_at: null;
  filename: string;
  id: string;
  object: "file";
  purpose: string;
};

export type ListCollectionsResponse = {
  collections: {
    collection_id: string;
    collection_name: string;
    created_at: string;
    index_configuration: {
      model_name: string;
    };
    chunk_configuration: {
      tokens_configuration: {
        max_chunk_size_tokens: number;
        chunk_overlap_tokens: number;
        encoding_name: string;
      };
      strip_whitespace: boolean;
      inject_name_into_chunks: boolean;
    };
    documents_count: number;
    field_definitions: {
      key: string;
      required: boolean;
      inject_into_chunk: boolean;
      unique: boolean;
      description: string;
    }[];
  }[];
};

export type CreateCollectionResponse = {
  collection_id: string;
  collection_name: string;
  created_at: string;
  index_configuration: {
    model_name: string;
  };
  chunk_configuration: {
    tokens_configuration: {
      max_chunk_size_tokens: number;
      chunk_overlap_tokens: number;
      encoding_name: string;
    };
    strip_whitespace: boolean;
    inject_name_into_chunks: boolean;
  };
  documents_count: number;
  field_definitions: {
    key: string;
    required: boolean;
    inject_into_chunk: boolean;
    unique: boolean;
    description: string;
  }[];
};

export type GetDocumentsByCollectionId = {
  documents: {
    file_metadata: {
      file_id: string;
      name: string;
      size_bytes: string;
      content_type: string;
      created_at: string;
      expires_at: null;
      hash: string;
      upload_status: string;
      processing_status: string;
      file_path: string;
    };
    fields: {
      attachmentId: string;
      conversationId: string;
      messageId: string;
      originalFilename: string;
    };
    status: string;
  }[];
  pagination_token?: string;
};

export type DocumentResSingleton = Unenumerate<
  CTR<GetDocumentsByCollectionId["documents"]>
>;

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

export type ImgGenMessageSingletonProps =
  | {
      role: "user" | "assistant";
      content:
        | string
        | readonly (
            | { type: "text"; text: string }
            | {
                type: "image_url";
                image_url: {
                  url: string;
                  detail?: "low" | "medium" | "high";
                };
              }
          )[];
    }
  | { role: "system"; content: string };

export type ImageGenMessagesProps = readonly ImgGenMessageSingletonProps[];

export type ImgGenMessageParts =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: { url: string; detail?: "low" | "medium" | "high" };
    };

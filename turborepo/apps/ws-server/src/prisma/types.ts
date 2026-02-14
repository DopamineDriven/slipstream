import type { Voyage } from "@/voyage/types.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { XOR } from "@slipstream/types";

export interface CreateUserStoreChunkParams {
  provenanceId: string;
  storeId: string;
  docId: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  startOffset: number;
  endOffset: number;
  hasImages: boolean;
  hasAnnots: boolean;
  pageStartOffset?: number | null;
  pageEndOffset?: number | null;
  schemaVersion?: $Enums.UserStoreSchemaVersion;
}
export interface CreateLocalStoreParams {
  provider: $Enums.Provider;
  userId: string;
  storeName: string;
  createdAt: string | Date;
  lastSyncedAt?: Date | string;
  defaultEmbeddingModel?: Voyage.ModelUnion;
  embeddingDim?: Voyage.EmbeddingDims;
  schemaVersion?: $Enums.LocalStoreSchemaVersion;
  documentsCount?: number;
  totalChunks?: number;
  totalBytes?: bigint;
}
export interface CreateUserStoreParams {
  userId: string;
  storeName: string;
  defaultEmbeddingModel?: Voyage.ModelUnion;
  defaultEmbeddingDim?: Voyage.EmbeddingDims;
  schemaVersion?: $Enums.UserStoreSchemaVersion;
}

export interface CreateUserStoreRT<T extends boolean = false> {
  id: string;
  userId: string;
  storeName: string;
  defaultEmbeddingModel: string;
  defaultEmbeddingDim: number;
  fileCount: number;
  totalBytes: T extends true ? number | null : bigint | null;
  totalChunks: number;
  schemaVersion: $Enums.UserStoreSchemaVersion;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface CreateLocalStoreRT<T extends boolean = boolean> {
  id: string;
  createdAt: Date;
  provider: $Enums.Provider;
  storeName: string;
  userId: string;
  defaultEmbeddingModel: string;
  embeddingDim: number;
  lastSyncedAt: Date | null;
  schemaVersion: $Enums.LocalStoreSchemaVersion;
  totalBytes: T extends true ? number | null : bigint | null;
  totalChunks: number;
  fileCount: number;
  updatedAt: Date;
}

export interface ChunkArrShape {
  id: string;
  errorMessage: string | null;
  state: $Enums.LocalStoreChunkState;
  chunkProvenanceId: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  startOffset: number | null;
  endOffset: number | null;
}

export interface FindManyLocalStoreDocsShape {
  id: string;
  size: number | null;
  filename: string;
  createdAt: Date;
  updatedAt: Date;
  attachmentId: string;
  provider: $Enums.Provider;
  state: $Enums.LocalStoreDocState;
  schemaVersion: $Enums.LocalStoreSchemaVersion;
  errorMessage: string | null;
  storeId: string;
  imageCount: number | null;
  storeName: string;
  provenanceId: string;
  conversationId: string;
  messageId: string;
  modelSelectionReason: string | null;
  indexedAt: Date | null;
  mimeType: string;
  ext: string;
  chunkCount: number;
  tokenCount: number;
  lastAccessed: Date | null;
  embeddingModel: string;
  embeddingDim: number;
  hasVisualMedia: boolean;
  visualMediaHint: $Enums.VisualMediaHint | null;
  pageCount: number | null;
  imagePages: number[] | null;
  annotPages: number[] | null;
  chunks: ChunkArrShape[];
}

export interface UserStoreChunkArrShape {
  id: string;
  errorMessage: string | null;
  state: $Enums.UserStoreChunkState;
  chunkProvenanceId: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  startOffset: number;
  endOffset: number;
  hasImages: boolean;
  hasAnnots: boolean;
  pageStartOffset: number | null;
  pageEndOffset: number | null;
  retryCount: number;
}

export interface FindManyUserStoreDocsShape {
  id: string;
  size: number;
  filename: string;
  createdAt: Date;
  updatedAt: Date;
  attachmentId: string;
  originatingProvider: $Enums.Provider | null;
  originatingModel: string | null;
  originatingUrl: string;
  state: $Enums.UserStoreDocState;
  schemaVersion: $Enums.UserStoreSchemaVersion;
  errorMessage: string | null;
  storeId: string;
  imageCount: number | null;
  provenanceId: string;
  conversationId: string;
  messageId: string;
  modelSelectionReason: string | null;
  indexedAt: Date | null;
  mimeType: string;
  ext: string;
  chunkCount: number;
  tokenCount: number;
  lastAccessed: Date | null;
  embeddingModel: Voyage.ModelUnion;
  embeddingDim: Voyage.EmbeddingDims;
  hasVisualMedia: boolean;
  visualMediaSource: $Enums.VisualMediaSource | null;
  visualMediaContent: $Enums.VisualMediaContent | null;
  pageCount: number | null;
  extractedTextLength: number | null;
  imagePages: number[] | null;
  annotPages: number[] | null;
  chunks: UserStoreChunkArrShape[];
}

export interface CreateGeminiDocParams {
  userId: string;
  attachmentId: string;
  storeId: string;
  docRef: string;
  docUri: string;
  storeRef: string;
  filename: string;
  indexedAt: Date;
  mimeType: string;
  state: $Enums.ProviderDocState;
  size?: bigint;
}

export interface CreateManyGeminiDocsAgg {
  readonly storeId: string;
  readonly attachmentId: string;
  readonly docRef: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly provider: "GEMINI";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastAccessed: string;
  readonly size: number;
  readonly docUri: `https://generativelanguage.googleapis.com/v1beta/${string}`;
  readonly state: "ACTIVE" | "FAILED" | "PENDING" | "PROCESSING";
  readonly indexedAt: string;
}

export type VectorStoreInfoByProviderProps = XOR<
  {
    readonly totalBytes: 0;
    readonly storeRef: undefined;
    readonly dbId: undefined;
    readonly hasStore: false;
    readonly storeName: undefined;
    readonly fileCount: 0;
    readonly provider: $Enums.Provider;
  },
  {
    readonly totalBytes: number;
    readonly storeRef: string;
    readonly dbId: string;
    readonly hasStore: true;
    readonly storeName: string;
    readonly provider: $Enums.Provider;
    readonly fileCount: number;
  }
>;

export interface FindManyProviderStoreDocsAgg {
  id: string;
  size: number | null;
  filename: string;
  createdAt: Date;
  updatedAt: Date;
  attachmentId: string;
  provider: $Enums.Provider;
  state: $Enums.ProviderDocState;
  errorMessage: string | null;
  storeId: string;
  storeRef: string;
  storeName: string;
  docRef: string;
  docUri: string | null;
  indexedAt: Date | null;
  mimeType: string;
  lastAccessed: Date | null;
}

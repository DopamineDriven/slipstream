import type { Voyage } from "@/voyage/types.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";

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

export interface CreateLocalStoreRT<T extends boolean = boolean> {
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
  id: string;
  fileCount: number;
  updatedAt: Date;
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
}

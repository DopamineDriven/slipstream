import type { PageAnnotation, PageBox } from "@d0paminedriven/pdfdown";
import type {
  searchUserStoreChunksByStore,
  searchUserStoreChunksHybrid
} from "@slipstream/db/sql-node";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { Rm } from "@slipstream/types";

export interface CdnCacheEntry {
  fullUrl: string;
  filename: string;
  attachmentId: string;
  userId: string;
  ext: string;
  mime: string;
  userStoreDocId: string | null;
}

export interface ResolvedAnnotation {
  subtype: $Enums.AnnotSubtype;
  uri: string;
  rect: [number, number, number, number];
  startOffset: number;
  endOffset: number;
  pageNumber: number;
  isCdnLink: boolean;
  linkedDocId: string | null;
  attachmentId: string | null;
}

export interface PageDimensions {
  defaultDims: { width: number; height: number };
  overrides: Map<number, { width: number; height: number }>;
}

export interface PageOffsetEntry {
  page: number;
  globalStart: number;
  globalEnd: number;
  bodyLength: number;
}

export interface AnnotsEnhanced extends Rm<PageAnnotation, "uri"> {
  index: number;

  uri: string;
  cdnMatch: boolean;
  subtype: $Enums.AnnotSubtype;
}

export interface AttScopedAnnots {
  counts: number;
  data: Map<number, AnnotsEnhanced>;
}

export interface OffsetCache {
  page: number;
  body: string;
  offsets: [number, number];
  hasImages: boolean;
  hasAnnots: boolean;
}

export interface AttScopedImgsCache {
  count: number;
  page: number;
  data: Map<number, AttScopedImg>;
}

export interface AttScopedPageBoxCache extends PageBox {
  coverage: number;
}

export type AttScopedPageBox<T extends boolean = boolean> = {
  isUniform: T;
  count: T extends true ? 1 : number;
  data: T extends false
    ? AttScopedPageBoxCache[]
    : readonly [AttScopedPageBoxCache];
};

export interface AttScopedImg {
  index: number;
  height: number;
  width: number;
  aspectRatio: number;
  tmpFileName: string;
  absTmpPath: string;
  page: number;
  /**
   *  number gets wrecked by nodes low threshold for handling large Ints. BigInt gets messy with possible JSONification
   * size useful for preliminary partitioning of input fields when staging for tokenization checks with voyage
   **/
  size: string;
}

export interface UserStoreSearchParams {
  userId: string;
  query: string;
  limit?: number;
  threshold?: number;
  storeName?: string;
  filename?: string;
}

export type UserStoreSearchResult = searchUserStoreChunksByStore.Result;

/** Raw row from the hybrid SQL query — includes signal, rank, and overlap flag */
export type HybridChunkHit = searchUserStoreChunksHybrid.Result;

/** Discriminant for partitioned search results */
export type HybridSearchSignal = "semantic" | "fulltext";

/** Input params for hybrid search — extends base with optional searchTerms */
export interface UserStoreHybridSearchParams extends UserStoreSearchParams {
  searchTerms?: string;
}

/** Partitioned result returned to providers when search_terms is provided */
export interface PartitionedSearchResult {
  readonly semantic: readonly HybridChunkHit[];
  readonly fulltext: readonly HybridChunkHit[];
  readonly overlap: {
    readonly chunkIds: readonly string[];
    readonly jaccardSimilarity: number;
  };
  readonly meta: {
    readonly searchTerms: string | null;
    readonly semanticThreshold: number;
    readonly semanticCount: number;
    readonly fulltextCount: number;
  };
}

/**
 * checking for gtOne (greater than one image in the pages image indexes)
 *
 */
export type AttScopedImgCache<T extends boolean = boolean> = T extends true
  ? readonly [AttScopedImg]
  : AttScopedImg[];

export type AttScopedImages<T extends boolean = boolean> = {
  /**
   * instances of more than one image index being contained within the same page
   */
  exactlyOne: T;
  count: T extends true ? 1 : number;
  page: number;
  imageIndexes: T extends true ? readonly [0] : number[];
  // optionally we could use image index as a third map layer-> Map<number, AttScopedImg>->so the overall view would be
  // Map<string, Map<number,{page: number; exactlyOne: T; count: T extends true ? 1 : number; imageIndexes: T extends true ? readonly [0] : number[]; img: Map<number, AttScopedImageCache>}>>
  img: AttScopedImgCache<T>;
};


export interface AttScopedPageBoxCache extends PageBox {
  coverage: number;
}

export interface UserStoreChunkDraft {
  page: number;
  text: string;
  startOffset: number;
  endOffset: number;
  hasImages: boolean;
  hasAnnots: boolean;
  images: AttScopedImg[];
}

export type ChunkBudgetAdjustReason =
  | "RESIZED"
  | "TEXT_ONLY_FALLBACK"
  | "TEXT_RECHUNK"
  | "IMAGE_RECHUNK";

export interface UserStoreChunkReady extends UserStoreChunkDraft {
  tokenCount: number;
  budgetAdjustReason: ChunkBudgetAdjustReason | null;
}

export interface ChunkWithRecord {
  chunk: UserStoreChunkReady;
  chunkIndex: number;
  record: { id: string };
}

export type UserStoreIndexSkipReason =
  | "SKIP_NON_DOCUMENT"
  | "WAIT_COMPAT_ACTIVE"
  | "SKIP_COMPAT_FAILED"
  | "SKIP_NON_PDF"
  | "SKIP_MISSING_CONTEXT"
  | "SKIP_MISSING_SOURCE_URL";

export type UserStoreIndexSkip = {
  readonly ok: false;
  readonly reason: UserStoreIndexSkipReason;
  readonly attachmentId: string;
  readonly compatStatus?: $Enums.CompatStatus;
  readonly ext?: string;
};

export type UserStoreIndexSuccess = {
  readonly ok: true;
  readonly attachmentId: string;
  readonly storeId: string;
  readonly docId: string;
  readonly state: $Enums.UserStoreDocState;
  readonly chunkCount: number;
  readonly readyCount: number;
  readonly errorCount: number;
  readonly tokenCount: number;
};

export type UserStoreIndexResult = UserStoreIndexSuccess | UserStoreIndexSkip;

export interface FileSearchToolInput<T extends string | readonly [string, ...string[]] = string> {
  query: T;
  max_results?: number;
  filename?: string;
  search_terms?: string;
}

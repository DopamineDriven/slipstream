import type { PageAnnotation, PageBox } from "@d0paminedriven/pdfdown";
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

/**
 * checking for gtOne (greater than one image in the pages image indexes)
 *
 */
export type AttScopedImgCache<T extends boolean = boolean> = T extends true
  ? AttScopedImg[]
  : readonly [AttScopedImg];

export type AttScopedImages<T extends boolean = boolean> = {
  /**
   * instances of more than one image index being contained within the same page
   */
  exactlyOne: T;
  count: T extends false ? number : 1;
  page: number;
  imageIndexes: T extends true ? readonly [0] : number[];
  img: AttScopedImgCache<T>;
};

export type ImageCacheee<T extends boolean = boolean> = Map<
  number,
  AttScopedImages<T>
>;
export type AttScopedImage<
  Outer extends boolean = boolean,
  Inner extends boolean = boolean
> = {
  hasImages: Outer;
  pages?: Outer extends true ? number[] : undefined;
  counts: Outer extends true ? number : 0;
  images: Outer extends true ? AttScopedImages<Inner> : undefined;
};

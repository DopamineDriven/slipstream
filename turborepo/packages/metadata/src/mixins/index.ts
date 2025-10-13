// extract-mixins.ts
import type {
  Constructor,
  ExpandedDocSpecs,
  ExpandedImgSpecs
} from "@/types/index.ts";
import { DocMetadataExtractor } from "@/docs/index.ts";
import { ImgMetadataExtractor } from "@/images/index.ts";

export function create<Type>(c: new () => Type): Type {
  return new c();
}
export function createInstance<A extends object>(c: new () => A): A {
  return new c();
}

export interface ExtractorOptions {
  img?: ImgMetadataExtractor;
  docs?: DocMetadataExtractor;
}

/**
 * ImgMixin
 * - instance tries opts.img -> sharedImg -> new ImgMetadataExtractor()
 * - exposes prototype method getImageSpecsWorkup
 */
export function ImgMixin<TBase extends Constructor>(Base: TBase) {
  return class ImgMixed extends Base {
    public img: ImgMetadataExtractor;
    // optional shared instance to avoid per-instance allocations
    static sharedImg?: ImgMetadataExtractor;

    constructor(...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      super(...args);
      const maybeOpts = args[0] as ExtractorOptions | undefined;
      this.img =
        maybeOpts?.img ??
        (this.constructor as typeof ImgMixed).sharedImg ??
        new ImgMetadataExtractor();
    }

    public getImageSpecsWorkup(buffer: Buffer, size = 16384): ExpandedImgSpecs {
      return this.img.getImageSpecsWorkup(buffer, size);
    }

    // helper to set a shared extractor (nice for init/bootstrap)
    static setSharedImg(ex: ImgMetadataExtractor) {
      (this as typeof ImgMixed).sharedImg = ex;
    }
  };
}

/**
 * DocMixin (same pattern)
 */
export function DocMixin<TBase extends Constructor>(Base: TBase) {
  return class DocMixed extends Base {
    public docs: DocMetadataExtractor;
    static sharedDocs?: DocMetadataExtractor;

    constructor(...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      super(...args);
      const maybeOpts = args[0] as ExtractorOptions | undefined;
      this.docs =
        maybeOpts?.docs ??
        (this.constructor as typeof DocMixed).sharedDocs ??
        new DocMetadataExtractor();
    }

    public getDocumentSpecsWorkup(
      buffer: Buffer,
      contentType = "application/pdf"
    ): ExpandedDocSpecs {
      return this.docs.getDocumentSpecsWorkup(buffer, contentType);
    }

    static setSharedDocs(ex: DocMetadataExtractor) {
      (this as typeof DocMixed).sharedDocs = ex;
    }
  };
}

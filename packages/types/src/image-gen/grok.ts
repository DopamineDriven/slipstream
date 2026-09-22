import type {
  GrokImgGenFacilitatingModels,
  GrokImgGenModels,
  GrokModelIdUnion
} from "@/models.ts";
import type { DX, UTR } from "@/utils.ts";

export type GrokImagineARUnion =
  | "1:1"
  | "16:9"
  | "9:16"
  | "4:3"
  | "3:4"
  | "3:2"
  | "2:3"
  | "2:1"
  | "1:2"
  | "19.5:9"
  | "9:19.5"
  | "20:9"
  | "9:20"
  | "auto";

export type GrokImgCapableModels =
  GrokImgGenFacilitatingModels | GrokImgGenModels;
  
export type GrokImagine2ARUnion = GrokImagineARUnion | "21:9" | "5:2";

export type GrokImagineQualityUnion = "1k" | "2k";

export type GrokResolutionBase = "1k" | "2k";

export type GrokQualityAnd2Resolution = GrokResolutionBase | "1.5k";

export type GrokImagine2QualityUnion = GrokImagineQualityUnion | "1.5k";
export type GrokImagineImgModelUnion = GrokImgGenModels;

export type GrokResolutionWorkup = DX<
  Record<"grok-imagine-image", GrokResolutionBase> &
    Record<
      Exclude<GrokImgCapableModels, "grok-imagine-image">,
      GrokQualityAnd2Resolution
    > &
    Record<Exclude<GrokModelIdUnion, GrokImgCapableModels>, undefined>
>;

export type GrokModelAspectRatioWorkup = DX<
  Record<
    Exclude<
      GrokImgCapableModels,
      "grok-imagine-image-2.0" | GrokImgGenFacilitatingModels
    >,
    GrokImagineARUnion
  > &
    Record<
      "grok-imagine-image-2.0" | GrokImgGenFacilitatingModels,
      GrokImagine2ARUnion
    > &
    Record<Exclude<GrokModelIdUnion, GrokImgCapableModels>, undefined>
>;

export type GrokModelAspectRatio = {
  [P in keyof GrokModelAspectRatioWorkup]?: GrokModelAspectRatioWorkup[P];
};

export type GrokAspectRatioAndResolutionOps = {
  quality: GrokResolutionWorkup;
  size: GrokModelAspectRatioWorkup;
};

export interface GrokImagineImageGenOpts<
  T extends GrokImgCapableModels = "grok-imagine-image-2.0"
> {
  model: T extends GrokImgGenFacilitatingModels ? "grok-imagine-image-2.0" : T;
  /**
   *
   * Number of images to be generated
   *
   *  default: 1,
   *  max: 10
   */
  n?: number;

  prompt: string;

  /**
   * Aspect ratio of the generated image. Can be 1:1, 3:4, 4:3, 9:16, 16:9, 2:3, 3:2, 9:19.5, 19.5:9, 9:20, 20:9, 1:2, 2:1, or auto. Defaults to auto for automatically selecting the best ratio for the prompt. Only supported by grok-imagine models.
   */
  aspect_ratio?: T extends
    "grok-imagine-image-2.0" | GrokImgGenFacilitatingModels
    ? GrokImagine2ARUnion
    : GrokImagineARUnion;

  /**
   * Resolution of the generated image. Defaults to 1k. Only supported by grok-imagine models.
   * grok-imagine-image does not support resoilution of 1.5k
   */
  resolution?: T extends "grok-imagine-image"
    ? GrokResolutionBase
    : GrokQualityAnd2Resolution;
  /**
   * default: `"url"`
   *
   * Response format to return the image in. Can be `"url" | "b64_json"`.
   *
   * If `"b64_json"` is specified, the image will be returned as a base64-encoded string instead of a url to the generated image file
   */
  response_format?: string;

  /**
   * A unique identifier representing the end-user, which can help xAI to monitor and detect abuse.
   */
  user?: string;

  respect_moderation?: string;
}

export interface GrokImagineImageGenOptsExtended extends GrokImagineImageGenOpts<
  "grok-imagine-image-2.0" | "grok-4.6" | "grok-4.7"
> {
  /**
   * Control generation quality with the optional quality parameter. Allowed values are low, medium, and auto.
   * When omitted, the default is auto, which lets the service choose the quality for each request.
   * Auto currently uses low for image generation and medium for image editing.
   * Images are billed at the quality they are served at (see Pricing).
   * Pass low or medium to pin a specific quality.
   * The parameter is only supported for grok-imagine-image-2.0.
   */
  quality?: "low" | "medium" | "auto";
}

export type GrokModelOptsUnion =
  | GrokImagineImageGenOpts<"grok-imagine-image-quality">
  | GrokImagineImageGenOpts<"grok-imagine-image">
  | GrokImagineImageGenOptsExtended;

export type GrokModelOptsRecord = UTR<GrokModelOptsUnion, "model", false>;

export type GrokImgGenUnionOpts<
  T extends GrokImgCapableModels = "grok-imagine-image-2.0"
> = T extends GrokImgGenFacilitatingModels
  ? GrokImagineImageGenOptsExtended
  : T extends "grok-imagine-image-2.0"
    ? GrokImagineImageGenOptsExtended
    : T extends "grok-imagine-image-quality"
      ? GrokImagineImageGenOpts<"grok-imagine-image-quality">
      : T extends "grok-imagine-image"
        ? GrokImagineImageGenOpts<"grok-imagine-image">
        : never;

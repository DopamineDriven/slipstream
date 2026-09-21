import type { GrokImgGenModels, GrokModelIdUnion } from "@/models.ts";
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

export type GrokImagine2ARUnion = GrokImagineARUnion | "21:9" | "5:2";

export type GrokImagineQualityUnion = "1k" | "2k";

export type GrokImagine2QualityUnion = GrokImagineQualityUnion | "1.5k";
export type GrokImagineImgModelUnion = GrokImgGenModels;

export type GrokModelAspectRatioWorkup = DX<
  Record<
    Exclude<GrokImgGenModels, "grok-imagine-image-2.0">,
    GrokImagineARUnion
  > &
    Record<"grok-imagine-image-2.0", GrokImagine2ARUnion> &
    Record<Exclude<GrokModelIdUnion, GrokImgGenModels>, undefined>
>;

export type GrokModelAspectRatio = {
  [P in keyof GrokModelAspectRatioWorkup]?: GrokModelAspectRatioWorkup[P];
};

export interface GrokImagineImageGenOpts<T extends GrokImagineImgModelUnion> {
  model: T;
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
  aspect_ratio?: T extends "grok-imagine-image-2.0"
    ? GrokImagine2ARUnion
    : GrokImagineARUnion;

  /**
   * Resolution of the generated image. Defaults to 1k. Only supported by grok-imagine models.
   */
  resolution?: T extends "grok-imagine-image-2.0"
    ? GrokImagine2QualityUnion
    : GrokImagineQualityUnion;
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

export interface GrokImagineImageGenOptsExtended extends GrokImagineImageGenOpts<"grok-imagine-image-2.0"> {
  quality?: "low" | "medium" | "auto";
}

export type GrokModelOptsUnion =
  | GrokImagineImageGenOpts<"grok-imagine-image-quality">
  | GrokImagineImageGenOpts<"grok-imagine-image">
  | GrokImagineImageGenOptsExtended;

export type GrokModelOptsRecord = UTR<GrokModelOptsUnion, "model", false>;

export type GrokImgGenUnionOpts =
  GrokImagineImageGenOpts<GrokImagineImgModelUnion>;

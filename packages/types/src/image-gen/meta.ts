import type { BaseOpenAISize } from "@/image-gen/openai.ts";
import type { MetaImgGenModels, MetaModelIdUnion } from "@/models.ts";
import type { DX } from "@/utils.ts";

export type MetaImgSize = BaseOpenAISize;

export type MetaModelImgARWorkup = DX<
  Record<MetaImgGenModels, MetaImgSize> &
    Record<Exclude<MetaModelIdUnion, MetaImgGenModels>, undefined>
>;

export type ToolEnablementProps = {
  /**
   * default: false
   */
  enable_image_search?: boolean;
  /**
   * default: false
   */
  enable_web_search?: boolean;
  /**
   * default: false
   */
  enable_shell?: boolean;
};

export type MetaImgSizeMap = {
  [P in keyof MetaModelImgARWorkup]?: MetaModelImgARWorkup[P];
};

export type MetaImgGenOpts = {
  model: MetaImgGenModels;
  /**
   * Number of edited images to generate. Range: 1-10. Defaults to 1. (minimum: 1, maximum: 10, default: 1)
   */
  n?: number;

  prompt: string;
  /**
   * Requested image shape as width x height (e.g., '1024x1024'). The value is converted into an aspect ratio only; the image is produced at the generator's own fixed output resolution, so the returned pixel dimensions stay constant regardless of the numbers supplied — only the aspect ratio changes.
   */
  size?: MetaImgSizeMap["muse-image-1.0"];
  /**
   * Format for returned images. One of: url, b64_json. Defaults to b64_json. (default: b64_json)
   */
  response_format?: "url" | "b64_json";
  /**
   *
   * How much reasoning the image generator applies before producing the image. One of low or high. low returns after a single generation pass (no self-refinement); high (the default) lets the generator iteratively refine. (default: high)
   */
  reasoning_strength?: "low" | "high";
  /**
   * Requested file type for the generated images. One of png, jpeg, or webp. Defaults to webp when omitted; any other value is rejected.
   */
  output_format?: "png" | "webp" | "jpeg";
  /**
   *
   * Moderation level for the safety pipeline. One of auto, low, or none. Supported only on models that accept this parameter; other models reject it with a 400. An unrecognized value is rejected with a 400. none additionally requires per-application access.
   */
  moderation?: "auto" | "low" | "none";

  /**
   * Number of partial images to generate during streaming. Range: 0-3. Accepted but ignored. (minimum: 0, maximum: 3, default: 0)
   */
  partial_images?: number;
  /**
   * default: false
   */
  stream?: boolean;
  /**
   * A stable end-user identifier that helps detect and mitigate abuse. Use it on the images endpoints; on the Responses and Chat Completions endpoints, use safety_identifier instead.
   */
  user?: string;
  /**
   * Per-tool controls for the image generator's planner. Omit to keep the default (all tools available).
   */
  tool_enablement?: ToolEnablementProps;
  /**
   * Image to edit. PNG format. (binary)
   */
  image?: string;
};

import type { ImgGenStage } from "@/events-images.ts";
import type { UserMetadata } from "@/events-workup.ts";
import type {
  AllImgGenFacilitatingModelsUnion,
  AllImgGenModelsUnion,
  ImageGenProviders
} from "@/models.ts";
import type { UTR } from "@/utils.ts";

/**
 * Enhanced image generation request
 */
export type ImageGenRequest = {
  type: "image_gen_request";
  conversationId: string;
  prompt: string;
  provider: ImageGenProviders;
  model?: AllImgGenFacilitatingModelsUnion | AllImgGenModelsUnion;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  hasProviderConfigured?: boolean;
  isDefaultProvider?: boolean;
  batchId?: string;
  metadata?: UserMetadata;
  /**
   * gpt-image-2, gpt-image-1.5 & gpt-image-1 only
   *
   * values include "high" | "low" | null
   */
  input_fidelity?: string;
  /**
   * gpt-image-2, gpt-image-1.5, gpt-image-1, and gpt-image-1-mini only
   *
   * values include "low" | "auto"
   */
  moderation?: string;
  /**
   * gpt-image-2, gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
   *
   * n=1 (default),
   * n=10 (max)
   *
   * gemini-3.1-flash-image-preview (Nano Banana 2), gemini-3-pro-image-preview (Nano Banana Pro), and gemini-2.5-flash-image (Nano Banana):
   *
   * n=1 (default),
   * n=10 (max)
   *
   *
   * grok-imagine-image (uncertain as to how xAI caps grok-imagine-image-quality)
   *
   * n=1 (default),
   * n=10 (max)
   */
  n?: number;
  negativePrompt?: string;
  /**
   * gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
   *
   * n=0 (default),
   * n=3 (max)
   *
   * *streaming must be set to **true***
   */
  output_partial_images?: number;
  /**
   * gpt-image-1, gpt-image-1-mini:
   *
   * "png" (default);
   * "png" | "jpeg" | "webp"
   *
   *  imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
   *
   * "png" (default);
   * "png" | "jpeg"
   */
  output_format?: string;
  /**
   *
   * gpt-image-2, gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
   *
   * output must be of type jpeg or webp
   *
   * Range: 0-100. Default: 100
   */
  output_compression?: number;
  /**
   * gpt-image-2, gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
   *
   * "auto" (default); "transparent" | "opaque" | "auto"
   *
   * output format must be "png" | "webp"
   */
  output_background?: "transparent" | "opaque" | "auto";
  /**
   *  gpt-image-2, gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
   *
   * "low" | "medium" | "high" | "auto"
   *
   *
   * gpt-image-2.5-sunburst, gpt-image-2.5-flare
   *
   * "low" | "medium" | "high" | "xhigh" | "max" | "auto"
   *
   */
  output_quality: string;
  /**
   *  gpt-image-2, gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
   *
   * "auto" (default); "1024x1024" | "1536x1024" | "1024x1536" | "auto"
   *
   * gemini-2.5-flash-image:
   *
   * "1:1" (default); "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9"
   */
  output_size?: string;
  /**
   * **Imagen 3 & 4 models only**
   *
   *  imagen-4.0-generate-001,
   * imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001
   *
   * "dont_allow": Disallow the inclusion of people or faces in images.
   *
   * "allow_adult": Allow generation of adults only.
   *
   * "allow_all": Allow generation of people of all ages.
   *
   * ---
   *
   * "allow_adult" (default)
   */
  personGeneration?: string;

  seed?: number;
};

/**
 * Enhanced generation response
 */
export type ImageGenResponse = {
  type: "image_gen_response";
  done: boolean;
  userId: string;
  temperature?: number;
  topP?: number;
  systemPrompt?: string;
  conversationId: string;
  chunk?: string;
  thinkingChunk?: string;
  thinkingDuration?: string;
  usage?: number;
  title?: string;
  provider: string;
  duration: number;
  model: string;
  requested_count: number;
  actual_count: number;
  partialImages?: {
    cdnUrl: string;
    width: number;
    height: number;
    mime: string;
    revised_prompt?: string;
  }[];
  images: {
    cdnUrl: string;
    width: number;
    height: number;
    mime: string;
    revised_prompt?: string;
  }[];
  messageId?: string;
  success: boolean;
  error?: string;
};

export type ImageGenError = {
  type: "image_gen_error";
  done: boolean;
  userId: string;
  temperature?: number;
  systemPrompt?: string;
  prompt?: string;
  topP?: number;
  requested_count: number;
  duration: number;
  title?: string;
  provider: string;
  model: string;
  stop_reason?: unknown;
  conversationId: string;
  messageId?: string;
  success: false;
  error: string;
};

/**
 * Generation progress updates
 */
export type ImageGenProgress = {
  type: "image_gen_progress";
  done: boolean;
  userId: string;
  temperature?: number;
  topP?: number;
  conversationId: string;
  model: string;
  chunk?: string;
  thinkingChunk?: string;
  thinkingDuration?: string;
  title?: string;
  provider: string;
  duration: number;
  partial_image?: {
    cdnUrl: string;
    width: number;
    height: number;
    mime: string;
    revised_prompt?: string;
  }[];
  images?: {
    cdnUrl: string;
    width: number;
    height: number;
    mime: string;
    revised_prompt?: string;
  }[];
  requested_count: number;
  systemPrompt?: string;
  /**
   * 0-100 (??????? how do we know the progress if provider/user-network dependent?)
   */
  progress: number;
  /**
   * "queued" | "processing" | "persisting" | "finalizing" | "refusal" | "aborted"
   */
  stage?: ImgGenStage;
  /**
   *  seconds remaining (how will we know the seconds remaining if provider/user-network dependent)?
   */
  eta?: number;
};

export type ImageGenEventUnion =
  ImageGenError | ImageGenProgress | ImageGenRequest | ImageGenResponse;

export type ImageGenEventRecord<T extends boolean = false> = UTR<
  ImageGenEventUnion,
  "type",
  T
>;

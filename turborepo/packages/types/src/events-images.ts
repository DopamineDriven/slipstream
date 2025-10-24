import type {
  GeminiImgGenModels,
  GrokImgGenModels,
  OpenAIImgGenFacilitatingModels,
  OpenAIImgGenModels,
  OpenAiModelIdUnion
} from "@/models.ts";

export type OpenAIImgCapableModels =
  | OpenAIImgGenFacilitatingModels
  | OpenAIImgGenModels;

export type AIChatRequestImgGenFields = {
  pureImgGenModel?: boolean;
  /**
   * gpt-image-1 only
   *
   * values include "high" | "low" | null
   */
  input_fidelity?: string;
  /**
   * gpt-image-1 & gpt-image-1-mini only
   *
   * values include "low" | "auto"
   */
  moderation?: string;
  /**
   * gpt-image-1, gpt-image-1-mini, gemini-2.5-flash-image, dall-e-2, grok-2-image-1212:
   *
   * n=1 (default),
   * n=10 (max)
   *
   * dall-e-3:
   *
   * n=1 (default),
   * n=1 (max)
   *
   * imagen-3.0-generate-002, imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
   *
   * n=4 (default),
   * n=1 (min)
   *
   */
  n?: number;
  /**
   * **imagen-3.0-generate-002, imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, & imagen-4.0-fast-generate-001 only**
   *
   * A negative prompt.
   * What you *don't* want to see in the image.
   *
   */
  negativePrompt?: string;
  /**
   * gpt-image-1 & gpt-image-1-mini only:
   *
   * n=0 (default),
   * n=3 (max)
   *
   * streaming must be set to ***true***
   */
  output_partial_images?: number;
  /**
   *
   * **imagen-3.0-generate-002, imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, & imagen-4.0-fast-generate-001**
   *
   * "image/png" (default) | "image/jpeg"
   *
   *
   * "jpg" | "webp" | "png" (default)
   */
  output_format?: string;
  /**
   *
   * gpt-image-1, gpt-image-1-mini:
   *
   * output must be of type jpeg or webp
   *
   * Range: 0-100. Default: 100
   *
   * imagen-3.0-generate-002, imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
   *
   * Only applies if mimeType is "image/jpeg",
   * Range: 0-100. Default: 75
   */
  output_compression?: number;
  /**
   * gpt-image-1, gpt-image-1-mini:
   *
   * "auto" (default); "transparent" | "opaque" | "auto"
   *
   * output format must be "png" | "webp"
   */
  output_background?: "transparent" | "opaque" | "auto";
  /**
   *  gpt-image-1, gpt-image-1-mini:
   *
   * "auto" (default); "low" | "medium" | "high" | "auto"
   *
   * dall-e-3:
   *
   * "auto" (default); "standard" | "hd" | "auto"
   *
   * dall-e-2:
   *
   * "auto" (default); "standard" | "auto"
   *
   * imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
   *
   * "1K" (default); "1K" | "2K"
   */
  output_quality?: string;
  /**
   *  gpt-image-1, gpt-image-1-mini:
   *
   * "auto" (default); "1024x1024" | "1536x1024" | "1024x1536" | "auto"
   *
   * dall-e-3:
   *
   * "auto" (default); "1024x1024" | "1792x1024" | "1024x1792" | "auto"
   *
   * dall-e-2:
   *
   * "auto" (default); "1024x1024" | "256x256" | "512x512" | "auto"
   *
   * imagen-3.0-generate-002, imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
   *
   * "1:1"="1024x1024" (default) | "9:16"="768x1344" | "16:9"="1344x768" | "3:4"="864x1184" | "4:3"="1184x864"
   *
   * gemini-2.5-flash-image:
   *
   * "1:1"="1024x1024" (default) | "2:3"="832x1248" | "3:2"="1248x832" | "3:4"="864x1184" | "4:3"="1184x864" | "4:5"="896x1152" | "5:4"="1152x896" | "9:16"="768x1344" | "16:9"="1344x768" | "21:9"="1536x672"
   *
   */
  output_size?: string;
  /**
   * **Imagen 3 & 4 models only**
   *
   * "allow_adult" (default) | "dont_allow" | "allow_all"
   */
  personGeneration?: string;
  /**
   * **dall-e-3 only**
   *
   * "vivid" (default) | "natural"
   */
  style?: string;
  /**
   * **dall-e-2, dall-e-3, and grok-2-image-1212 only**
   *
   * "url" (default) | "b64_json"
   */
  response_format?: "url" | "b64_json";

  /**
   * **gpt-image-1 and gpt-image-1-mini only**
   *
   * Optional mask for inpainting. Contains `image_url` (string, optional) and
   * `file_id` (string, optional).
   */
  input_image_mask?: {
    /**
     * File ID for the mask image.
     */
    file_id?: string;
    /**
     * Base64-encoded URL or Image URL mask.
     */
    image_url?: string;
  };

  /**
   *
   * **imagen-3.0-generate-002, imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001 only**
   *
   * A seed value for reproducible results.
   * 0 for random.
   */
  seed?: number;

  /**
   *
   * **imagen-3.0-generate-002, imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001 only**
   *
   * Whether to automatically enhance the prompt.
   * (Available on Imagen 4 and 3.0-002)
   * Default: true
   */
  enhancePrompt?: boolean;
};

export type AIChatResponseImgGenFields = {
  outputSize?: string;
  outputQuality?: string;
  outputCompression?: number;
  outputBackground?: string;
  outputWidth?: number;
  outputHeight?: number;
  outputAspectRatio?: number;
  size?: number;
  requestedCount?: number;
  actualCount?: number;
  outputFormat?: string;
  outputMime?: string;
  duration?: number;
  seed?: number;
  revisedPrompt?: string;
  partialImagesRequested?: number;
  partialImagesActual?: number;
  partialImages?: {
    index?: number;
    cdnUrl: string;
    width: number;
    height: number;
    mime: string;
  }[];
  images?: {
    cdnUrl: string;
    width: number;
    height: number;
    mime: string;
    revisedPrompt?: string;
  }[];
};

/**
 * --- Image Handling ---
 */

/**
 * OpenAI Image Size & Quality Options
 *
 * Note: gpt-image-1-mini has the same available options as gpt-image-1
 */
export type OpenAISizeQualityOpts = {
  quality: {
    "dall-e-3": "standard" | "hd" | "auto";
    "dall-e-2": "standard" | "auto";
    "gpt-image-1": "low" | "medium" | "high" | "auto";
    "gpt-image-1-mini": "low" | "medium" | "high" | "auto";
  };
  size: {
    "dall-e-2": "1024x1024" | "256x256" | "512x512" | "auto";
    "dall-e-3": "1024x1024" | "1792x1024" | "1024x1792" | "auto";
    "gpt-image-1": "1024x1024" | "1536x1024" | "1024x1536" | "auto";
    "gpt-image-1-mini": "1024x1024" | "1536x1024" | "1024x1536" | "auto";
  };
};
/**
 * Shared OpenAI Image Options
 *
 * Note: gpt-image-1-mini has the same available options as gpt-image-1
 */
export interface SharedOpenAIImageOpts<T extends OpenAIImgGenModels> {
  model: T;
  /**
   * **dall-e-2**
   *
   * max: 1000 chars
   *
   * **dall-e-3**
   *
   * max: 4000 chars
   *
   * **gpt-image-1**
   *
   * max: 32000 chars
   */
  text: string;
  /**
   *
   * **dall-e-2 gpt-image-1 & gpt-image-1-mini**
   *
   *  default: 1,
   *  max: 10
   *
   * **dall-e-3**
   *
   * default: 1,
   *  max: 1
   */
  n?: number;
  /**
   * default: "auto"
   */
  quality?: OpenAISizeQualityOpts["quality"][T];
  /**
   * default: "auto"
   */
  size?: OpenAISizeQualityOpts["size"][T];
  /**
   * A unique identifier representing the end-user; can help OpenAI to monitor and detect abuse
   */
  user?: string;
}

export interface Dalle2Opts extends SharedOpenAIImageOpts<"dall-e-2"> {
  /**
   * default: "url"
   */
  response_format?: "url" | "b64_json";
}

export interface Dalle3Opts extends SharedOpenAIImageOpts<"dall-e-3"> {
  /**
   * default: "url"
   */
  response_format?: "url" | "b64_json";
  /**
   * For `dall-e-3` only, the revised prompt that was used to generate the image.
   */
  revised_prompt?: string;
  /**
   * **dall-e-3 only**
   *
   * default: "vivid"
   */
  style?: "natural" | "vivid";
}

export interface GptImage1Opts
  extends SharedOpenAIImageOpts<"gpt-image-1" | "gpt-image-1-mini"> {
  /**
   *
   * **Only supported for `gpt-image-1`. Unsupported for `gpt-image-1-mini`**
   *
   * Control how much effort the model will exert to match the style and features,
   * especially facial features, of input images. Supports `high` and
   * `low`. Defaults to `low`.
   */
  input_fidelity?: "high" | "low" | null;

  /**
   * Optional mask for inpainting. Contains `image_url` (string, optional) and
   * `file_id` (string, optional).
   */
  input_image_mask?: {
    /**
     * File ID for the mask image.
     */
    file_id?: string;
    /**
     * Base64-encoded mask image.
     */
    image_url?: string;
  };
  /**
   *
   * default: 100
   *
   * output must be of type jpeg or webp
   *
   */
  output_compression?: number;
  /**
   *
   * default: "png"
   */
  output_format?: "png" | "webp" | "jpeg";
  /**
   *
   * default: "auto"
   */
  moderation?: "auto" | "low";
  /**
   *
   * default: "auto"
   *
   * output format must be "png" | "webp"
   */
  background?: "transparent" | "opaque" | "auto";
  /**
   * default: false
   */
  streaming?: boolean;
  /**
   * Requires **streaming** to be **true**
   *
   * default: 0,
   * max: 3
   */
  partial_images?: number;
}

export type OpenAIImageGenOpts = Dalle3Opts | Dalle2Opts | GptImage1Opts;

/**
 * Parameters for Google's Imagen 3 & 4 models
 * (e.g., imagen-3.0-generate-002, imagen-4.0-generate-001,
 * imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001)
 */
export type ImagenOptions = {
  model: Exclude<GeminiImgGenModels, "gemini-2.5-flash-image">;
  /**
   * The text prompt describing the image.
   */
  prompt: string;
  /**
   *  The number of images to generate, from 1 to 4 (inclusive). The default is 4.
   */
  numberOfImages?: number;
  /**
   *
   * "dont_allow": Disallow the inclusion of people or faces in images.
   * "allow_adult": Allow generation of adults only.
   * "allow_all": Allow generation of people of all ages.
   *
   * "allow_adult" (default)
   */
  personGeneration: "dont_allow" | "allow_adult" | "allow_all";
  /**
   * A negative prompt.
   * What you *don't* want to see in the image.
   */
  negativePrompt?: string;

  /**
   * The aspect ratio of the generated image.
   * Default: "1:1"
   *
   * Supported values:
   * "1:1", "9:16", "16:9", "3:4", "4:3"
   */
  aspectRatio?: "1:1" | "9:16" | "16:9" | "3:4" | "4:3";

  /**
   * The output resolution. Only available for Imagen 4.
   * Default: "1K"
   */
  sampleImageSize?: "1K" | "2K";

  /**
   * A seed value for reproducible results.
   * 0 for random.
   */
  seed?: number;

  /**
   * Whether to automatically enhance the prompt.
   * (Available on Imagen 4 and 3.0-002)
   * Default: true
   */
  enhancePrompt?: boolean;

  /**
   * Output format configuration.
   */
  outputOptions?: {
    /**
     * Default: "image/png"
     */
    mimeType?: "image/png" | "image/jpeg";
    /**
     * Only applies if mimeType is "image/jpeg".
     * Range: 0-100. Default: 75
     */
    compressionQuality?: number;
  };
};
/**
 * Parameters for Google's native image-generating model
 * (gemini-2.5-flash-image)
 */
export type NanoBananaImageGenOpts = {
  /**
   * The model ID.
   */
  model: "gemini-2.5-flash-image";

  /**
   * The prompt, which can be simple text or a mix of
   * text and image parts (for image-to-image tasks).
   * Can contain up to 3 image attachments.
   * * e.g., ["A cat wearing a wizard hat"]
   * or [ {text: "Make this dog a cyborg"}, {inlineData: ...} ]
   */
  contents: (
    | string
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
    | { fileData: { fileUri: string; mimeType: string } }
  )[];

  /**
   * Configuration for the generation process.
   */
  generationConfig?: {
    /**
     * Number of response candidates to generate.
     * Note: This is for the *whole response*.
     * You can request *more images* using the imageConfig.
     * * Default: 1, Max: 8
     */
    candidateCount?: number;
    /**
     * Controls randomness. Lower is more deterministic.
     * Default: 1.0, Range: 0.0 - 2.0
     */
    temperature?: number;
    /**
     * Nucleus sampling.
     * Default: 0.95, Range: 0.0 - 1.0
     */
    topP?: number;
    /**
     * Top-k sampling.
     * Default: 64 (fixed)
     */
    topK?: number;
  };

  /**
   * Specific controls for the image generation part.
   */
  imageConfig?: {
    /**
     * Number of images to generate for this request.
     * Max: 10
     */
    sampleCount?: number;
    /**
     * Aspect ratio for the *output* images.
     * Default: "1:1" (1024x1024)
     *
     * "2:3" (832x1248)
     *
     * "3:2" (1248x832)
     *
     * "3:4" (864x1184)
     *
     * "4:3" (1184x864)
     *
     * "4:5" (896x1152)
     *
     * "5:4" (1152x896)
     *
     * "9:16" (768x1344)
     *
     * "16:9" (1344x768)
     *
     * "21:9" (1536x672)
     */
    aspectRatio?:
      | "1:1"
      | "2:3"
      | "3:2"
      | "3:4"
      | "4:3"
      | "4:5"
      | "5:4"
      | "9:16"
      | "16:9"
      | "21:9";
  };
};

export type GoogleGenAIImageGenOpts = NanoBananaImageGenOpts | ImagenOptions;

export type GrokImageGenOpts = {
  model: GrokImgGenModels;
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
   * default: `"url"`
   *
   * Response format to return the image in. Can be `"url"` or `"b64_json"`.
   *
   * If `"b64_json"` is specified, the image will be returned as a base64-encoded string instead of a url to the generated image file
   */
  response_format?: string | null;

  /**
   * A unique identifier representing the end-user, which can help xAI to monitor and detect abuse.
   */
  user?: string | null;
};

export type ImageGenOptsByProvider = {
  openai: OpenAIImageGenOpts;
  gemini: GoogleGenAIImageGenOpts;
  grok: GrokImageGenOpts;
};

export type ImgGenStage =
  | "queued"
  | "processing"
  | "persisting"
  | "finalizing"
  | "refusal"
  | "aborted";

export type Dalle3ImgGenWorkupRT = {
  response_format: "url" | "b64_json";
  isPureImgGenModel: true;
  style: "vivid" | "natural";
  msgBoundImgAssets: boolean;
  n: number;
  model: "dall-e-3";
  output_quality: "auto" | "standard" | "hd";
  output_size: "auto" | "1024x1024" | "1792x1024" | "1024x1792";
  targetApi: "images";
};

export type Dalle2ImgGenWorkupRT = {
  response_format: "url" | "b64_json";
  isPureImgGenModel: true;
  msgBoundImgAssets: boolean;
  n: number;
  model: "dall-e-2";
  output_quality: "auto" | "standard";
  output_size: "auto" | "256x256" | "512x512" | "1024x1024";
  targetApi: "images";
};

export type GptImageAndFacilitatorsImgGenWorkupRT = {
  input_image_mask:
    | {
        file_id?: string | undefined;
        image_url?: string | undefined;
      }
    | undefined;
  isPureImgGenModel: boolean;
  msgBoundImgAssets: boolean;
  n: number;
  moderation: "low" | "auto";
  output_format: "jpeg" | "webp" | "png";
  output_compression: number | undefined;
  model:
    | "gpt-image-1"
    | "gpt-image-1-mini"
    | "gpt-5"
    | "gpt-5-mini"
    | "gpt-5-nano"
    | "gpt-4.1"
    | "gpt-4.1-mini"
    | "gpt-4.1-nano"
    | "o3"
    | "gpt-4o"
    | "gpt-4o-mini";
  output_quality: "low" | "auto" | "high" | "medium";
  output_size: "auto" | "1024x1024" | "1024x1536" | "1536x1024";
  output_background: "auto" | "transparent" | "opaque" | undefined;
  targetApi: "responses" | "images";
  partialImagesRequested: number | undefined;
  input_fidelity: "low" | "high" | undefined;
};

export type ImgGenWorkupRT<T extends OpenAiModelIdUnion> = T extends "dall-e-3"
  ? Dalle3ImgGenWorkupRT
  : T extends "dall-e-2"
    ? Dalle2ImgGenWorkupRT
    : T extends
          | "gpt-image-1"
          | "gpt-image-1-mini"
          | "gpt-5"
          | "gpt-5-mini"
          | "gpt-5-nano"
          | "gpt-4.1"
          | "gpt-4.1-mini"
          | "gpt-4.1-nano"
          | "o3"
          | "gpt-4o"
          | "gpt-4o-mini"
      ? GptImageAndFacilitatorsImgGenWorkupRT
      : T extends
            | "gpt-5-pro"
            | "gpt-5-codex"
            | "gpt-3.5-turbo"
            | "gpt-4-turbo"
            | "o3-pro"
            | "o4-mini"
        ? undefined
        : undefined;

export type ImgGenWorkupRTObj = {
  "dall-e-2": Dalle2ImgGenWorkupRT;
  "dall-e-3": Dalle3ImgGenWorkupRT;
  "gpt-image-1": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-image-1-mini": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-4.1-nano": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-4.1-mini": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-4.1": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5-mini": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5-nano": GptImageAndFacilitatorsImgGenWorkupRT;
  o3: GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-4o": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-4o-mini": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5-pro": undefined;
  "gpt-5-codex": undefined;
  "gpt-4-turbo": undefined;
  "gpt-3.5-turbo": undefined;
  "gpt-4": undefined;
  "o3-pro": undefined;
  "o3-mini": undefined;
  "o4-mini": undefined;
};

export type ImgGenWorkupResRT<T extends keyof ImgGenWorkupRTObj> =
  | { [P in T]: ImgGenWorkupRTObj[P] }[T]
  | undefined;

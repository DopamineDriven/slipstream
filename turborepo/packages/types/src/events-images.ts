import type {
  GeminiImgGenModels,
  GeminiModelIdUnion,
  GetModelUtilRT,
  GrokImgGenModels,
  GrokModelIdUnion,
  OpenAIImgGenFacilitatingModels,
  OpenAIImgGenModels,
  OpenAiModelIdUnion,
  Provider
} from "@/models.ts";
import type {
  DocumentSingleton,
  ImageGenOutputSingleton,
  ImageSingleton
} from "@/types.ts";
import type { DX, Rm } from "@/utils.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";

export type OpenAIModelAspectRatioWorkup = DX<
  Record<
    Exclude<OpenAIImgCapableModels, "dall-e-2" | "dall-e-3">,
    "1536x1024" | "1024x1536" | "1024x1024" | "auto"
  > &
    Record<Exclude<OpenAiModelIdUnion, OpenAIImgCapableModels>, undefined> & {
      "dall-e-3": "1792x1024" | "1024x1792" | "1024x1024" | "auto";
      "dall-e-2": "256x256" | "512x512" | "1024x1024" | "auto";
    }
>;
export type OpenAIImgNativeGPTImgAR = Record<
  Exclude<OpenAIImgGenModels, "dall-e-2" | "dall-e-3">,
  "1536x1024" | "1024x1536" | "1024x1024" | "auto"
>;
export type OpenAINativeImgModelAspectRatioWorkup = OpenAIImgNativeGPTImgAR & {
  "dall-e-3": "1792x1024" | "1024x1792" | "1024x1024" | "auto";
  "dall-e-2": "256x256" | "512x512" | "1024x1024" | "auto";
};

export type OpenAIModelAspectRatio = {
  [P in keyof OpenAIModelAspectRatioWorkup]?: OpenAIModelAspectRatioWorkup[P];
};

export type GeminiModelAspectRatioWorkup = DX<
  Record<
    Exclude<
      GeminiImgGenModels,
      | "imagen-4.0-ultra-generate-001"
      | "imagen-4.0-generate-001"
      | "imagen-4.0-fast-generate-001"
    >,
    "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9"
  > &
    Record<
      Exclude<
        GeminiImgGenModels,
        | "gemini-3-pro-image-preview"
        | "gemini-2.5-flash-image"
        | "gemini-3.1-flash-image-preview"
      >,
      "1:1" | "3:4" | "4:3" | "9:16" | "16:9"
    > &
    Record<Exclude<GeminiModelIdUnion, GeminiImgGenModels>, undefined>
>;

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

export type GrokImagineImgModelUnion = GrokImgGenModels;

export type GrokModelAspectRatioWorkup = DX<
  Record<GrokImgGenModels, GrokImagineARUnion> &
    Record<Exclude<GrokModelIdUnion, GrokImgGenModels>, undefined>
>;

export type GeminiModelAspectRatio = {
  [P in keyof GeminiModelAspectRatioWorkup]?: GeminiModelAspectRatioWorkup[P];
};

export type GrokModelAspectRatio = {
  [P in keyof GrokModelAspectRatioWorkup]?: GrokModelAspectRatioWorkup[P];
};

export type OutputSizeProps<P extends Provider = Provider> = {
  openai?: OpenAIModelAspectRatio[GetModelUtilRT<"openai">];
  anthropic?: {
    [M in GetModelUtilRT<"anthropic">]: undefined;
  }[GetModelUtilRT<"anthropic">];
  grok?: GrokModelAspectRatio[GetModelUtilRT<"grok">];
  meta?: {
    [P in GetModelUtilRT<"meta">]?: undefined;
  }[GetModelUtilRT<"meta">];
  gemini?: GeminiModelAspectRatio[GetModelUtilRT<"gemini">];
  vercel?: {
    [P in GetModelUtilRT<"vercel">]?: undefined;
  }[GetModelUtilRT<"vercel">];
}[P];

export type NanoBananaOutputSize =
  | "1:1"
  | "2:3"
  | "3:2"
  | "3:4"
  | "4:3"
  | "4:5"
  | "5:4"
  | "9:16"
  | "16:9"
  | "21:9"
  | undefined;

export type GptImageOutputSize =
  | "1024x1024"
  | "1536x1024"
  | "1024x1536"
  | "auto"
  | undefined;

export type Dalle3OutputSize =
  | "1024x1024"
  | "1792x1024"
  | "1024x1792"
  | "auto"
  | undefined;

export type Dalle2OutputSize =
  | "256x256"
  | "512x512"
  | "1024x1024"
  | "auto"
  | undefined;
export type ImagenOutputSize =
  | "1:1"
  | "9:16"
  | "16:9"
  | "3:4"
  | "4:3"
  | undefined;

export type OpenAIImgCapableModels =
  | OpenAIImgGenFacilitatingModels
  | OpenAIImgGenModels;

export type GeminiImageSize = DX<
  Record<
    Exclude<
      GeminiImgGenModels,
      | "gemini-2.5-flash-image"
      | "gemini-3-pro-image-preview"
      | "deep-research-pro-preview-12-2025"
    >,
    "1:1" | "3:4" | "4:3" | "9:16" | "16:9"
  > &
    Record<
      Exclude<
        GeminiImgGenModels,
        | "imagen-4.0-fast-generate-001"
        | "imagen-4.0-generate-001"
        | "imagen-4.0-ultra-generate-001"
      >,
      | "1:1"
      | "2:3"
      | "3:2"
      | "3:4"
      | "4:3"
      | "4:5"
      | "5:4"
      | "9:16"
      | "16:9"
      | "21:9"
    >
>;

export type GeminiImageQuality = DX<
  Record<
    Exclude<
      GeminiImgGenModels,
      | "gemini-2.5-flash-image"
      | "gemini-3-pro-image-preview"
      | "deep-research-pro-preview-12-2025"
    >,
    "1K" | "2K"
  > &
    Record<
      Exclude<
        GeminiImgGenModels,
        | "imagen-4.0-fast-generate-001"
        | "imagen-4.0-generate-001"
        | "imagen-4.0-ultra-generate-001"
      >,
      "1K" | "2K" | "4K"
    >
>;

export type OpenAINativeImgModelQualityWorkup = Record<
  Exclude<OpenAIImgGenModels, "dall-e-2" | "dall-e-3">,
  "low" | "medium" | "high" | "auto"
> & {
  "dall-e-3": "standard" | "hd" | "auto";
  "dall-e-2": "standard" | "auto";
};

/**
 * OpenAI Image Size & Quality Options
 *
 * Note: gpt-image-1-mini has the same available options as gpt-image-1
 */
export type OpenAISizeQualityOpts = {
  quality: OpenAINativeImgModelQualityWorkup;
  size: OpenAINativeImgModelAspectRatioWorkup;
};

export type GoogleImgSizeQualityOpts = {
  size: GeminiImageSize;
  quality: GeminiImageQuality;
};

export type GoogleImgOutputFormat = {
  format: {
    "imagen-4.0-fast-generate-001": "image/png" | "image/jpeg";
    "imagen-4.0-generate-001": "image/png" | "image/jpeg";
    "imagen-4.0-ultra-generate-001": "image/png" | "image/jpeg";
  };
};

/** Required. The harm block threshold. */
export enum GoogleSafetyFilterLevel {
  BLOCK_LOW_AND_ABOVE = "BLOCK_LOW_AND_ABOVE",
  BLOCK_MEDIUM_AND_ABOVE = "BLOCK_MEDIUM_AND_ABOVE",
  BLOCK_ONLY_HIGH = "BLOCK_ONLY_HIGH",
  BLOCK_NONE = "BLOCK_NONE"
}

/** Required. Harm category. */
export enum GoogleHarmCategory {
  /**
   * The harm category is unspecified.
   */
  HARM_CATEGORY_UNSPECIFIED = "HARM_CATEGORY_UNSPECIFIED",
  /**
   * The harm category is harassment.
   */
  HARM_CATEGORY_HARASSMENT = "HARM_CATEGORY_HARASSMENT",
  /**
   * The harm category is hate speech.
   */
  HARM_CATEGORY_HATE_SPEECH = "HARM_CATEGORY_HATE_SPEECH",
  /**
   * The harm category is sexually explicit content.
   */
  HARM_CATEGORY_SEXUALLY_EXPLICIT = "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  /**
   * The harm category is dangerous content.
   */
  HARM_CATEGORY_DANGEROUS_CONTENT = "HARM_CATEGORY_DANGEROUS_CONTENT",
  /**
   * Deprecated: Election filter is not longer supported. The harm category is civic integrity.
   */
  HARM_CATEGORY_CIVIC_INTEGRITY = "HARM_CATEGORY_CIVIC_INTEGRITY",
  /**
   * The harm category is image hate. This enum value is not supported in Gemini API.
   */
  HARM_CATEGORY_IMAGE_HATE = "HARM_CATEGORY_IMAGE_HATE",
  /**
   * The harm category is image dangerous content. This enum value is not supported in Gemini API.
   */
  HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT = "HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT",
  /**
   * The harm category is image harassment. This enum value is not supported in Gemini API.
   */
  HARM_CATEGORY_IMAGE_HARASSMENT = "HARM_CATEGORY_IMAGE_HARASSMENT",
  /**
   * The harm category is image sexually explicit content. This enum value is not supported in Gemini API.
   */
  HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT = "HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT",
  /**
   * The harm category is for jailbreak prompts. This enum value is not supported in Gemini API.
   */
  HARM_CATEGORY_JAILBREAK = "HARM_CATEGORY_JAILBREAK"
}

export enum GooglePersonGeneration {
  /**
   * Block generation of images of people.
   */
  DONT_ALLOW = "DONT_ALLOW",
  /**
   * Generate images of adults, but not children.
   */
  ALLOW_ADULT = "ALLOW_ADULT",
  /**
   * Generate images that include adults and children.
   */
  ALLOW_ALL = "ALLOW_ALL"
}

export enum GoogleImagePromptLanguage {
  /**
   * Auto-detect the language.
   */
  auto = "auto",
  /**
   * English
   */
  en = "en",
  /**
   * Japanese
   */
  ja = "ja",
  /**
   * Korean
   */
  ko = "ko",
  /**
   * Hindi
   */
  hi = "hi",
  /**
   * Chinese
   */
  zh = "zh",
  /**
   * Portuguese
   */
  pt = "pt",
  /**
   * Spanish
   */
  es = "es"
}

export interface GoogleImagenGenerateImagesConfig {
  /** Used to override HTTP request options. */
  httpOptions?: {
    /** The base URL for the AI platform service endpoint. */ baseUrl?: string;
    /** Specifies the version of the API to use. */
    apiVersion?: string;
    /** Additional HTTP headers to be sent with the request. */
    headers?: Record<string, string>;
    /** Timeout for the request in milliseconds. */
    timeout?: number;
    /** Extra parameters to add to the request body.
     The structure must match the backend API's request structure.
     - VertexAI backend API docs: https://cloud.google.com/vertex-ai/docs/reference/rest
     - GeminiAPI backend API docs: https://ai.google.dev/api/rest */
    extraBody?: Record<string, unknown>;
  };
  /** Abort signal which can be used to cancel the request.

     NOTE: AbortSignal is a client-only operation. Using it to cancel an
     operation will not cancel the request in the service. You will still
     be charged usage for any applicable operations.
     */
  abortSignal?: AbortSignal;
  /** Cloud Storage URI used to store the generated images. */
  outputGcsUri?: string;
  /** Description of what to discourage in the generated images. */
  negativePrompt?: string;
  /** Number of images to generate. 1 min, 4 max (10 for Nano Banana) */
  numberOfImages?: number;
  /** Aspect ratio of the generated images. Supported values are
     "1:1", "3:4", "4:3", "9:16", and "16:9". */
  aspectRatio?: string;
  /** Controls how much the model adheres to the text prompt. Large
     values increase output and prompt alignment, but may compromise image
     quality. */
  guidanceScale?: number;
  /** Random seed for image generation. This is not available when
     ``add_watermark`` is set to true.

     Accepted integer values: 1-2147483647 */
  seed?: number;
  /** Filter level for safety filtering. */
  safetyFilterLevel?: keyof typeof GoogleSafetyFilterLevel;
  /** Allows generation of people by the model. */
  personGeneration?: keyof typeof GooglePersonGeneration;
  /** Whether to report the safety scores of each generated image and
     the positive prompt in the response. */
  includeSafetyAttributes?: boolean;
  /** Whether to include the Responsible AI filter reason if the image
     is filtered out of the response. */
  includeRaiReason?: boolean;
  /** Language of the text in the prompt. */
  language?: keyof typeof GoogleImagePromptLanguage;
  /** MIME type of the generated image.
   *
   *   "image/webp"
      | "image/gif"
      | "image/png"
      | "image/vnd.microsoft.icon"
      | "image/bmp"
      | "image/tiff"
      | "image/jpeg" */
  outputMimeType?: string;
  /** Compression quality of the generated image (for ``image/jpeg``
     only). */
  outputCompressionQuality?: number;
  /** Whether to add a watermark to the generated images. */
  addWatermark?: boolean;
  /** User specified labels to track billing usage. */
  labels?: Record<string, string>;
  /** The size of the largest dimension of the generated image.
     Supported sizes are 1K and 2K (not supported for Imagen 3 models). */
  imageSize?: string;
  /** Whether to use the prompt rewriting logic. */
  enhancePrompt?: boolean;
}

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

export interface GptImage1Opts extends SharedOpenAIImageOpts<
  "gpt-image-1" | "gpt-image-1-mini" | "gpt-image-1.5"
> {
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
 * (e.g., imagen-4.0-generate-001,
 * imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001)
 */
export type ImagenOptions = {
  model: Exclude<
    GeminiImgGenModels,
    | "gemini-3.1-flash-image-preview"
    | "gemini-2.5-flash-image"
    | "gemini-3-pro-image-preview"
    | "deep-research-pro-preview-12-2025"
  >;
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
  aspectRatio?: GeminiImageSize["imagen-4.0-generate-001"];

  /**
   * The output resolution. Only available for Imagen 4.
   * Default: "1K"
   */
  sampleImageSize?: GeminiImageQuality["imagen-4.0-generate-001"];

  /**
   * A seed value for reproducible results.
   * accepted integer values: 1 - 2147483647
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
  model: Exclude<
    GeminiImgGenModels,
    | "imagen-4.0-fast-generate-001"
    | "imagen-4.0-generate-001"
    | "imagen-4.0-ultra-generate-001"
  >;

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

    responseModalities: ["TEXT", "IMAGE"];
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
      aspectRatio?: GeminiImageSize["gemini-3-pro-image-preview"];
    };

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
};

export type GoogleGenAIImageGenOpts = NanoBananaImageGenOpts | ImagenOptions;

export type GrokImagineImageGenOpts = {
  model: GrokImagineImgModelUnion;
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
  aspect_ratio?: GrokImagineARUnion | null;

  /**
   * Resolution of the generated image. Defaults to 2k. Only supported by grok-imagine models.
   */
  resolution?: "1k" | "2k" | null;
  /**
   * default: `"url"`
   *
   * Response format to return the image in. Can be `"url" | "b64_json"`.
   *
   * If `"b64_json"` is specified, the image will be returned as a base64-encoded string instead of a url to the generated image file
   */
  response_format?: string | null;

  /**
   * A unique identifier representing the end-user, which can help xAI to monitor and detect abuse.
   */
  user?: string | null;

  respect_moderation?: string;
};

export type GrokImgGenUnionOpts = GrokImagineImageGenOpts;

export type ImageGenOptsByProvider = {
  openai: OpenAIImageGenOpts;
  gemini: GoogleGenAIImageGenOpts;
  grok: GrokImgGenUnionOpts;
};

export type AIChatRequestImgGenFields = {
  pureImgGenModel?: boolean;
  /**
   * gpt-image-1 only
   *
   * values include "high" | "low" | null
   */
  input_fidelity?: "high" | "low" | null | (string & {});
  /**
   * gpt-image-1 & gpt-image-1-mini only
   *
   * values include "low" | "auto"
   */
  moderation?: "low" | "auto" | (string & {});
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
   *  imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
   *
   * n=4 (default),
   * n=1 (min)
   *
   */
  n?: number;
  /**
   * ** imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, & imagen-4.0-fast-generate-001 only**
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
   * ** imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, & imagen-4.0-fast-generate-001**
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
   *  imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
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
   *
   *
   * grok-imagine-image and grok-imagine-image-pro
   *
   * "1k" | "2k" | null
   *
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
   *  imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
   *
   * "1:1"="1024x1024" (default) | "9:16"="768x1344" | "16:9"="1344x768" | "3:4"="864x1184" | "4:3"="1184x864"
   *
   * gemini-2.5-flash-image:
   *
   * "1:1"="1024x1024" (default) | "2:3"="832x1248" | "3:2"="1248x832" | "3:4"="864x1184" | "4:3"="1184x864" | "4:5"="896x1152" | "5:4"="1152x896" | "9:16"="768x1344" | "16:9"="1344x768" | "21:9"="1536x672"
   *
   * grok-imagine-image, grok-imagine-image-pro:
   *
   * 1:1 | "3:4" | "4:3" | "9:16" | "16:9" | "2:3" | "3:2" | "9:19.5" | "19.5:9" | "9:20" | "20:9" | "1:2" | "2:1" | "auto"
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
   * ** imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001 only**
   *
   * A seed value for reproducible results.
   * 0 for random.
   */
  seed?: number;

  /**
   *
   * ** imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001 only**
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
    index: number;
    cdnUrl: string;
    width: number;
    height: number;
    mime: string;
  }[];
  images?: {
    index: number;
    cdnUrl: string;
    width: number;
    height: number;
    mime: string;
  }[];
};

export type S3Checksum =
  | {
      readonly algo: "SHA256";
      readonly value: string;
    }
  | {
      readonly algo: "CRC32C";
      readonly value: string;
    }
  | {
      readonly algo: "CRC32";
      readonly value: string;
    }
  | {
      readonly algo: "SHA1";
      readonly value: string;
    }
  | {
      readonly algo: "CRC64NVME";
      readonly value: string;
    }
  | undefined;

export type S3StorageClass =
  | "DEEP_ARCHIVE"
  | "EXPRESS_ONEZONE"
  | "FSX_ONTAP"
  | "FSX_OPENZFS"
  | "GLACIER"
  | "GLACIER_IR"
  | "INTELLIGENT_TIERING"
  | "ONEZONE_IA"
  | "OUTPOSTS"
  | "REDUCED_REDUNDANCY"
  | "SNOW"
  | "STANDARD"
  | "STANDARD_IA"
  | undefined;
export type ImgMetadataEntity = {
  animated: boolean;
  aspectRatio: number;
  cameraMake: string | null;
  cameraModel: string | null;
  colorSpace: $Enums.ColorSpace;
  dominantColorHex: string | null;
  exifDateTimeOriginal: Date | null;
  colorModel: $Enums.ColorModel;
  format: $Enums.ImageFormat;
  frames: number;
  gpsLat: number | null;
  gpsLon: number | null;
  hasAlpha: boolean;
  height: number;
  width: number;
  iccProfile: string | null;
  lensModel: string | null;
  orientation: number | null;
  createdAt?: Date;
  updatedAt?: Date;
};
export type ImageGenPartialArr = [
  number, // partial-to-final-index tracking (0 <= n <= 3) n partial images + final response)
  string, // cdnUrl (cloudfront url returned post-s3 upload)
  string, // itemId (shared by all partials and final image)
  number, // width
  number, // height
  string, // mime type
  string, // s3 bucket
  string, // s3 key
  string, // s3 versionId
  string, // s3ObjectId
  string | undefined, // filename
  string | undefined, // extension
  string | undefined, // etag
  number | undefined, // size
  string | undefined, // s3 last modified
  string | undefined, // content disposition
  string | undefined, // cache control
  S3Checksum | undefined, // s3 checksum={checksumSha256, checksumAlgo}
  S3StorageClass | undefined, // s3 storage class
  string, // generationGroupId (unique resp_id via openai -> resp_0769a1845e4ca883016900c9bfb9388193a9efbb12edd87b37 )
  ImgMetadataEntity | undefined, // ImageMetadata via extractor package
  number | undefined, // upload duration
  string | undefined, // requestMessageId
  string | undefined, // jobId
  string | undefined // revised_prompt
];

export type AIChatResponseImgGenSubFields = {
  index: number;
  itemId?: string;
  width: number;
  height: number;
  draftId: string | null;
  batchId: string | null;
  s3ObjectId: string | null;
  userId: string;
  origin: "GENERATED";
  status:
    | "REQUESTED"
    | "PLANNED"
    | "UPLOADING"
    | "STORED"
    | "SCANNING"
    | "READY"
    | "FAILED"
    | "QUARANTINED"
    | "ATTACHED"
    | "DELETED";
  size: number | null;
  compatKey: string | null;
  compatStatus: "FAILED" | "PENDING" | "ACTIVE" | "ALIASED" | null;
  compatCdnUrl: string | null;
  compatReadyAt: Date | null;
  compatVersionId: string | null;
  compatS3ObjectId: string | null;
  compatMime: string | null;
  compatExt: string | null;
  uploadDuration: number | null;
  cdnUrl: string | null;
  publicUrl: string | null;
  sourceUrl: string | null;
  thumbnailKey: string | null;
  bucket: string;
  key: string;
  versionId: string | null;
  region: string;
  cacheControl: string | null;
  contentDisposition: string | null;
  contentEncoding: string | null;
  expiresAt: Date | null;
  filename: string | null;
  ext: string | null;
  mime: string | null;
  etag: string | null;
  checksumAlgo: "CRC32" | "CRC32C" | "SHA1" | "SHA256" | "CRC64NVME";
  checksumSha256: string | null;
  storageClass: string | null;
  sseAlgorithm: string | null;
  sseKmsKeyId: string | null;
  s3LastModified: Date | null;
  deletedAt: Date | null;
  image: Rm<ImageSingleton, "attachmentId" | "createdAt" | "updatedAt"> | null;
  document: Rm<
    DocumentSingleton,
    "attachmentId" | "createdAt" | "updatedAt"
  > | null;
  imageGenOutput: Rm<
    ImageGenOutputSingleton,
    "id" | "attachmentId" | "createdAt" | "updatedAt"
  > | null;
  generationGroupId: string;
  requestMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
  kind: "FINAL" | "PARTIAL";
  jobId: string;
  jobIndex: number;
  seriesIndex?: number;
  seriesId: string | null;
  revisedPrompt?: string;
};

export type AIChatResponseImgGenFieldsFinal = {
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
  activeImage?: AIChatResponseImgGenSubFields;
  partialImages?: AIChatResponseImgGenSubFields[];
  images?: AIChatResponseImgGenSubFields[];
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
  output_quality: SharedOpenAIImageOpts<"dall-e-3">["quality"];
  output_size: SharedOpenAIImageOpts<"dall-e-3">["size"];
  targetApi: "images";
};

export type Dalle2ImgGenWorkupRT = {
  response_format: "url" | "b64_json";
  isPureImgGenModel: true;
  msgBoundImgAssets: boolean;
  n: number;
  model: "dall-e-2";
  output_quality: SharedOpenAIImageOpts<"dall-e-2">["quality"];
  output_size: SharedOpenAIImageOpts<"dall-e-2">["size"];
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
    | "gpt-5.4"
    | "gpt-5.2"
    | "gpt-5.1"
    | "gpt-image-1.5"
    | "gpt-image-1"
    | "gpt-image-1-mini"
    | "gpt-5"
    | "gpt-5-mini"
    | "gpt-5-nano"
    | "gpt-4.1"
    | "gpt-5-pro"
    | "gpt-5.2-pro"
    | "gpt-5.4-pro"
    | "gpt-5-chat-latest"
    | "gpt-4.1-mini"
    | "gpt-4.1-nano"
    | "o3"
    | "gpt-4o"
    | "gpt-4o-mini";
  output_quality: SharedOpenAIImageOpts<
    "gpt-image-1" | "gpt-image-1.5" | "gpt-image-1-mini"
  >["quality"];
  output_size: SharedOpenAIImageOpts<
    "gpt-image-1" | "gpt-image-1.5" | "gpt-image-1-mini"
  >["size"];
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
          | "gpt-image-1.5"
          | "gpt-image-1"
          | "gpt-image-1-mini"
          | "gpt-5"
          | "gpt-5-chat-latest"
          | "gpt-5-pro"
          | "gpt-5-mini"
          | "gpt-5.4"
          | "gpt-5.4-pro"
          | "gpt-5.2"
          | "gpt-5.2-pro"
          | "gpt-5.1"
          | "gpt-5-nano"
          | "gpt-4.1"
          | "gpt-4.1-mini"
          | "gpt-4.1-nano"
          | "o3"
          | "gpt-4o"
          | "gpt-4o-mini"
      ? GptImageAndFacilitatorsImgGenWorkupRT
      : T extends
            | "gpt-5.2-chat-latest"
            | "gpt-5-codex"
            | "gpt-3.5-turbo"
            | "gpt-4-turbo"
            | "gpt-5.1-chat-latest"
            | "gpt-5.1-codex"
            | "gpt-5.1-codex-mini"
            | "gpt-5.1-codex-max"
            | "chatgpt-4o-latest"
            | "o1-pro"
            | "o1"
            | "sora-2"
            | "sora-2-pro"
            | "o3-deep-research"
            | "o4-mini-deep-research"
            | "o3-pro"
            | "o4-mini"
        ? undefined
        : undefined;

export type ImgGenWorkupRTObj = {
  "dall-e-2": Dalle2ImgGenWorkupRT;
  "dall-e-3": Dalle3ImgGenWorkupRT;
  "gpt-image-1.5": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-image-1": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-image-1-mini": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-4.1-nano": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-4.1-mini": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-4.1": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5-mini": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5-nano": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5-pro": GptImageAndFacilitatorsImgGenWorkupRT;
  o3: GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-4o": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-4o-mini": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5-chat-latest": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5.2": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5.2-pro": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5.1": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5.4": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5.4-pro": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5.3-codex": undefined;
  "gpt-5.2-codex": undefined;
  "gpt-5.1-codex-mini": undefined;
  o1: undefined;
  "o1-pro": undefined;
  "gpt-5.2-chat-latest": undefined;
  "gpt-5.1-codex-max": undefined;
  "sora-2": undefined;
  "sora-2-pro": undefined;
  "gpt-5-codex": undefined;
  "gpt-4-turbo": undefined;
  "gpt-3.5-turbo": undefined;
  "chatgpt-4o-latest": undefined;
  "o3-deep-research": undefined;
  "o4-mini-deep-research": undefined;
  "gpt-4": undefined;
  "o3-pro": undefined;
  "o3-mini": undefined;
  "o4-mini": undefined;
  "gpt-5.1-chat-latest": undefined;
  "gpt-5.1-codex": undefined;
  "gpt-5.1.-codex-mini": undefined;
};

export type ImgGenWorkupResRT<T extends keyof ImgGenWorkupRTObj> =
  | { [P in T]: ImgGenWorkupRTObj[P] }[T]
  | undefined;

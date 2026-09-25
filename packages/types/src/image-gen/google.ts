import type { GeminiImgGenModels, GeminiModelIdUnion } from "@/models.ts";
import type { DX } from "@/utils.ts";

export type GeminiModelAspectRatioWorkup = DX<
  {
    "gemini-3-pro-image-preview": BaseNanoBananaOutputAR;
    "gemini-2.5-flash-image": BaseNanoBananaOutputAR;
    "deep-research-max-preview-04-2026": BaseNanoBananaOutputAR;
    "deep-research-preview-04-2026": BaseNanoBananaOutputAR;
    "gemini-3.1-flash-image-preview": NanoBanana2OutputAR;
    "gemini-3.1-flash-lite-image": NanoBanana2OutputAR;
  } & Record<Exclude<GeminiModelIdUnion, GeminiImgGenModels>, undefined>
>;

export type GeminiModelAspectRatio = {
  [P in keyof GeminiModelAspectRatioWorkup]?: GeminiModelAspectRatioWorkup[P];
};

export type BaseNanoBananaOutputAR =
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

export type NanoBananaOutputSize = BaseNanoBananaOutputAR | undefined;

export type NanoBanana2OutputAR =
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
  | "1:4"
  | "4:1"
  | "1:8"
  | "8:1";

export type ImagenOutputSize =
  "1:1" | "9:16" | "16:9" | "3:4" | "4:3" | undefined;

export type GeminiImageSize = GeminiModelAspectRatio;

export type GeminiImageQuality = DX<
  {
    "gemini-3.1-flash-lite-image": "0.5K" | "1K";
    "gemini-3.1-flash-image-preview": "0.5K" | "1K" | "2K" | "4K";
    "gemini-3-pro-image-preview": "1K" | "2K" | "4K";
    "gemini-2.5-flash-image": "1K";
    "deep-research-max-preview-04-2026": "1K" | "2K" | "4K";
    "deep-research-preview-04-2026": "1K" | "2K" | "4K";
  } & Record<Exclude<GeminiModelIdUnion, GeminiImgGenModels>, undefined>
>;

export type GoogleImgSizeQualityOpts = {
  size: GeminiImageSize;
  quality: GeminiImageQuality;
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
 * Parameters for Google's native image-generating model
 * (gemini-2.5-flash-image)
 */
export type NanoBananaImageGenOpts<
  T extends GeminiModelIdUnion = GeminiModelIdUnion
> = T extends
  | "gemini-3.1-flash-lite-image"
  | "gemini-3-pro-image-preview"
  | "gemini-2.5-flash-image"
  | "gemini-3.1-flash-image-preview"
  | "deep-research-max-preview-04-2026"
  | "deep-research-preview-04-2026"
  ? {
      /**
       * The model ID.
       */
      model: T;

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
         * * Default: 1, Max: 8 -- max 14 for nano banana 2
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
          aspectRatio?: GeminiImageSize[T];
          imageSize?: GeminiImageQuality[T];
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
    }
  : never;

export type GoogleGenAIImageGenOpts<
  T extends GeminiModelIdUnion = GeminiModelIdUnion
> = NanoBananaImageGenOpts<T>;

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
import type { DX, Include, Rm } from "@/utils.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";

export const GPT_IMAGE_2_EXTENDED_OPTIONS = [
  { value: "auto", label: "Auto" },

  // 1:1
  { value: "1024x1024", label: "1:1", pixelSize: "1024×1024" },
  { value: "1536x1536", label: "1:1 (1536)", pixelSize: "1536×1536" },
  { value: "2048x2048", label: "1:1 2K", pixelSize: "2048×2048" },
  { value: "2560x2560", label: "1:1 (2560)", pixelSize: "2560×2560" },
  { value: "2880x2880", label: "1:1 Max", pixelSize: "2880×2880" },

  // 2:3
  { value: "1024x1536", label: "2:3", pixelSize: "1024×1536" },
  { value: "1536x2304", label: "2:3 (1536)", pixelSize: "1536×2304" },
  { value: "2048x3072", label: "2:3 2K", pixelSize: "2048×3072" },
  { value: "2304x3456", label: "2:3 Max", pixelSize: "2304×3456" },

  // 3:2
  { value: "1536x1024", label: "3:2", pixelSize: "1536×1024" },
  { value: "2304x1536", label: "3:2 (1536)", pixelSize: "2304×1536" },
  { value: "3072x2048", label: "3:2 2K", pixelSize: "3072×2048" },
  { value: "3456x2304", label: "3:2 Max", pixelSize: "3456×2304" },

  // 3:4
  { value: "1152x1536", label: "3:4", pixelSize: "1152×1536" },
  { value: "1536x2048", label: "3:4 (1536)", pixelSize: "1536×2048" },
  { value: "1920x2560", label: "3:4 2K", pixelSize: "1920×2560" },
  { value: "2304x3072", label: "3:4 Max", pixelSize: "2304×3072" },

  // 4:3
  { value: "1536x1152", label: "4:3", pixelSize: "1536×1152" },
  { value: "2048x1536", label: "4:3 (2048)", pixelSize: "2048×1536" },
  { value: "2560x1920", label: "4:3 2K", pixelSize: "2560×1920" },
  { value: "3072x2304", label: "4:3 Max", pixelSize: "3072×2304" },

  // 4:5
  { value: "1024x1280", label: "4:5", pixelSize: "1024×1280" },
  { value: "1536x1920", label: "4:5 (1536)", pixelSize: "1536×1920" },
  { value: "2048x2560", label: "4:5 2K", pixelSize: "2048×2560" },
  { value: "2304x2880", label: "4:5 (2304)", pixelSize: "2304×2880" },
  { value: "2560x3200", label: "4:5 Max", pixelSize: "2560×3200" },

  // 5:4
  { value: "1280x1024", label: "5:4", pixelSize: "1280×1024" },
  { value: "1920x1536", label: "5:4 (1920)", pixelSize: "1920×1536" },
  { value: "2560x2048", label: "5:4 2K", pixelSize: "2560×2048" },
  { value: "2880x2304", label: "5:4 (2880)", pixelSize: "2880×2304" },
  { value: "3200x2560", label: "5:4 Max", pixelSize: "3200×2560" },

  // 9:16
  { value: "1152x2048", label: "9:16", pixelSize: "1152×2048" },
  { value: "1440x2560", label: "9:16 (1440)", pixelSize: "1440×2560" },
  { value: "1728x3072", label: "9:16 3K", pixelSize: "1728×3072" },
  { value: "2016x3584", label: "9:16 (2016)", pixelSize: "2016×3584" },
  { value: "2160x3840", label: "9:16 4K", pixelSize: "2160×3840" },

  // 16:9
  { value: "2048x1152", label: "16:9", pixelSize: "2048×1152" },
  { value: "2560x1440", label: "16:9 (2560)", pixelSize: "2560×1440" },
  { value: "3072x1728", label: "16:9 3K", pixelSize: "3072×1728" },
  { value: "3584x2016", label: "16:9 (3584)", pixelSize: "3584×2016" },
  { value: "3840x2160", label: "16:9 4K", pixelSize: "3840×2160" },

  // 10:16
  { value: "960x1536", label: "10:16", pixelSize: "960×1536" },
  { value: "1280x2048", label: "10:16 (1280)", pixelSize: "1280×2048" },
  { value: "1600x2560", label: "10:16 2.5K", pixelSize: "1600×2560" },
  { value: "1920x3072", label: "10:16 3K", pixelSize: "1920×3072" },
  { value: "2240x3584", label: "10:16 Max", pixelSize: "2240×3584" },

  // 16:10
  { value: "1536x960", label: "16:10", pixelSize: "1536×960" },
  { value: "2048x1280", label: "16:10 (2048)", pixelSize: "2048×1280" },
  { value: "2560x1600", label: "16:10 2.5K", pixelSize: "2560×1600" },
  { value: "3072x1920", label: "16:10 3K", pixelSize: "3072×1920" },
  { value: "3584x2240", label: "16:10 Max", pixelSize: "3584×2240" },

  // 1:2
  { value: "1024x2048", label: "1:2", pixelSize: "1024×2048" },
  { value: "1280x2560", label: "1:2 (1280)", pixelSize: "1280×2560" },
  { value: "1536x3072", label: "1:2 3K", pixelSize: "1536×3072" },
  { value: "1792x3584", label: "1:2 (1792)", pixelSize: "1792×3584" },
  { value: "1920x3840", label: "1:2 Max", pixelSize: "1920×3840" },

  // 2:1
  { value: "2048x1024", label: "2:1", pixelSize: "2048×1024" },
  { value: "2560x1280", label: "2:1 (2560)", pixelSize: "2560×1280" },
  { value: "3072x1536", label: "2:1 3K", pixelSize: "3072×1536" },
  { value: "3584x1792", label: "2:1 (3584)", pixelSize: "3584×1792" },
  { value: "3840x1920", label: "2:1 Max", pixelSize: "3840×1920" },

  // 9:21
  { value: "864x2016", label: "9:21", pixelSize: "864×2016" },
  { value: "1152x2688", label: "9:21 (1152)", pixelSize: "1152×2688" },
  { value: "1440x3360", label: "9:21 3K", pixelSize: "1440×3360" },
  { value: "1632x3808", label: "9:21 Max", pixelSize: "1632×3808" },

  // 21:9
  { value: "2016x864", label: "21:9", pixelSize: "2016×864" },
  { value: "2688x1152", label: "21:9 (2688)", pixelSize: "2688×1152" },
  { value: "3360x1440", label: "21:9 3K", pixelSize: "3360×1440" },
  { value: "3808x1632", label: "21:9 Max", pixelSize: "3808×1632" },

  // 1:3
  { value: "512x1536", label: "1:3", pixelSize: "512×1536" },
  { value: "768x2304", label: "1:3 (768)", pixelSize: "768×2304" },
  { value: "1024x3072", label: "1:3 3K", pixelSize: "1024×3072" },
  { value: "1280x3840", label: "1:3 Max", pixelSize: "1280×3840" },

  // 3:1
  { value: "1536x512", label: "3:1", pixelSize: "1536×512" },
  { value: "2304x768", label: "3:1 (2304)", pixelSize: "2304×768" },
  { value: "3072x1024", label: "3:1 3K", pixelSize: "3072×1024" },
  { value: "3840x1280", label: "3:1 Max", pixelSize: "3840×1280" }
] as const;

export type BaseOpenAISize = "1536x1024" | "1024x1536" | "1024x1024" | "auto";

export type GPTImage2Size =
  | BaseOpenAISize
  // 1:1
  | "1536x1536"
  | "2048x2048"
  | "2560x2560"
  | "2880x2880"
  // 2:3
  | "1536x2304"
  | "2048x3072"
  | "2304x3456"
  // 3:2
  | "2304x1536"
  | "3072x2048"
  | "3456x2304"
  // 3:4
  | "1152x1536"
  | "1536x2048"
  | "1920x2560"
  | "2304x3072"
  // 4:3
  | "1536x1152"
  | "2048x1536"
  | "2560x1920"
  | "3072x2304"
  // 4:5
  | "1024x1280"
  | "1536x1920"
  | "2048x2560"
  | "2304x2880"
  | "2560x3200"
  // 5:4
  | "1280x1024"
  | "1920x1536"
  | "2560x2048"
  | "2880x2304"
  | "3200x2560"
  // 9:16
  | "1152x2048"
  | "1440x2560"
  | "1728x3072"
  | "2016x3584"
  | "2160x3840"
  // 16:9
  | "2048x1152"
  | "2560x1440"
  | "3072x1728"
  | "3584x2016"
  | "3840x2160"
  // 10:16
  | "960x1536"
  | "1280x2048"
  | "1600x2560"
  | "1920x3072"
  | "2240x3584"
  // 16:10
  | "1536x960"
  | "2048x1280"
  | "2560x1600"
  | "3072x1920"
  | "3584x2240"
  // 1:2
  | "1024x2048"
  | "1280x2560"
  | "1536x3072"
  | "1792x3584"
  | "1920x3840"
  // 2:1
  | "2048x1024"
  | "2560x1280"
  | "3072x1536"
  | "3584x1792"
  | "3840x1920"
  // 9:21
  | "864x2016"
  | "1152x2688"
  | "1440x3360"
  | "1632x3808"
  // 21:9
  | "2016x864"
  | "2688x1152"
  | "3360x1440"
  | "3808x1632"
  // 1:3
  | "512x1536"
  | "768x2304"
  | "1024x3072"
  | "1280x3840"
  // 3:1
  | "1536x512"
  | "2304x768"
  | "3072x1024"
  | "3840x1280";

export type OpenAIModelAspectRatioWorkup = DX<
  Record<OpenAIImgCapableModels, GPTImage2Size>
>;
export type OpenAIImgNativeGPTImgAR = {
  "gpt-image-1.5": BaseOpenAISize;
  "gpt-image-1": BaseOpenAISize;
  "gpt-image-1-mini": BaseOpenAISize;
  "gpt-image-2": GPTImage2Size;
};
export type OpenAINativeImgModelAspectRatioWorkup = OpenAIImgNativeGPTImgAR;
export type OpenAIModelAspectRatio = {
  [P in keyof OpenAIModelAspectRatioWorkup]?: OpenAIModelAspectRatioWorkup[P];
};

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
  openai?: OpenAIModelAspectRatio[Include<
    OpenAiModelIdUnion,
    OpenAIImgCapableModels
  >];
  minimax: {
    [M in GetModelUtilRT<"minimax">]: undefined;
  }[GetModelUtilRT<"minimax">];
  alibaba?: {
    [M in GetModelUtilRT<"alibaba">]: undefined;
  }[GetModelUtilRT<"alibaba">];
  mistral?: {
    [M in GetModelUtilRT<"mistral">]: undefined;
  }[GetModelUtilRT<"mistral">];
  cohere?: {
    [M in GetModelUtilRT<"cohere">]: undefined;
  }[GetModelUtilRT<"cohere">];
  moonshotai?: {
    [M in GetModelUtilRT<"moonshotai">]: undefined;
  }[GetModelUtilRT<"moonshotai">];
  deepseek?: {
    [M in GetModelUtilRT<"deepseek">]: undefined;
  }[GetModelUtilRT<"deepseek">];
  zai?: {
    [M in GetModelUtilRT<"zai">]: undefined;
  }[GetModelUtilRT<"zai">];
  anthropic?: {
    [M in GetModelUtilRT<"anthropic">]: undefined;
  }[GetModelUtilRT<"anthropic">];
  grok?: GrokModelAspectRatio[GetModelUtilRT<"grok">];
  meta?: {
    [P in GetModelUtilRT<"meta">]: undefined;
  }[GetModelUtilRT<"meta">];
  gemini?: GeminiModelAspectRatio[GetModelUtilRT<"gemini">];
  vercel?: {
    [P in GetModelUtilRT<"vercel">]: undefined;
  }[GetModelUtilRT<"vercel">];
  sakana?: {
    [P in GetModelUtilRT<"sakana">]: undefined;
  }[GetModelUtilRT<"sakana">];
}[P];

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

export type GptImageOutputSize = BaseOpenAISize | undefined;

export type ImagenOutputSize =
  "1:1" | "9:16" | "16:9" | "3:4" | "4:3" | undefined;

export type OpenAIImgCapableModels =
  OpenAIImgGenFacilitatingModels | OpenAIImgGenModels;

export type GeminiImageSize = {
  "gemini-3-pro-image-preview": BaseNanoBananaOutputAR;
  "gemini-2.5-flash-image": BaseNanoBananaOutputAR;
  "gemini-3.1-flash-image-preview": NanoBanana2OutputAR;
  "gemini-3.1-flash-lite-image": NanoBanana2OutputAR;
  "deep-research-max-preview-04-2026": BaseNanoBananaOutputAR;
  "deep-research-preview-04-2026": BaseNanoBananaOutputAR;
};

export type GeminiImageQuality = {
  "gemini-3.1-flash-lite-image": "0.5K" | "1K";
  "gemini-3.1-flash-image-preview": "0.5K" | "1K" | "2K" | "4K";
  "gemini-3-pro-image-preview": "1K" | "2K" | "4K";
  "gemini-2.5-flash-image": "1K";
  "deep-research-max-preview-04-2026": "1K" | "2K" | "4K";
  "deep-research-preview-04-2026": "1K" | "2K" | "4K";
};

export type OpenAINativeImgModelQualityWorkup = Record<
  OpenAIImgGenModels,
  "low" | "medium" | "high" | "auto"
>;

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
   * **gpt-image-1**
   *
   * max: 32000 chars
   */
  text: string;
  /**
   *
   * **gpt-image-1.5, gpt-image-1 & gpt-image-1-mini**
   *
   *  default: 1,
   *  max: 10
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

export interface GptImage1Opts extends SharedOpenAIImageOpts<
  "gpt-image-1" | "gpt-image-1-mini" | "gpt-image-1.5" | "gpt-image-2"
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

export type OpenAIImageGenOpts = GptImage1Opts;

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
   * gpt-image-1 and gpt-image-1.5 only
   *
   * values include "high" | "low" | null
   */
  input_fidelity?: "high" | "low" | null | (string & {});
  /**
   * gpt-image-1.5, gpt-image-1, gpt-image-1-mini only
   *
   * values include "low" | "auto"
   */
  moderation?: "low" | "auto" | (string & {});
  /**
   * gpt-image-1.5, gpt-image-1, gpt-image-1-mini, gemini-2.5-flash-image, grok-imagine-image:
   *
   * n=1 (default),
   * n=10 (max)
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
   *  gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
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
   *  gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
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
   *  gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
   *
   * "auto" (default); "transparent" | "opaque" | "auto"
   *
   * output format must be "png" | "webp"
   */
  output_background?: "transparent" | "opaque" | "auto";
  /**
   *  gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
   *
   * "auto" (default); "low" | "medium" | "high" | "auto"
   *
   *
   * imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
   *
   * "1K" (default); "1K" | "2K"
   *
   *
   * grok-imagine-image and grok-imagine-image-quality
   *
   * "1k" | "2k" | null
   *
   */
  output_quality?: string;
  /**
   *  gpt-image-1.5, gpt-image-1, gpt-image-1-mini:
   *
   * "auto" (default); "1024x1024" | "1536x1024" | "1024x1536" | "auto"
   *
   *  imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001:
   *
   * "1:1"="1024x1024" (default) | "9:16"="768x1344" | "16:9"="1344x768" | "3:4"="864x1184" | "4:3"="1184x864"
   *
   * gemini-2.5-flash-image:
   *
   * "1:1"="1024x1024" (default) | "2:3"="832x1248" | "3:2"="1248x832" | "3:4"="864x1184" | "4:3"="1184x864" | "4:5"="896x1152" | "5:4"="1152x896" | "9:16"="768x1344" | "16:9"="1344x768" | "21:9"="1536x672"
   *
   * grok-imagine-image, grok-imagine-image-quality:
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
   * **former dall-e-3 only field**
   *
   * "vivid" (default) | "natural"
   */
  style?: string;
  /**
   * **grok-imagine-image and grok-imagine-image-quality only**
   *
   * "url" (default) | "b64_json"
   */
  response_format?: "url" | "b64_json";

  /**
   * **gpt-image-1.5, gpt-image-1, and gpt-image-1-mini only**
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
  | "AWS_BACKUP_LOW_COST_WARM"
  | "AWS_BACKUP_WARM"
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
  "queued" | "processing" | "persisting" | "finalizing" | "refusal" | "aborted";

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
  model: OpenAIImgCapableModels;
  output_quality: SharedOpenAIImageOpts<
    "gpt-image-1" | "gpt-image-1.5" | "gpt-image-1-mini" | "gpt-image-2"
  >["quality"];
  output_size: SharedOpenAIImageOpts<
    "gpt-image-1" | "gpt-image-1.5" | "gpt-image-1-mini" | "gpt-image-2"
  >["size"];
  output_background: "auto" | "transparent" | "opaque" | undefined;
  targetApi: "responses" | "images";
  partialImagesRequested: number | undefined;
  input_fidelity: "low" | "high" | undefined;
};

export type ImgGenWorkupRT<T extends OpenAiModelIdUnion> =
  T extends OpenAIImgCapableModels
    ? GptImageAndFacilitatorsImgGenWorkupRT
    : undefined;

export type ImgGenWorkupRTObj = {
  "gpt-5.6-sol": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5.6-terra": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5.6-luna": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-image-1.5": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-image-1": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-image-1-mini": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-image-2": GptImageAndFacilitatorsImgGenWorkupRT;
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
  "gpt-5.5": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5.5-pro": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5.4-pro": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5.4-mini": GptImageAndFacilitatorsImgGenWorkupRT;
  "gpt-5.4-nano": GptImageAndFacilitatorsImgGenWorkupRT;
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
  { [P in T]: ImgGenWorkupRTObj[P] }[T] | undefined;

import type { Provider } from "@/models.ts";

export type SpreadSheetExtensions = "xlsx" | "xls" | "ods" | "csv";

export type PresentationExtensions = "pptx" | "ppt" | "odp";

export type DocExtensions = "pdf" | "docx" | "doc" | "odt" | "rtf";

export type TextExtensions = "txt" | "tex";

export type EbookExtensions = "epub" | "mobi";

export type UploadMethod = "SERVER" | "PRESIGNED" | "GENERATED" | "FETCHED";

export type AssetOrigin =
  | "UPLOAD"
  | "GENERATED"
  | "REMOTE"
  | "PASTED"
  | "IMPORTED"
  | "SCRAPED"
  | "SCREENSHOT";

export type AssetUploadInstructionsMethod = "PUT" | "POST";

/**
 * Asset status lifecycle
 *
 * ```ts
 * "REQUESTED" // Presigned URL requested (legacy)
 * "PLANNED" // Generation job created
 * "UPLOADING" // Currently uploading
 * "STORED" // In S3, not verified
 * "SCANNING" // Security/virus scan
 * "READY" // Available for use, verified
 * "FAILED" // Upload/generation failed
 * "QUARANTINED" // Failed security scan
 * "ATTACHED" // Attached to a message
 * "DELETE" // Soft deleted
 * ```
 */
export type AssetStatus =
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

export type AssetUploadAbortReason =
  | "SERVER"
  | "USER"
  | "NETWORK"
  | "TIMEOUT"
  | "UNKNOWN";

export type ImgColorSpace =
  | "unknown"
  | "srgb"
  | "display_p3"
  | "adobe_rgb"
  | "prophoto_rgb"
  | "rec2020"
  | "rec709"
  | "cmyk"
  | "lab"
  | "xyz"
  | "gray";

export type ImgColorModel =
  | "rgb"
  | "rgba"
  | "grayscale"
  | "grayscale-alpha"
  | "indexed"
  | "cmyk"
  | "ycbcr"
  | "ycck"
  | "vector"
  | "lab"
  | "unknown";

export type ImgFormat =
  | "apng"
  | "png"
  | "jpeg"
  | "gif"
  | "bmp"
  | "webp"
  | "avif"
  | "svg"
  | "ico"
  | "heic"
  | "tiff"
  | "unknown";

export interface ImageSpecs {
  type: "IMAGE";
  width: number;
  height: number;
  format: ImgFormat;
  frames: number;
  animated: boolean;
  hasAlpha: boolean | null;
  /**
   * EXIF orientation (1-8) or null
   */
  orientation: number | null;
  aspectRatio: number;
  colorModel: ImgColorModel;
  colorSpace: ImgColorSpace;
  /**
   * Profile name/description if available, or 'embedded' if present but unnamed, null otherwise
   */
  iccProfile: string | null;
  /**
   * ISO-like string or null
   */
  exifDateTimeOriginal: string | null;
  metadata?: Record<string, string>;
}

export interface PdfDocSpecs {
  pdfVersion: string | null;
  isEncrypted: boolean | null;
  isSearchable: boolean | null;
  isLinearized: boolean | null;
  hasForm: boolean | null;
  hasSignatures: boolean | null;
  hasAttachments: boolean | null;
  hasJavaScript: boolean | null;
  permissions: {
    printing: boolean;
    modifying: boolean;
    copying: boolean;
    annotating: boolean;
  } | null;
}

export interface SpreadSheetDocSpecs {
  sheetCount: number | null;
  sheetNames: string[] | null;
  hasFormulas: boolean | null;
  hasMacros: boolean | null;
  hasPivotTables: boolean | null;
  hasCharts: boolean | null;
  activeSheet: number | null;
}

export interface PresentationDocSpecs {
  slideCount: number | null;
  hasAnimations: boolean | null;
  hasTransitions: boolean | null;
  hasNotes: boolean | null;
  hasMasterSlides: boolean | null;
  presentationFormat: "standard" | "widescreen" | null;
}

export interface DocSpecs {
  type: "DOCUMENT";
  format: string | null;
  mimeType: string | null;
  pageCount: number | null;
  wordCount: number | null;
  lineCount: number | null;
  language: string | null;
  encoding: string | null;
  author: string | null;
  subject: string | null;
  keywords: string[] | null;
  pdfVersion: string | null;
  isEncrypted: boolean | null;
  isSearchable: boolean | null;
  isLinearized: boolean | null;
  textPreview: string | null;
  createdDate: string | null;
  modifiedDate: string | null;
}

export type UnknownSpecs = {
  type: "UNKNOWN";
  [record: string | number | symbol]: unknown;
};

export type MetadataUnion = ImageSpecs | DocSpecs;

export type MetadataTypeUnion = MetadataUnion["type"];

export type MetadataTypeMap = {
  image_specs: ImageSpecs;
  doc_specs: DocSpecs;
};

export type MetadataMap<T extends keyof MetadataTypeMap> = {
  [P in T]: MetadataTypeMap[P];
}[T];

export type AttachmentMetadata = {
  filename: string;
  originalName?: string;
  uploadMethod?: UploadMethod;
  uploadDuration?: number;
  uploadedAt: string;
  scannedAt?: string;
  scanResult?: "clean" | "infected";
  thumbnailGenerated?: boolean;
  extractedText?: string;
  dimensions?: { width: number; height: number };
  thumbnailDimensions?: { width: number; height: number };
  quality?: number;
  duration?: number;
  [key: string]: unknown;
};

export type UserMetadata = {
  city?: string;
  region?: string;
  ip?: string;
  ua?: string;
  country?: string;
  lat?: number;
  lng?: number;
  tz?: string;
  postalCode?: string;
  locale?: string;
};

export type AIChatEventTypeUnion =
  | "chunk"
  | "error"
  | "inline_data"
  | "response";

export type S3ObjectId = `s3://${string}/${string}#${string}`;

export type AssetDraftId = `${string}~${string}~${string}~${number}`;

export type WithExpiry<K extends string> = {
  [P in K | `${K}ExpiresAt`]: P extends K ? string : number; // epoch ms
};

/**
 * BYOK handling
 */
export type RecordCountsProps = {
  isSet: Record<Provider, number>;
  isDefault: Record<Provider, number>;
};

export type ClientContextWorkupProps = {
  isSet: Record<Provider, boolean>;
  isDefault: Record<Provider, boolean>;
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
export interface SharedOpenAIImageOpts<
  T extends "gpt-image-1" | "dall-e-3" | "dall-e-2" | "gpt-image-1-mini"
> {
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
   * **dall-e-2 & gpt-image-1**
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
  model:
    | "imagen-3.0-generate-002"
    | "imagen-4.0-generate-001"
    | "imagen-4.0-ultra-generate-001"
    | "imagen-4.0-fast-generate-001";
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
  model: "grok-2-image-1212";
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

export type ImgGenStage = "queued" | "processing" | "persisting" | "finalizing" | "refusal" | "aborted";

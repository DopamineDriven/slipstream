import type { GeminiModelAspectRatio } from "@/image-gen/google.ts";
import type { GrokModelAspectRatio } from "@/image-gen/grok.ts";
import type { MetaImgSizeMap } from "@/image-gen/meta.ts";
import type { OpenAIAspectRatioRecord } from "@/image-gen/openai.ts";
import type { GetModelUtilRT, Provider } from "@/models.ts";
import type {
  DocumentSingleton,
  ImageGenOutputSingleton,
  ImageSingleton
} from "@/types.ts";
import type { Rm } from "@/utils.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";

export type OutputSizeProps<P extends Provider = Provider> = {
  openai?: OpenAIAspectRatioRecord[GetModelUtilRT<"openai">];

  minimax?: {
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
  meta?: MetaImgSizeMap[GetModelUtilRT<"meta">];
  gemini?: GeminiModelAspectRatio[GetModelUtilRT<"gemini">];
  vercel?: {
    [P in GetModelUtilRT<"vercel">]: undefined;
  }[GetModelUtilRT<"vercel">];
  sakana?: {
    [P in GetModelUtilRT<"sakana">]: undefined;
  }[GetModelUtilRT<"sakana">];
}[P];

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
  status: $Enums.AssetStatus;
  size: number | null;
  compatKey: string | null;
  compatStatus: $Enums.CompatStatus | null;
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
  checksumAlgo: $Enums.ChecksumAlgo;
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
  kind: $Enums.ImageGenOutputKind;
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

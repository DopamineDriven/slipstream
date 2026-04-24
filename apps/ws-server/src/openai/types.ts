import type { S3FinalizePayload } from "@/types/index.ts";
import type { ExpandedImgSpecs } from "@d0paminedriven/fs";
import type {
  ImgMetadataEntity,
  S3Checksum,
  S3StorageClass
} from "@slipstream/types";

export type OpenAIImgApiStreamPartial = {
  output_format: "png" | "jpeg" | "webp";
  b64_json: string;
  background: "auto" | "transparent" | "opaque";
  created_at: number;
  partial_image_index: number;
  quality: "high" | "medium" | "low" | "auto";
  size:
    | "1536x1536"
    | "2048x2048"
    | "2560x2560"
    | "2880x2880"
    | "1536x2304"
    | "2048x3072"
    | "2304x3456"
    | "2304x1536"
    | "3072x2048"
    | "3456x2304"
    | "1152x1536"
    | "1536x2048"
    | "1920x2560"
    | "2304x3072"
    | "1536x1152"
    | "2048x1536"
    | "2560x1920"
    | "3072x2304"
    | "1024x1280"
    | "1536x1920"
    | "2048x2560"
    | "2304x2880"
    | "2560x3200"
    | "1280x1024"
    | "1920x1536"
    | "2560x2048"
    | "2880x2304"
    | "3200x2560"
    | "1152x2048"
    | "1440x2560"
    | "1728x3072"
    | "2016x3584"
    | "2160x3840"
    | "2048x1152"
    | "2560x1440"
    | "3072x1728"
    | "3584x2016"
    | "3840x2160"
    | "960x1536"
    | "1280x2048"
    | "1600x2560"
    | "1920x3072"
    | "2240x3584"
    | "1536x960"
    | "2048x1280"
    | "2560x1600"
    | "3072x1920"
    | "3584x2240"
    | "1024x2048"
    | "1280x2560"
    | "1536x3072"
    | "1792x3584"
    | "1920x3840"
    | "2048x1024"
    | "2560x1280"
    | "3072x1536"
    | "3584x1792"
    | "3840x1920"
    | "864x2016"
    | "1152x2688"
    | "1440x3360"
    | "1632x3808"
    | "2016x864"
    | "2688x1152"
    | "3360x1440"
    | "3808x1632"
    | "512x1536"
    | "768x2304"
    | "1024x3072"
    | "1280x3840"
    | "1536x512"
    | "2304x768"
    | "3072x1024"
    | "3840x1280"
    | "auto"
    | "1024x1024"
    | "1024x1536"
    | "1536x1024";
};

export type OpenAIImgApiStreamFinal = {
  output_format: "png" | "jpeg" | "webp";
  b64_json: string;
  background: "auto" | "transparent" | "opaque";
  created_at: number;
  quality: "high" | "medium" | "low" | "auto";
  size:
    | "1536x1536"
    | "2048x2048"
    | "2560x2560"
    | "2880x2880"
    | "1536x2304"
    | "2048x3072"
    | "2304x3456"
    | "2304x1536"
    | "3072x2048"
    | "3456x2304"
    | "1152x1536"
    | "1536x2048"
    | "1920x2560"
    | "2304x3072"
    | "1536x1152"
    | "2048x1536"
    | "2560x1920"
    | "3072x2304"
    | "1024x1280"
    | "1536x1920"
    | "2048x2560"
    | "2304x2880"
    | "2560x3200"
    | "1280x1024"
    | "1920x1536"
    | "2560x2048"
    | "2880x2304"
    | "3200x2560"
    | "1152x2048"
    | "1440x2560"
    | "1728x3072"
    | "2016x3584"
    | "2160x3840"
    | "2048x1152"
    | "2560x1440"
    | "3072x1728"
    | "3584x2016"
    | "3840x2160"
    | "960x1536"
    | "1280x2048"
    | "1600x2560"
    | "1920x3072"
    | "2240x3584"
    | "1536x960"
    | "2048x1280"
    | "2560x1600"
    | "3072x1920"
    | "3584x2240"
    | "1024x2048"
    | "1280x2560"
    | "1536x3072"
    | "1792x3584"
    | "1920x3840"
    | "2048x1024"
    | "2560x1280"
    | "3072x1536"
    | "3584x1792"
    | "3840x1920"
    | "864x2016"
    | "1152x2688"
    | "1440x3360"
    | "1632x3808"
    | "2016x864"
    | "2688x1152"
    | "3360x1440"
    | "3808x1632"
    | "512x1536"
    | "768x2304"
    | "1024x3072"
    | "1280x3840"
    | "1536x512"
    | "2304x768"
    | "3072x1024"
    | "3840x1280"
    | "auto"
    | "1024x1024"
    | "1024x1536"
    | "1536x1024";
  usage: {
    input_tokens: number;
    input_tokens_details: {
      image_tokens: number;
      text_tokens: number;
    };
    output_tokens: number;
    total_tokens: number;
  };
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
  S3Checksum, // s3 checksum={checksumSha256, checksumAlgo}
  S3StorageClass, // s3 storage class
  string, // generationGroupId (unique resp_id via openai -> resp_0769a1845e4ca883016900c9bfb9388193a9efbb12edd87b37 )
  ImgMetadataEntity | undefined, // ImageMetadata via extractor package
  number | undefined, // upload duration
  string | undefined, // requestMessageId
  string | undefined, // jobId
  string | undefined, // revised_prompt
  S3FinalizePayload,
  ExpandedImgSpecs
];

export type ImgGenResProps = {
  /**
   * The unique ID of the image generation call.
   */
  id: string;

  /**
   * The generated image encoded in base64.
   */
  result: string | null;

  /**
   * The status of the image generation call.
   */
  status: "in_progress" | "completed" | "generating" | "failed";

  background: "opaque" | "transparent" | "auto";

  output_format: "png" | "jpeg" | "webp";
  quality: "high" | "medium" | "low" | "auto";

  revised_prompt: string | null;

  /**
   * The type of the image generation call. Always `image_generation_call`.
   */
  type: "image_generation_call";
};

export type OpenAIFileSearchToolInput =
  | {
      query: string;
      max_results?: number;
      filename?: string;
      search_terms?: string;
    }
  | {
      queries: readonly [string, ...string[]];
      max_results?: number;
      filename?: string;
      search_terms?: string;
    };

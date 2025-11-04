import { S3FinalizePayload } from "@/types/index.ts";
import { ExpandedImgSpecs } from "@d0paminedriven/metadata";
import type { ImgMetadataEntity, S3Checksum, S3StorageClass } from "@slipstream/types";

export type OpenAIImgApiStreamPartial = {
  output_format: "png" | "jpeg" | "webp";
  b64_json: string;
  background: "auto" | "transparent" | "opaque";
  created_at: number;
  partial_image_index: number;
  quality: "high" | "medium" | "low" | "auto";
  size: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
};

export type OpenAIImgApiStreamFinal = {
  output_format: "png" | "jpeg" | "webp";
  b64_json: string;
  background: "auto" | "transparent" | "opaque";
  created_at: number;
  quality: "high" | "medium" | "low" | "auto";
  size: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
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
  S3Checksum | undefined, // s3 checksum={checksumSha256, checksumAlgo}
  S3StorageClass | undefined, // s3 storage class
  string, // generationGroupId (unique resp_id via openai -> resp_0769a1845e4ca883016900c9bfb9388193a9efbb12edd87b37 )
  ImgMetadataEntity | undefined, // ImageMetadata via extractor package
  number | undefined, // upload duration
  string | undefined, // requestMessageId
  string | undefined, // jobId
  string | undefined, // revised_prompt
  S3FinalizePayload,
  ExpandedImgSpecs
];

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { PutObjectCommandInput } from "@aws-sdk/client-s3";
import { logger } from "@/logger/index.ts";

export const accountId = process.env.R2_ACCOUNT_ID ?? "";
export const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
export const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
export const bucket = process.env.R2_BUCKET ?? "t3-chat-clone-pg";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
  logger: logger
});

export async function uploadToR2({
  Key,
  Bucket = bucket,
  ContentType = "application/octet-stream",
  Body,
  ...rest
}: PutObjectCommandInput) {
  const uploadIt = await r2.send(
    new PutObjectCommand({ Bucket, Key, Body, ContentType, ...rest })
  );
  if (
    typeof uploadIt.$metadata.httpStatusCode !== "undefined" &&
    uploadIt.$metadata.httpStatusCode < 300
  ) {
    logger.info(
      { Key, Bucket, status: uploadIt.$metadata.httpStatusCode },
      "R2 upload success"
    );
    return `https://t3-clone.asrosscloud.com/${Key}`;
  } else {
    logger.error(
      { Key, Bucket, meta: uploadIt.$metadata },
      "R2 upload failure"
    );
    throw new Error(uploadIt.$metadata.requestId, {
      cause: uploadIt.$metadata
    });
  }
}

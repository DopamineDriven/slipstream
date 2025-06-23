import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { PutObjectCommandInput } from "@aws-sdk/client-s3";

export interface R2InstanceProps {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  r2PublicUrl: string;
}

export class R2Instance {
  #r2: S3Client;

  constructor(public r2Props: R2InstanceProps) {
    const { accessKeyId, accountId, secretAccessKey } = this.r2Props;
    this.#r2 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
        accountId
      }
    });
  }

  private putObjectCommand({
    Bucket,
    Key,
    ContentType = "application/octet-stream",
    Body,
    ...rest
  }: PutObjectCommandInput) {
    return new PutObjectCommand({ Bucket, Key, ContentType, Body, ...rest });
  }

  public async uploadToR2({
    Bucket,
    Key,
    ContentType = "application/octet-stream",
    Body,
    ...rest
  }: PutObjectCommandInput) {
    const upload = await this.#r2.send(
      this.putObjectCommand({ Bucket, Key, ContentType, Body, ...rest })
    );
    if (
      typeof upload.$metadata.httpStatusCode !== "undefined" &&
      upload.$metadata.httpStatusCode < 300
    ) {
      console.info(
        { Key, Bucket, status: upload.$metadata.httpStatusCode },
        "R2 upload success"
      );
      return `${this.r2Props.r2PublicUrl}/${Key}`;
    } else {
      console.error(
        { Key, Bucket, meta: upload.$metadata },
        "R2 upload failure"
      );
      throw new Error(upload.$metadata.requestId, {
        cause: upload.$metadata
      });
    }
  }
}

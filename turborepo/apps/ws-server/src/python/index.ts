import http from "http";
import { ModelService } from "@/models/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import type { EventTypeMap } from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
import { S3Storage } from "@slipstream/storage-s3";

export class PythonGenService extends ModelService {
  constructor(
    private s3: S3Storage,
    private prisma: PrismaService,
    private redis: EnhancedRedisPubSub,
    private region: string,
    private isProd: boolean,
    private globalChannel: string,
    private webhookSecret?: string
  ) {
    super();
  }

  private async readBody(req: http.IncomingMessage) {
    return await new Promise<string>((resolve, reject) => {
      let data = "";
      req.on("data", chunk => (data += chunk));
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
  }

  public async handleWebhook(
    req: http.IncomingMessage,
    res: http.ServerResponse<http.IncomingMessage> & {
      req: http.IncomingMessage;
    }
  ) {
    try {
      if (this.webhookSecret) {
        const sig = req.headers["x-python-gen-hook"];
        if (!sig || sig !== this.webhookSecret) {
          res
            .writeHead(401, { "Content-Type": "application/json" })
            .end(JSON.stringify({ ack: "unauthorized" }));
          return;
        }
      }

      const raw = await this.readBody(req);
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) {
        res
          .writeHead(400, { "Content-Type": "application/json" })
          .end(JSON.stringify({ ack: "bad_request" }));
        return;
      }
      const payload = parsed as Record<string, unknown>;
      const userId = typeof payload.userId === "string" ? payload.userId : "";
      const conversationId =
        typeof payload.conversationId === "string"
          ? payload.conversationId
          : "";
      const draftId =
        typeof payload.draftId === "string" ? payload.draftId : undefined;
      const batchId =
        typeof payload.batchId === "string" ? payload.batchId : undefined;
      const filename =
        typeof payload.filename === "string"
          ? payload.filename
          : "generated.png";
      const mime = typeof payload.mime === "string" ? payload.mime : "";
      const size = typeof payload.size === "number" ? payload.size : undefined;
      const bucket = typeof payload.bucket === "string" ? payload.bucket : "";
      const key = typeof payload.key === "string" ? payload.key : "";
      const versionId =
        typeof payload.versionId === "string" ? payload.versionId : undefined;
      const width =
        typeof payload.width === "number" ? payload.width : undefined;
      const height =
        typeof payload.height === "number" ? payload.height : undefined;
      const origin = payload.origin;
      if (origin !== "GENERATED") {
        res
          .writeHead(400, { "Content-Type": "application/json" })
          .end(JSON.stringify({ ack: "bad_origin" }));
        return;
      }

      const {
        publicUrl,
        bucket: finalBucket,
        cacheControl: _cacheControl,
        checksum: _checksum,
        contentDisposition: _contentDisposition,
        contentType,
        etag: finalEtag,
        expires: _expires,
        s3ObjectId: finalS3ObjectId,
        extension,
        key: finalKey,
        presignedUrl,
        cdnUrl,
        presignedUrlExpiresAt,
        lastModified: _lastModified,
        versionId: finalVersion,
        size: headSize,
        storageClass: _storageClass
      } = await this.s3.finalize(bucket, key, this.isProd, versionId ?? "nov");

      const attachment = await this.prisma.createAttachment({
        conversationId,
        userId,
        filename,
        region: this.region,
        mime: contentType ?? mime,
        assetType: "IMAGE",
        ext: extension,
        draftId,
        bucket: finalBucket,
        cdnUrl,
        sourceUrl: presignedUrl,
        key: finalKey,
        size: BigInt(headSize ?? size ?? 0),
        origin: "GENERATED",
        status: "READY",
        uploadMethod: "GENERATED",
        versionId: finalVersion,
        s3ObjectId: finalS3ObjectId,
        etag: finalEtag ?? undefined,
        image:
          typeof width !== "undefined" && typeof height !== "undefined"
            ? {
                width,
                height,
                frames: 1,
                aspectRatio: width && height ? width / height : 1,
                animated: false,
                colorSpace: "srgb",

                hasAlpha: false,
                orientation: null,
                iccProfile: null,
                exifDateTimeOriginal: null,
                format:
                  extension === "jpg"
                    ? "jpeg"
                    : extension === "tiff"
                      ? "tiff"
                      : (extension as
                          | "apng"
                          | "png"
                          | "webp"
                          | "avif"
                          | "gif"
                          | "tiff"
                          | "bmp"
                          | "svg"
                          | "ico"
                          | "jpeg"
                          | "heic"
                          | "jxl"
                          | "jp2"
                          | "jpx"
                          | "jxr"
                          | "jls"
                          | "raw"
                          | "dng"
                          | "cr2"
                          | "nef"
                          | "arw"
                          | "hdr"
                          | "pic"
                          | "rgbe"
                          | "xyze"
                          | "unknown")
              }
            : undefined
      });

      const meta =
        typeof width !== "undefined" && typeof height !== "undefined"
          ? {
              filename: attachment.filename ?? "",
              uploadedAt: attachment.updatedAt.toISOString(),
              dimensions: { width, height },
              uploadDuration: 0
            }
          : {
              filename: attachment.filename ?? "",
              uploadedAt: attachment.updatedAt.toISOString()
            };

      const ready = {
        type: "asset_ready",
        conversationId,
        cdnUrl,
        publicUrl,
        attachmentId: attachment.id,
        s3ObjectId: finalS3ObjectId,
        batchId,
        draftId,
        metadata: meta,
        mime: contentType ?? mime,
        origin: "GENERATED",
        size: headSize ?? size ?? 0,
        status: "READY",
        etag: attachment.etag ?? finalEtag,
        bucket: finalBucket,
        userId,
        key: finalKey,
        versionId: finalVersion,
        downloadUrl: cdnUrl,
        downloadUrlExpiresAt: presignedUrlExpiresAt
      } satisfies EventTypeMap["asset_ready"];

      // Publish to the global channel so ws-server rebroadcasts
      await this.redis.publishTypedEvent(
        this.globalChannel,
        "asset_ready",
        ready
      );

      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify({ ack: "done" }));
    } catch (err) {
      const msg = this.safeErrMsg(err);
      res
        .writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ ack: "error", message: msg }));
    }
  }
}

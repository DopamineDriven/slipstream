import http from "http";
import { timingSafeEqual } from "node:crypto";
import type { AssetType, CompatStatus } from "@slipstream/db/enums-node";
import { PrismaService } from "@/prisma/index.ts";
import * as dotenv from "dotenv";
import type { AssetOriginType } from "@slipstream/storage-s3";
import { S3Storage } from "@slipstream/storage-s3";

dotenv.config({ quiet: true });

export type AccessTokenResProps = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export class PdfService {
  /**
   * key -> clientId
   */
  private bearerMap = new Map<
    string,
    { access_token: string; expiresAt: number }
  >();
  constructor(
    private clientId: string,
    private clientSecret: string,
    private webhookSecret: string,
    private s3: S3Storage,
    private prisma: PrismaService,
    private isProd: boolean
  ) {}

  private async getAdobeAccessToken() {
    const cached = this.bearerMap.get(this.clientId);
    if (cached?.expiresAt && cached?.expiresAt - Date.now() >= 60000) {
      return cached.access_token;
    } else {
      const res = await fetch("https://ims-na1.adobelogin.com/ims/token/v3", {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
        body: new URLSearchParams([
          ["grant_type", "client_credentials"],
          ["client_id", this.clientId],
          ["client_secret", this.clientSecret],
          ["scope", "openid,AdobeID,DCAPI"]
        ])
      });
      if (!res.ok) {
        throw new Error(`Adobe auth failed: ${res.status}`);
      }
      const payload = await res.json<AccessTokenResProps>();
      this.bearerMap.set(this.clientId, {
        access_token: payload.access_token,
        expiresAt: Date.now() + payload.expires_in * 1000
      });
      return payload.access_token;
    }
  }

  public handleCompat(assetType: AssetType, ext: string | null) {
    switch (assetType) {
      case "DOCUMENT": {
        if (ext === "pdf") {
          return "ALIASED" as const satisfies CompatStatus;
        }
        return "PENDING" as const satisfies CompatStatus;
      }
      case "IMAGE": {
        if (ext === "jpg" || ext === "png" || ext === "webp") {
          return "ALIASED" as const satisfies CompatStatus;
        } else return "PENDING" as const satisfies CompatStatus;
      }
      case "AUDIO": {
        if (ext === "mp3") {
          return "ALIASED" as const satisfies CompatStatus;
        } else return "PENDING" as const satisfies CompatStatus;
      }
      case "VIDEO": {
        if (ext === "mp4") {
          return "ALIASED" as const satisfies CompatStatus;
        } else return "PENDING" as const satisfies CompatStatus;
      }
    }
  }

  private handleTarget(assetType: AssetType) {
    return assetType === "AUDIO"
      ? ("mp3" as const)
      : assetType === "DOCUMENT"
        ? ("pdf" as const)
        : assetType === "IMAGE"
          ? ("jpg" as const)
          : assetType === "VIDEO"
            ? ("mp4" as const)
            : ("pdf" as const);
  }

  private get webhookUrl() {
    return this.isProd
      ? "https://ws.aicoalesce.com/webhooks/adobe/pdf-created"
      : "http://localhost:4000/webhooks/adobe/pdf-created";
  }

  public async convertToPdf(attachment: {
    id: string;
    cdnUrl: string;
    bucket: string;
    origin: AssetOriginType;
    assetType: AssetType;
    key: string;
    mime: string | null;
    filename: string | null;
  }) {
    const target = this.handleTarget(attachment.assetType);

    const compatKey = this.s3.generateCompatKey({
      attachmentId: attachment.id,
      origin: attachment.origin,
      target
    });

    const inputUrl = await this.s3.generatePresignedDownloadCompat(
      attachment.bucket,
      attachment.key,
      3600
    );

    const outputUrl = await this.s3.generatePresignedUploadCompat(
      { attachmentId: attachment.id, origin: attachment.origin, target },
      3600
    );
    console.log("adobe-pdf-pipeline-init", {
      inputUrl: { url: inputUrl.url, expiresAt: inputUrl.expiresAt },
      outputUrl: {
        uploadUrl: outputUrl.uploadUrl,
        key: outputUrl.key,
        bucket: outputUrl.bucket,
        publicUrl: outputUrl.publicUrl,
        requiredHeaders: outputUrl.requiredHeaders,
        expiresAt: outputUrl.expiresAt,
        s3Uri: outputUrl.s3Uri
      }
    });
    // Call Adobe API
    const token = await this.getAdobeAccessToken();
    const response = await fetch(
      "https://pdf-services-ue1.adobe.io/operation/createpdf",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-api-key": this.clientId,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input: {
            uri: inputUrl.url,
            storage: "S3"
          },
          output: {
            uri: outputUrl.uploadUrl,
            storage: "S3"
          },
          params: {
            documentLanguage: "en-US"
          },
          notifiers: [
            {
              type: "CALLBACK",
              data: {
                url: this.webhookUrl,
                headers: {
                  "x-adobe-pdf-hook": this.webhookSecret,
                  "x-attachment-id": attachment.id
                }
              }
            }
          ]
        })
      }
    );
    if (!response.ok) {
      console.log("error from create pdf", {
        status: response.status,
        statusText: response.statusText,
        responseUrl: response.url
      });
      const error = await response.text();
      console.log(`full error text: ` + error);
      throw new Error(`Adobe conversion failed: ${response.status} - ${error}`);
    }
    const compatCdnUrl = this.s3.getCfUrl(this.isProd, compatKey);

    console.log(compatCdnUrl);
    return { compatCdnUrl, compatKey };
  }

  public async handleWebhook(
    req: http.IncomingMessage,
    res: http.ServerResponse<http.IncomingMessage> & {
      req: http.IncomingMessage;
    }
  ) {
    try {
      const sig = req.headers["x-adobe-pdf-hook"];
      const attachmentId = req.headers["x-attachment-id"];

      if (!attachmentId) {
        res
          .writeHead(401, { "Content-Type": "application/json" })
          .end(JSON.stringify({ ack: "unauthorized" }));
        return;
      }

      if (!sig) {
        res
          .writeHead(401, { "Content-Type": "application/json" })
          .end(JSON.stringify({ ack: "unauthorized" }));
        return;
      }
      if (!timingSafeEqual(Buffer.from(sig), Buffer.from(this.webhookSecret))) {
        res
          .writeHead(401, { "Content-Type": "application/json" })
          .end(JSON.stringify({ ack: "unauthorized" }));
        return;
      }
      const job = await this.prisma.findUniqueAttachment(attachmentId);
      if (!job) {
        res
          .writeHead(404, { "Content-Type": "application/json" })
          .end(JSON.stringify({ ack: "not_found" }));
        return;
      }

      await new Promise<void>((resolve, reject) => {
        req.on("data", () => {});
        req.on("end", () => resolve());
        req.on("error", reject);
      });

      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify({ ack: "done" }));

      setImmediate(() => {
        this.finalizeCompatAfterWebhook(attachmentId, job.origin).catch(() => {
          /* swallow; add logging if desired */
        });
      });
    } catch {
      res
        .writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ ack: "error" }));
    }
  }
  private async finalizeCompatAfterWebhook(
    attachmentId: string,
    origin: AssetOriginType
  ) {
    const compatKey = this.s3.generateCompatKey({
      attachmentId,
      origin,
      target: "pdf"
    });

    const { s3ObjectId, cdnUrlCompat, versionId } =
      await this.s3.finalizeCompatObject({
        isProd: this.isProd,
        key: compatKey,
        origin
      });

    // Idempotent DB update (single write)
    await this.prisma.updateAttachmentCompat({
      attachmentId,
      compatCdnUrl: cdnUrlCompat,
      compatKey: compatKey,
      compatReadyAt: new Date(Date.now()),
      compatStatus: "ACTIVE",
      compatVersionId: versionId,
      compatS3ObjectId: s3ObjectId,
      compatExt: "pdf",
      compatMime: "application/pdf"
    });
  }
}

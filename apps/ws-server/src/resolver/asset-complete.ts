import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import { ResolverAssetFetchService } from "@/resolver/asset-fetch.ts";
import { ExpandedImgSpecs } from "@d0paminedriven/fs";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap } from "@slipstream/types";
import type {WebSocket} from "ws";
export class ResolverAssetCompleteService extends ResolverAssetFetchService {
  constructor(
    wsServer: WSServer,
    providers: ProviderService,
    s3Service: S3Storage,
    region: string,
    imgCompatService: ImageCompatService,
    userVectorStore: UserStoreVectorService,
    xaiManagementApikey: string,
    logger: LoggerService,
    ttsService: TTSService
  ) {
    super(
      wsServer,
      providers,
      s3Service,
      region,
      imgCompatService,
      userVectorStore,
      xaiManagementApikey,
      logger,
      ttsService
    );
  }

  protected async handleAssetProgress(
    event: EventTypeMap["asset_upload_progress"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    try {
      const {
        conversationId = "new-chat",
        attachmentId,
        batchId,
        draftId,
        progress,
        bytesUploaded,
        totalBytes
      } = event;

      const redisChannel = this.resolveChannel(conversationId, userId);

      // Track active duration using high-resolution timer
      const now = process.hrtime.bigint();
      const timerKey = this.makeProgressKey(
        conversationId,
        attachmentId,
        draftId,
        batchId,
        userId
      );
      let start = this.uploadTimers.get(timerKey);
      if (!start) {
        start = now;
        this.uploadTimers.set(timerKey, start);
      }
      const elapsedMs = Number(now - start) / 1e6;

      // Passive: accept client-provided payload; lightly sanitize numbers
      const safeProgress = Number.isFinite(progress)
        ? Math.max(0, Math.min(100, Math.round(progress)))
        : 0;

      const payload = {
        type: "asset_upload_progress",
        userId,
        conversationId,
        attachmentId,
        batchId,
        draftId,
        progress: safeProgress,
        bytesUploaded: Math.max(0, bytesUploaded ?? 0),
        totalBytes: Math.max(0, totalBytes ?? 0)
      } satisfies EventTypeMap["asset_upload_progress"];

      // Debug visibility: log the event with sanitized payload and active duration
      console.log(event.type, {
        ...payload,
        elapsedMs: Number.isFinite(elapsedMs) ? +elapsedMs.toFixed(3) : 0
      });

      // Broadcast to all WS clients (passive relay; no direct echo)
      this.wsServer.broadcast("asset_upload_progress", payload);

      // Also publish to Redis so other services/consumers receive updates
      void this.wsServer.redis.publishTypedEvent(
        redisChannel,
        "asset_upload_progress",
        payload
      );

      // Cleanup timer when progress completes
      if (safeProgress >= 100) {
        this.uploadTimers.delete(timerKey);
      }
    } catch (err) {
      console.error("[Asset Progress] Error:", err);
    }
  }

  protected async handleAssetUploadComplete(
    event: EventTypeMap["asset_upload_complete"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    const {
      conversationId = "new-chat",
      attachmentId,
      publicUrl,
      bucket,
      batchId,
      draftId,
      key,
      height,
      metadata,
      width,
      duration,
      bytesUploaded,
      versionId,
      etag
    } = event;
    const redisChannel = this.resolveChannel(conversationId, userId);
    try {
      const {
        publicUrl,
        bucket: finalBucket,
        cacheControl,
        checksum,
        contentDisposition,
        contentType,
        etag: finalEtag,
        expires: expires,
        s3ObjectId: finalS3ObjectId,
        extension,
        key: finalKey,
        presignedUrl,
        cdnUrl,
        presignedUrlExpiresAt,
        lastModified,
        versionId: finalVersion,
        size,
        storageClass
      } = await this.s3Service.finalize(
        bucket,
        key,
        this.wsServer.prisma.isProd,
        versionId
      );

      const specs = await this.wsServer.prisma.extractor.extractRemote(
        cdnUrl,
        64 * 4096
      );

      const compatStatus = this.handleCompatStatus(specs, extension);

      const {
        timestamp,
        ext,
        origin,
        filename: fileName
      } = this.wsServer.prisma.urlParseNonCompat(cdnUrl);

      const filename = `${fileName}.${ext}`;
      const s3ModDate = new Date(Number.parseInt(lastModified ?? timestamp));
      const compatCdnUrl = compatStatus === "ALIASED" ? cdnUrl : undefined,
        compatExt = compatStatus === "ALIASED" ? ext : undefined,
        compatKey = compatStatus === "ALIASED" ? key : undefined,
        compatMime = compatStatus === "ALIASED" ? contentType : undefined,
        compatReadyAt = compatStatus === "ALIASED" ? s3ModDate : undefined,
        compatS3ObjectId =
          compatStatus === "ALIASED" ? finalS3ObjectId : undefined,
        compatVersionId = compatStatus === "ALIASED" ? versionId : undefined;

      const attachment = await this.wsServer.prisma.updateAttachment({
        data: {
          bucket: finalBucket,
          cacheControl,
          filename,
          checksumAlgo: checksum?.algo,
          checksumSha256: checksum?.value,
          contentDisposition,
          draftId,
          compatStatus,
          expiresAt: expires,
          s3LastModified: s3ModDate,
          storageClass,
          conversationId,
          id: attachmentId,
          key: finalKey,
          sourceUrl: presignedUrl,
          region: this.region,
          uploadDuration: duration,
          userId,
          publicUrl,
          compatCdnUrl,
          compatExt,
          compatKey,
          compatMime,
          compatReadyAt,
          compatS3ObjectId,
          compatVersionId,
          cdnUrl,
          versionId: finalVersion,
          s3ObjectId: finalS3ObjectId,
          etag: finalEtag ?? etag,
          status: "READY",
          ext,
          origin,
          mime: contentType,
          size: this.wsServer.prisma.toBigInt(size, bytesUploaded)
        },
        metadata:
          specs?.type === "IMAGE"
            ? {
                audio: undefined,
                type: "IMAGE",
                img: {
                  animated: specs.animated,
                  aspectRatio: specs.width / specs.height,
                  cameraMake: null,
                  cameraModel: null,
                  colorSpace: specs.colorSpace,
                  createdAt: undefined,
                  updatedAt: undefined,
                  lensModel: null,
                  colorModel:
                    specs.colorModel === "grayscale-alpha"
                      ? "grayscale_alpha"
                      : (specs.colorModel ?? null),
                  iccProfile: specs.iccProfile,
                  orientation: specs.orientation,
                  dominantColorHex: null,
                  exifDateTimeOriginal: specs.exifDateTimeOriginal
                    ? new Date(specs.exifDateTimeOriginal)
                    : null,
                  format: specs.format !== "unknown" ? specs.format : "jpeg",
                  frames: specs.frames,
                  gpsLat: null,
                  gpsLon: null,
                  hasAlpha: specs.hasAlpha ?? false,
                  width: specs.width,
                  height: specs.height
                },
                doc: undefined
              }
            : specs.type === "DOCUMENT"
              ? {
                  type: "DOCUMENT",
                  img: undefined,
                  audio: undefined,
                  doc: {
                    author: specs.author ?? undefined,
                    createdAt: specs.createdDate
                      ? new Date(specs.createdDate)
                      : undefined,
                    updatedAt: specs.modifiedDate
                      ? new Date(specs.modifiedDate)
                      : undefined,
                    encoding: specs.encoding ?? undefined,
                    format: specs.format ?? ext,
                    isEncrypted: specs.isEncrypted ?? undefined,
                    isLinearized: specs.isLinearized ?? false,
                    language: specs.language ?? undefined,
                    subject: specs.subject ?? undefined,
                    textPreview: specs.textPreview ?? undefined,
                    title: undefined,
                    isSearchable: specs.isSearchable ?? true,
                    wordCount: specs.wordCount ?? undefined,
                    lineCount: specs.lineCount ?? undefined,
                    keywords: specs.keywords ?? undefined,
                    pageCount: specs.pageCount ?? undefined,
                    pdfVersion: specs.pdfVersion ?? undefined
                  }
                }
              : {
                  img: undefined,
                  doc: undefined,
                  type: "AUDIO",
                  audio: {
                    duration: 0,
                    format: cdnUrl.slice(cdnUrl.lastIndexOf(".") + 1),
                    genre: null,
                    sampleRate: null,
                    title: null,
                    updatedAt: new Date(Date.now()),
                    waveformPeaks: [0],
                    year: null,
                    createdAt: new Date(Date.now()),
                    album: null,
                    artist: null,
                    attachmentId,
                    bitrate: null,
                    channels: null,
                    codec: cdnUrl.slice(cdnUrl.lastIndexOf(".") + 1)
                  }
                }
      });

      const meta = (
        metadata?.type === "DOCUMENT"
          ? {
              duration,
              extractedText: attachment.document
                ? (attachment.document.textPreview ?? undefined)
                : undefined,
              filename: attachment.filename ?? "",
              uploadedAt: attachment.updatedAt.toISOString()
            }
          : metadata?.type === "IMAGE"
            ? {
                duration: duration,
                dimensions: attachment.image
                  ? {
                      width: attachment.image.width,
                      height: attachment.image.height
                    }
                  : undefined,
                filename: attachment.filename ?? "",
                uploadDuration: duration,
                uploadedAt: attachment.updatedAt.toISOString()
              }
            : undefined
      ) satisfies EventTypeMap["asset_ready"]["metadata"];

      const assetReady = {
        type: "asset_ready",
        conversationId,
        cdnUrl: attachment.cdnUrl ?? undefined,
        publicUrl: attachment.publicUrl ?? undefined,
        attachmentId,
        s3ObjectId: finalS3ObjectId,
        batchId,
        draftId,
        metadata: meta,
        mime:
          attachment.mime ??
          contentType ??
          (metadata?.type === "IMAGE" || metadata?.type === "DOCUMENT"
            ? this.wsServer.prisma.extToContentType(metadata)
            : ""),
        origin: attachment.origin,
        size:
          this.wsServer.prisma.fromBigInt(attachment.size) ??
          bytesUploaded ??
          0,
        status: "READY",
        etag: attachment.etag ?? finalEtag ?? etag,
        bucket,
        userId,
        key,
        versionId: versionId,
        downloadUrl: cdnUrl,
        downloadUrlExpiresAt: presignedUrlExpiresAt
      } satisfies EventTypeMap["asset_ready"];

      ws.send(JSON.stringify(assetReady));
      if (
        attachment.compatStatus === "PENDING" &&
        attachment.assetType === "DOCUMENT" &&
        attachment.ext !== "pdf" &&
        attachment.ext !== "md"
      ) {
        await this.wsServer.pdfService.convertToPdf({
          assetType: attachment.assetType,
          bucket: attachment.bucket,
          cdnUrl: attachment.cdnUrl ?? "",
          filename: attachment.filename,
          id: attachment.id,
          key: attachment.key,
          mime: attachment.mime,
          origin: attachment.origin
        });
        void this.wsServer.redis.publishTypedEvent(
          redisChannel,
          "asset_ready",
          {
            ...assetReady
          }
        );
      } else if (
        attachment.compatStatus === "PENDING" &&
        attachment.assetType === "IMAGE" &&
        attachment.cdnUrl &&
        attachment.filename &&
        specs.type === "IMAGE"
      ) {
        await this.imgCompatService.convertImage({
          id: attachment.id,
          cdnUrl: attachment.cdnUrl,
          filename: attachment.filename,
          origin: attachment.origin,
          specs: specs as ExpandedImgSpecs,
          userId,
          conversationId
        });
        void this.wsServer.redis.publishTypedEvent(
          redisChannel,
          "asset_ready",
          {
            ...assetReady
          }
        );
      } else {
        void this.wsServer.redis.publishTypedEvent(
          redisChannel,
          "asset_ready",
          {
            ...assetReady
          }
        );
      }
    } catch (error) {
      console.error("[Asset Upload Complete] Error:", error);

      const uploadError = {
        type: "asset_upload_complete_error",
        userId,
        bucket,
        batchId,
        draftId,
        attachmentId,
        height,
        metadata,
        width,
        key,
        publicUrl: publicUrl.length > 1 ? publicUrl : undefined,
        bytesUploaded,
        duration: duration ?? 0,
        etag,
        versionId,
        conversationId: event.conversationId,
        success: false,
        error: this.wsServer.prisma.safeErrMsg(error)
      } satisfies EventTypeMap["asset_upload_complete_error"];

      ws.send(JSON.stringify(uploadError));

      void this.wsServer.redis.publishTypedEvent(
        redisChannel,
        "asset_upload_complete_error",
        uploadError
      );
    }
  }
}

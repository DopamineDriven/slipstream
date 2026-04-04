import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import { ResolverAssetCompatService } from "@/resolver/asset-compat.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type {
  DocumentSingleton,
  EventTypeMap,
  ImageSingleton,
  RTC
} from "@slipstream/types";
import type {WebSocket} from "ws";
export class ResolverAssetAttachOrPasteService extends ResolverAssetCompatService {
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

  protected async handleAssetAttached(
    event: EventTypeMap["asset_attached"],
    ws: WebSocket,
    userId: string,
    userData?: UserData
  ) {
    if (
      userData &&
      "city" in userData &&
      "country" in userData &&
      "postalCode" in userData &&
      "region" in userData
    ) {
      console.log(
        `user ${userId} from ${userData.city}, ${userData.region} ${userData?.postalCode} ${userData.country} attached an asset in chat driving this event.`
      );
    }
    const {
      conversationId,
      filename,
      mime,
      size,
      batchId,
      type,
      draftId,
      // TODO implement this handling
      height,
      width,
      metadata: metadata
    } = event;
    const streamChannel = this.resolveChannel(conversationId, userId);
    let attachmentId = "";
    try {
      const mimeType =
        mime === "text/markdown"
          ? "text/plain"
          : mime === "application/text"
            ? "text/plain"
            : mime;

      const extension = this.wsServer.prisma.contentTypeToExt(mime) ?? "bin";

      const properFilename = filename.includes(".")
        ? filename
        : `${filename}.${extension === "md" ? "txt" : extension}`;

      const sizeInfo = this.wsServer.prisma.getSize(size ?? 0, "auto", {
        decimals: 2,
        includeUnits: true
      });

      console.log(
        `[${type}] User ${userId} attached ${properFilename} (${sizeInfo})`
      );

      const presignedData = await this.s3Service.generatePresignedUpload(
        {
          userId,
          batchId,
          draftId,
          conversationId,
          filename: properFilename,
          contentType: mimeType,
          origin: "UPLOAD"
        },
        604800 // 1 hour expiry
      );
      // Create attachment record in database

      const docOrImg =
        mimeType.startsWith("image") && metadata?.type === "IMAGE"
          ? {
              image: {
                cameraMake: null,
                cameraModel: null,
                colorSpace: metadata?.colorSpace ?? null,
                dominantColorHex: null,
                format: metadata?.format ?? "unknown",
                frames: metadata?.frames ?? 1,
                gpsLat: null,
                gpsLon: null,
                hasAlpha: metadata?.hasAlpha ?? false,
                iccProfile: metadata?.iccProfile ?? null,
                lensModel: null,
                colorModel:
                  metadata.colorModel === "grayscale-alpha"
                    ? "grayscale_alpha"
                    : metadata.colorModel,
                orientation: metadata?.orientation ?? null,
                updatedAt: undefined,
                exifDateTimeOriginal: metadata?.exifDateTimeOriginal
                  ? new Date(metadata.exifDateTimeOriginal)
                  : null,
                animated: metadata?.animated ?? false,
                aspectRatio: metadata?.aspectRatio ?? (1.0 as const),
                width: width ?? 0,
                height: height ?? 0
              } satisfies RTC<
                ImageSingleton,
                "attachmentId" | "createdAt" | "updatedAt"
              >
            }
          : metadata?.type === "DOCUMENT" &&
              (mimeType.startsWith("application") ||
                mimeType.startsWith("text"))
            ? {
                document: {
                  title: filename,
                  attachmentId: undefined,
                  isLinearized: metadata.isLinearized,
                  format: extension === "md" ? "txt" : extension,
                  pageCount: metadata.pageCount,
                  wordCount: metadata.wordCount,
                  language: metadata.language,
                  author: metadata.author,
                  subject: metadata.subject,
                  keywords: metadata.keywords ?? [""],
                  pdfVersion: metadata.pdfVersion,
                  isEncrypted: metadata.isEncrypted ?? false,
                  isSearchable: metadata.isSearchable ?? false,
                  encoding: metadata.encoding,
                  lineCount: metadata.lineCount,
                  textPreview: metadata.textPreview
                } satisfies RTC<
                  DocumentSingleton,
                  "attachmentId" | "createdAt" | "updatedAt"
                >
              }
            : {};

      const attachment = await this.wsServer.prisma.createAttachment({
        conversationId,
        userId,
        batchId,
        filename: properFilename,
        draftId,
        region: this.region,
        ...(mimeType.startsWith("image") &&
        typeof docOrImg.image !== "undefined"
          ? { image: docOrImg.image }
          : (mimeType.startsWith("text") ||
                mimeType.startsWith("application")) &&
              typeof docOrImg.document !== "undefined"
            ? { document: docOrImg?.document }
            : {}),
        mime: mimeType,
        assetType: this.wsServer.prisma.handleAssetType(mimeType),
        ext: extension === "md" ? "txt" : extension,
        bucket: presignedData.bucket,
        cdnUrl: presignedData.publicUrl,
        sourceUrl: presignedData.uploadUrl,
        key: presignedData.key,
        size: BigInt(size),
        origin: "UPLOAD",
        status: "REQUESTED",
        uploadMethod: "PRESIGNED"
      });
      console.log(
        `[Asset Attached] Created attachment ${attachment.id} with key: ${presignedData.key}`
      );

      const uploadInstructions = {
        type: "asset_upload_instructions",
        conversationId,
        attachmentId: attachment.id,
        bucket: presignedData.bucket,
        batchId: presignedData.batchId,
        draftId: presignedData.draftId,
        key: presignedData.key,
        userId,
        mimeType,
        uploadUrl: presignedData.uploadUrl,
        expiresIn: presignedData.expiresAt,
        method: "PUT",
        requiredHeaders: presignedData.requiredHeaders
      } satisfies EventTypeMap["asset_upload_instructions"];
      // Send presigned URL to client for direct upload

      ws.send(JSON.stringify(uploadInstructions));

      // Notify other participants via Redis
      void this.wsServer.redis.publishTypedEvent(
        streamChannel,
        "asset_upload_progress",
        {
          type: "asset_upload_progress",
          userId,
          conversationId,
          batchId,
          draftId,
          attachmentId: attachment.id,
          progress: 0,
          bytesUploaded: 0,
          totalBytes: size ?? 0
        } satisfies EventTypeMap["asset_upload_progress"]
      );
      // TODO implement polling REQUESTED -> UPLOADING -> READY via a listener--alternatively have the client send an event
    } catch (error) {
      console.error("[Asset Paste] Error:", error);

      const uploadError = {
        type: "asset_upload_error",
        userId,
        attachmentId,
        batchId,
        draftId,
        conversationId: event.conversationId,
        success: false,
        error: this.wsServer.prisma.safeErrMsg(error)
      } satisfies EventTypeMap["asset_upload_error"];

      ws.send(JSON.stringify(uploadError));

      void this.wsServer.redis.publishTypedEvent(
        streamChannel,
        "asset_upload_error",
        uploadError
      );
    }
  }

  protected async handleAssetPaste(
    event: EventTypeMap["asset_paste"],
    ws: WebSocket,
    userId: string,
    userData?: UserData
  ): Promise<void> {
    if (
      userData &&
      "city" in userData &&
      "country" in userData &&
      "postalCode" in userData &&
      "region" in userData
    ) {
      console.log(
        `user ${userId} from ${userData.city}, ${userData.region} ${userData?.postalCode} ${userData.country} pasted an asset in chat driving this event.`
      );
    }
    const {
      conversationId,
      filename,
      mime,
      size,
      batchId,
      draftId,
      // TODO address integrating these fields
      height,
      width,
      metadata
    } = event;
    const streamChannel = this.resolveChannel(conversationId, userId);
    let attachmentId = "";
    try {
      const mimeType = mime;

      const extension =
        this.wsServer.prisma.contentTypeToExt(mimeType) ?? "bin";

      const properFilename = filename.includes(".")
        ? filename
        : `${filename}.${extension}`;

      // ✅ Use fs package for human-readable size logging
      const sizeInfo = this.wsServer.prisma.getSize(size ?? 0, "auto", {
        decimals: 2,
        includeUnits: true
      });

      console.log(
        `[Asset Paste] User ${userId} pasting ${properFilename} (${sizeInfo})`
      );

      const presignedData = await this.s3Service.generatePresignedUpload(
        {
          userId,
          batchId,
          draftId,
          conversationId,
          filename: properFilename,
          contentType: mimeType,
          origin: "PASTED"
        },
        3600 // 1 hour expiry
      );

      const docOrImg =
        metadata && mimeType.startsWith("image") && metadata?.type === "IMAGE"
          ? {
              image: {
                cameraMake: null,
                cameraModel: null,
                colorSpace: metadata?.colorSpace ?? null,
                dominantColorHex: null,
                format: metadata?.format,
                frames: metadata?.frames ?? 1,
                gpsLat: null,
                gpsLon: null,
                colorModel:
                  metadata.colorModel === "grayscale-alpha"
                    ? "grayscale_alpha"
                    : metadata.colorModel,
                hasAlpha: metadata?.hasAlpha ?? false,
                iccProfile: metadata?.iccProfile ?? null,
                lensModel: null,
                orientation: metadata?.orientation ?? null,
                updatedAt: undefined,
                exifDateTimeOriginal: metadata?.exifDateTimeOriginal
                  ? new Date(metadata.exifDateTimeOriginal)
                  : null,
                animated: metadata?.animated ?? false,
                aspectRatio: metadata?.aspectRatio ?? (1.0 as const),
                width: width ?? metadata.width,
                height: height ?? metadata.height
              } satisfies RTC<
                ImageSingleton,
                "attachmentId" | "createdAt" | "updatedAt"
              >
            }
          : metadata?.type === "DOCUMENT" &&
              (mimeType.startsWith("application") ||
                mimeType.startsWith("text"))
            ? {
                document: {
                  title: filename,
                  attachmentId: undefined,
                  format: metadata?.format ?? extension,
                  pageCount: metadata.pageCount,
                  wordCount: metadata.wordCount,
                  language: metadata.language,
                  author: metadata.author,
                  isLinearized: metadata.isLinearized ?? false,
                  subject: metadata.subject,
                  keywords: metadata.keywords ?? [""],
                  pdfVersion: metadata.pdfVersion,
                  isEncrypted: metadata.isEncrypted ?? false,
                  isSearchable: metadata.isSearchable ?? true,
                  encoding: metadata.encoding,
                  lineCount: metadata.lineCount,
                  textPreview: metadata.textPreview
                } satisfies RTC<
                  DocumentSingleton,
                  "attachmentId" | "createdAt" | "updatedAt"
                >
              }
            : {};

      // Create attachment record in database
      const attachment = await this.wsServer.prisma.createAttachment({
        conversationId,
        userId,
        batchId,
        filename: properFilename,
        region: this.region,
        ...(mimeType.startsWith("image") &&
        typeof docOrImg.image !== "undefined"
          ? { image: docOrImg.image }
          : (mimeType.startsWith("text") ||
                mimeType.startsWith("application")) &&
              typeof docOrImg.document !== "undefined"
            ? { document: docOrImg?.document }
            : {}),
        mime: mimeType,
        assetType: this.wsServer.prisma.handleAssetType(mimeType),
        ext: extension,
        draftId,
        bucket: presignedData.bucket,
        cdnUrl: presignedData.publicUrl,
        sourceUrl: presignedData.uploadUrl,
        key: presignedData.key,
        size: BigInt(size),
        origin: "PASTED",
        status: "REQUESTED",
        uploadMethod: "PRESIGNED"
      });
      console.log(
        `[Asset Paste] Created attachment ${attachment.id} with key: ${presignedData.key}`
      );

      const uploadInstructions = {
        type: "asset_upload_instructions", // Changed event type
        conversationId,
        attachmentId: attachment.id,
        bucket: presignedData.bucket,
        batchId,
        draftId,
        mimeType,
        key: presignedData.key,
        userId,
        uploadUrl: presignedData.uploadUrl,
        expiresIn: presignedData.expiresAt,
        method: "PUT",
        requiredHeaders: presignedData.requiredHeaders
      } satisfies EventTypeMap["asset_upload_instructions"];
      // Send presigned URL to client for direct upload

      ws.send(JSON.stringify(uploadInstructions));

      // Notify other participants via Redis
      void this.wsServer.redis.publishTypedEvent(
        streamChannel,
        "asset_upload_progress",
        {
          type: "asset_upload_progress",
          userId,
          batchId,
          draftId,
          conversationId,
          attachmentId: attachment.id,
          progress: 0,
          bytesUploaded: 0,
          totalBytes: size ?? 0
        } satisfies EventTypeMap["asset_upload_progress"]
      );
    } catch (error) {
      console.error("[Asset Paste] Error:", error);

      const uploadError = {
        type: "asset_upload_error",
        userId,
        attachmentId,
        batchId,
        draftId,
        conversationId: event.conversationId,
        success: false,
        error: this.wsServer.prisma.safeErrMsg(error)
      } satisfies EventTypeMap["asset_upload_error"];

      ws.send(JSON.stringify(uploadError));

      void this.wsServer.redis.publishTypedEvent(
        streamChannel,
        "asset_upload_error",
        uploadError
      );
    }
  }
}

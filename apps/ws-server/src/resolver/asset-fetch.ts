import { PassThrough, Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";
import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import { ResolverAssetAttachOrPasteService } from "@/resolver/asset-attach-or-paste.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap } from "@slipstream/types";
import type {WebSocket} from "ws";
export class ResolverAssetFetchService extends ResolverAssetAttachOrPasteService {
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

  protected async handleAssetFetchRequest(
    event: EventTypeMap["asset_fetch_request"],
    ws: WebSocket,
    userId: string,
    userData?: UserData
  ) {
    const _userData = userData;
    const { conversationId = "new-chat", sourceUrl } = event;

    console.log(`[Asset Fetch] User ${userId} requesting: ${sourceUrl}`);

    try {
      // 1. Validate URL
      if (!this.wsServer.prisma.isValidUrl(sourceUrl)) {
        throw new Error(`Invalid URL: ${sourceUrl}`);
      }

      // 2. Get file metadata with HEAD request

      const headResponse = await fetch(sourceUrl, { method: "HEAD" });
      if (!headResponse.ok) {
        throw new Error(`Failed to access URL: ${headResponse.status}`);
      }
      // TODO USE THIS FOR IMPLEMENTING IMAGE GENERATION
      // const meta = await this.extract.extractRemote(sourceUrl);

      // const specs =this.handleMetadata(meta);
      // if (specs.type==="IMAGE" && specs.img) {
      //   const _spec = specs.img;
      // }
      const contentLength = headResponse.headers.get("content-length");
      const contentType =
        headResponse.headers.get("content-type") ?? "application/octet-stream";

      const ext = this.wsServer.prisma.contentTypeToExt(contentType) ?? "bin";

      const fileSizeBytes = contentLength ? parseInt(contentLength, 10) : 0;

      // 3. Extract filename from URL
      const urlPath = new URL(sourceUrl).pathname;
      const urlFilename = urlPath.split("/")?.pop() ?? `remote_${Date.now()}`;
      const extension = ext;
      const filename = urlFilename.includes(".")
        ? urlFilename
        : `${urlFilename}.${extension}`;
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

      // 4. Check file size limit
      const MAX_SIZE_MB = 100;
      if (fileSizeBytes && fileSizeBytes > MAX_SIZE_MB * 1024 * 1024) {
        throw new Error(
          `File too large: ${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`
        );
      }

      // 5. Setup Redis channel for progress updates
      const streamChannel =
        conversationId === "new-chat"
          ? this.redisChannels.user(userId)
          : this.redisChannels.conversationStream(conversationId);

      // 6. Send initial progress
      const startProgress = {
        type: "asset_upload_progress",
        conversationId,
        attachmentId: "", // Will be filled later
        progress: 0,
        userId,
        bytesUploaded: 0,
        totalBytes: fileSizeBytes
      } satisfies EventTypeMap["asset_upload_progress"];
      ws.send(JSON.stringify(startProgress));

      // 7. Fetch the actual content
      const response = await fetch(sourceUrl);
      if (!response.body) {
        throw new Error(`Failed to download: ${response.status}`);
      }

      // 8. Setup streaming upload to S3
      // Create a PassThrough stream to track progress
      const passThrough = new PassThrough();
      let uploadedBytes = 0;
      let lastProgressUpdate = Date.now();

      // Convert web stream to Node stream
      const nodeStream = Readable.fromWeb(response.body as ReadableStream);

      // Track progress as data flows through
      nodeStream.on("data", (chunk: Uint8Array<ArrayBuffer>) => {
        uploadedBytes += chunk.length;

        // Throttle progress updates to every 100ms
        const now = Date.now();
        if (now - lastProgressUpdate > 100) {
          const progress = fileSizeBytes
            ? Math.min(100, Math.round((uploadedBytes / fileSizeBytes) * 100))
            : 0;

          const progressEvent = {
            type: "asset_upload_progress",
            conversationId,
            userId,
            attachmentId: "",
            progress,
            bytesUploaded: uploadedBytes,
            totalBytes: fileSizeBytes
          } satisfies EventTypeMap["asset_upload_progress"];

          ws.send(JSON.stringify(progressEvent));
          lastProgressUpdate = now;
        }
      });

      // Pipe the node stream to passThrough
      nodeStream.pipe(passThrough);

      // 9. Upload to S3 (streaming)
      const s3Result = await this.s3Service.uploadDirect(passThrough, {
        userId,
        conversationId,
        filename: sanitizedFilename,
        contentType,
        size: fileSizeBytes,
        origin: "REMOTE"
      });

      // 10. Create database record
      const attachment = await this.wsServer.prisma.createAttachment({
        conversationId,
        userId,
        filename: sanitizedFilename,
        region: this.region,
        mime: contentType,
        bucket: s3Result.bucket,
        cdnUrl: s3Result.publicUrl,
        s3ObjectId: s3Result.s3ObjectId,
        versionId: s3Result.versionId,
        sourceUrl,
        checksumAlgo: s3Result.checksum?.algo,
        checksumSha256: s3Result.checksum?.value,
        key: s3Result.key,
        size: BigInt(uploadedBytes), // Use actual uploaded size
        origin: "REMOTE",
        status: "READY",
        uploadMethod: "FETCHED",
        ext: extension,
        etag: s3Result.etag
      });

      // 11. Send final progress
      const finalProgress = {
        type: "asset_upload_progress",
        conversationId,
        attachmentId: attachment.id,
        userId,
        progress: 100,
        bytesUploaded: uploadedBytes,
        totalBytes: fileSizeBytes
      } satisfies EventTypeMap["asset_upload_progress"];
      ws.send(JSON.stringify(finalProgress));

      // 12. Send success response
      const successEvent = {
        type: "asset_fetch_response",
        conversationId,
        attachmentId: attachment.id,
        userId,
        sourceUrl: sourceUrl,
        s3ObjectId: s3Result.s3ObjectId,
        bucket: s3Result.bucket,
        downloadUrl: s3Result.publicUrl,
        downloadUrlExpiresAt: attachment.expiresAt?.valueOf(),
        key: s3Result.key,
        versionId: s3Result.versionId,
        error: undefined,
        success: true
      } satisfies EventTypeMap["asset_fetch_response"];
      ws.send(JSON.stringify(successEvent));

      // 13. Notify via Redis
      void this.wsServer.redis.publishTypedEvent(
        streamChannel,
        "asset_uploaded",
        {
          type: "asset_uploaded",
          conversationId,
          attachmentId: attachment.id,
          userId,
          filename: sanitizedFilename,
          mime: contentType,
          etag: s3Result.etag,
          size: uploadedBytes,
          s3ObjectId: s3Result.s3ObjectId,
          versionId: s3Result.versionId,
          uploadUrl: s3Result.publicUrl,
          bucket: s3Result.bucket,
          uploadUrlExpiresAt:
            attachment.expiresAt?.valueOf() ?? Date.now() * 3600 * 1000,
          key: s3Result.key,
          downloadUrl: s3Result.publicUrl,
          downloadUrlExpiresAt:
            attachment.expiresAt?.valueOf() ?? Date.now() * 3600 * 1000,
          origin: "REMOTE",
          status: "READY"
        }
      );
    } catch (error) {
      console.error("[Asset Fetch] Error:", error);

      const errorEvent = {
        type: "asset_fetch_error",
        conversationId,
        userId,
        sourceUrl,
        success: false,
        error: this.wsServer.prisma.safeErrMsg(error)
      } satisfies EventTypeMap["asset_fetch_error"];

      ws.send(JSON.stringify(errorEvent));
    }
  }
  /**
   * Batch fetch multiple URLs
   * Useful for fetching multiple images from a webpage or gallery
   */
  protected async handleBatchAssetFetch(
    urls: string[],
    conversationId: string,
    userId: string,
    ws: WebSocket,
    userData?: UserData
  ): Promise<{
    successful: string[];
    failed: { url: string; error: string }[];
  }> {
    const successful = Array.of<string>();
    const failed = Array.of<{ url: string; error: string }>();

    // Process in parallel with concurrency limit
    const CONCURRENCY_LIMIT = 3;
    const chunks = this.wsServer.prisma.chunkArray(urls, CONCURRENCY_LIMIT);

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(url =>
          this.handleAssetFetchRequest(
            {
              type: "asset_fetch_request",
              conversationId,
              sourceUrl: url
            },
            ws,
            userId,
            userData
          )
        )
      );

      results.forEach((result, index) => {
        if (chunk[index]) {
          if (result.status === "fulfilled") {
            successful.push(chunk[index]);
          } else {
            failed.push({
              url: chunk[index],
              error: this.wsServer.prisma.safeErrMsg(result?.status)
            });
          }
        } else {
          throw new Error(
            "error in handleBatchAssetFetch -- no chunk[index] values mapped"
          );
        }
      });
    }

    return { successful, failed };
  }
}

import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { WebSocket } from "ws";
import { ResolverChatUtilsService } from "@/resolver/chat-utils.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap } from "@slipstream/types";

export class ResolverTTSService extends ResolverChatUtilsService {
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

  protected async handleUserTTSRequest(
    event: EventTypeMap["user_tts_request"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    const { messageId, conversationId } = event;
    const voice = event.voice ?? "eve";
    const language = event.language ?? "auto";
    const codec = event.codec ?? "mp3";
    const sampleRate = event.sampleRate ?? 24000;
    const bitRate = event.bitRate ?? 128000;

    try {
      const getIt = this.ttsService.ttsJobCache.get(
        `${event.conversationId}:${event.messageId}`
      );
      if (getIt?.status === "COUPLED" && getIt?.cdnUrl && getIt?.attachmentId) {
        ws.send(
          JSON.stringify({
            type: "user_tts_response",
            ttsJobId: getIt.id,
            attachmentId: getIt.attachmentId,
            conversationId,
            messageId,
            durationMs: getIt?.durationMs ?? 0,
            generationMs: getIt?.generationMs ?? 0,
            size: getIt?.sizeBytes ?? 0,
            cdnUrl: getIt?.cdnUrl,
            codec: codec
          } satisfies EventTypeMap["user_tts_response"])
        );
        return;
      } else {
        // In-flight guard — skip if already streaming for this message
        if (this.ttsService.inflight.has(messageId)) return;

        const existing = await this.wsServer.prisma.findExistingTTSJob(
          messageId,
          userId
        );
        if (
          existing?.status === "COUPLED" &&
          existing.cdnUrl &&
          existing.attachmentId
        ) {
          ws.send(
            JSON.stringify({
              type: "user_tts_response",
              ttsJobId: existing.id,
              attachmentId: existing.attachmentId,
              conversationId,
              messageId,
              durationMs: existing.durationMs ?? 0,
              generationMs: existing.generationMs ?? 0,
              size: existing.sizeBytes,
              cdnUrl: existing.cdnUrl,
              codec: codec
            } satisfies EventTypeMap["user_tts_response"])
          );
          return;
        }
        // FAILED — delete stale record before retry
        if (existing?.status === "FAILED") {
          await this.wsServer.prisma.deleteTTSJob(existing.id);
        }
      }

      const message = await this.wsServer.prisma.getMsgContentForTTS(messageId);
      const messageText = this.ttsService.messageText(message);

      const ttsJob = await this.wsServer.prisma.createTTSJob({
        sourceMessageId: messageId,
        userId,
        provider: "GROK",
        conversationId,
        voice,
        language,
        codec,
        sampleRate,
        bitrate: bitRate,
        charCount: messageText.length
      });

      this.ttsService.streamToClient(
        ws,
        conversationId,
        messageId,
        userId,
        messageText,
        ttsJob,
        voice,
        language,
        codec,
        sampleRate,
        bitRate
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "TTS request failed";
      this.logger.error(
        { messageId, userId, error: msg },
        "handleUserTTSRequest failed"
      );
      ws.send(
        JSON.stringify({
          type: "user_tts_error",
          status: 404,
          statusText: msg,
          conversationId,
          messageId
        } satisfies EventTypeMap["user_tts_error"])
      );
    }
  }
}

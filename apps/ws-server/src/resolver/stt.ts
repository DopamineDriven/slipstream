import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { STTService } from "@/stt/index.ts";
import type { TTSService } from "@/tts/index.ts";
import type { UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { WebSocket } from "ws";
import { ResolverChatUtilsService } from "@/resolver/chat-utils.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap } from "@slipstream/types";

export class ResolverSTTService extends ResolverChatUtilsService {
  constructor(
    wsServer: WSServer,
    providers: ProviderService,
    s3Service: S3Storage,
    region: string,
    imgCompatService: ImageCompatService,
    userVectorStore: UserStoreVectorService,
    xaiManagementApikey: string,
    logger: LoggerService,
    ttsService: TTSService,
    protected sttService: STTService
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

  private readonly MAX_KEYTERMS = 100;
  private readonly MAX_KEYTERM_CHARS = 50;

  private sttError(
    ws: WebSocket,
    draftId: string,
    status: number,
    statusText: string
  ) {
    ws.send(
      JSON.stringify({
        type: "stt_user_error",
        draftId,
        status,
        statusText
      } satisfies EventTypeMap["stt_user_error"])
    );
  }

  protected coupleDictations({
    conversationId,
    messageOrdinal,
    userId,
    messageId,
    sttBatchId
  }: {
    userId: string;
    conversationId: string;
    messageOrdinal: number;
    messageId?: string;
    sttBatchId?: string;
  }) {
    if (typeof sttBatchId === "string" && typeof messageId === "string") {
      void this.wsServer.prisma
        .dictationCouple(sttBatchId, userId, {
          conversationId,
          messageId,
          messageOrdinal
        })
        .then(() => this.sttService.forgetBatch(userId, sttBatchId))
        .catch(err => {
          console.warn(
            `dictation coupling failed: ` + this.wsServer.prisma.safeErrMsg(err)
          );
        });
    }
  }
  /**
   * the one ownership check — client-minted draftId vs the socket's session
   * userId; frame/finish/present are bound to the live session on `ws`
   * instead, so they never re-parse
   */
  private ownsDraft(ws: WebSocket, userId: string, draftId: string) {
    if (!this.wsServer.prisma.canParseDraftId(draftId)) {
      this.sttError(ws, draftId, 400, "malformed draftId");
      return null;
    }
    const parsed = this.wsServer.prisma.draftIdEpimerize(draftId);
    if (parsed.userId !== userId) {
      this.sttError(ws, draftId, 403, "draft owner mismatch");
      return null;
    }
    return parsed;
  }

  private clampInt(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, Math.round(value)));
  }

  /** synchronous forward — nothing may be awaited before `pushFrame` */
  protected async sttUserBinaryFrame(
    event: EventTypeMap["stt_user_binary_frame"],
    ws: WebSocket,
    _userId: string,
    _userData?: UserData
  ) {
    this.sttService.pushFrame(ws, event);
  }

  protected async sttUserCancel(
    event: EventTypeMap["stt_user_cancel"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    if (!this.ownsDraft(ws, userId, event.draftId)) return;
    await this.sttService.cancel(ws, userId, event);
  }

  protected async sttUserConnect(
    event: EventTypeMap["stt_user_connect"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    const parsed = this.ownsDraft(ws, userId, event.draftId);
    if (!parsed) return;
    if (
      parsed.batchId !== event.batchId ||
      parsed.dictationOrdinal !== event.ordinal ||
      (parsed.isNewConvo ? null : parsed.convoId) !== event.conversationId
    ) {
      this.sttError(ws, event.draftId, 400, "draftId constituents mismatch");
      return;
    }
    if (!this.sttService.isValidSampleRate(event.sampleRate)) {
      this.sttError(ws, event.draftId, 400, "unsupported sampleRate");
      return;
    }

    // explicit field pick — unknown client keys never reach the row
    const sanitized = {
      type: event.type,
      diarize: event.diarize ?? false,
      endpointing: event.endpointing,
      fillerWords: event.fillerWords,
      inputSampleRate: event.inputSampleRate,
      keyterms: event.keyterms,
      language:
        event.language && this.sttService.isValidLanguage(event.language)
          ? event.language
          : undefined,
      vadThreshold: event.vadThreshold,
      draftId: event.draftId,
      batchId: event.batchId,
      ordinal: event.ordinal,
      conversationId: event.conversationId,
      sampleRate: event.sampleRate
    } satisfies EventTypeMap["stt_user_connect"];
    if (typeof event.inputSampleRate === "number" && event.inputSampleRate) {
      sanitized.inputSampleRate = Math.round(event.inputSampleRate);
    }
    if (
      typeof event.language === "string" &&
      this.sttService.isValidLanguage(event.language)
    ) {
      sanitized.language = event.language;
    }
    if (Array.isArray(event.keyterms)) {
      const keyterms = event.keyterms
        .filter(
          k =>
            k.length > 0 &&
            k.length <= this.MAX_KEYTERM_CHARS &&
            !k.includes("::")
        )
        .slice(0, this.MAX_KEYTERMS);
      if (keyterms.length > 0) sanitized.keyterms = keyterms;
    }
    if (
      typeof event.endpointing === "number" &&
      Number.isFinite(event.endpointing)
    ) {
      sanitized.endpointing = this.clampInt(event.endpointing, 0, 5000);
    }
    if (typeof event.diarize === "boolean") sanitized.diarize = event.diarize;
    if (typeof event.fillerWords === "boolean") {
      sanitized.fillerWords = event.fillerWords;
    }
    if (
      typeof event.vadThreshold === "number" &&
      Number.isFinite(event.vadThreshold)
    ) {
      sanitized.vadThreshold = Math.min(1, Math.max(0, event.vadThreshold));
    }

    await this.sttService.connect(ws, userId, sanitized);
  }

  protected async sttUserFinish(
    event: EventTypeMap["stt_user_finish"],
    ws: WebSocket,
    _userId: string,
    _userData?: UserData
  ) {
    this.sttService.finish(ws, event);
  }

  protected async sttUserPresent(
    event: EventTypeMap["stt_user_present"],
    ws: WebSocket,
    _userId: string,
    _userData?: UserData
  ) {
    this.sttService.present(ws, event);
  }

  protected async sttUserRecover(
    event: EventTypeMap["stt_user_recover"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    await this.sttService.recover(ws, userId, event);
  }

  protected async sttUserRestore(
    event: EventTypeMap["stt_user_restore"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    if (!this.ownsDraft(ws, userId, event.draftId)) return;
    await this.sttService.restore(ws, userId, event);
  }
}

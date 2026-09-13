import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { EventTypeMap, STTTypes } from "@slipstream/types";
import type { Logger as PinoLogger } from "pino";
import type { RawData, WebSocket } from "ws";
import { WebSocket as TTSWebSocket } from "ws";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";

export class STTService {
    private readonly sessions = new Map<WebSocket, STTTypes.Session>();
  protected readonly baseSTTUrl = "wss://api.x.ai/v1/stt";
  protected logger: PinoLogger;

  constructor(
    protected redis: EnhancedRedisPubSub,
    logger: LoggerService,
    protected prisma: PrismaService,
    protected apiKey: string
  ) {
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[stt] " }
      );
  }

  public isValidEncoding(encoding: string) {
    return (
      encoding === "opus" ||
      encoding === "pcm" ||
      encoding === "mulaw" ||
      encoding === "alaw"
    );
  }

  public isValidSampleRate(s: number) {
    return (
      s === 8000 ||
      s === 16000 ||
      s === 22050 ||
      s === 24000 ||
      s === 44100 ||
      s === 48000
    );
  }

/**
 * supports `"ar" | "cs" | "da" | "de" | "en" | "es" | "fa" | "fil" | "fr" | "hi" | "id" | "it" | "ja" | "ko" | "mk" | "ms" | "nl" | "pl" | "pt" | "ro" | "ru" | "sv" | "th" | "tr" | "vi"`
 *
 * see https://docs.x.ai/developers/model-capabilities/audio/speech-to-text#supported-languages
 */
  public isValidLanguage(l: string) {
    return (
      l === "ar" ||
      l === "cs" ||
      l === "da" ||
      l === "de" ||
      l === "en" ||
      l === "es" ||
      l === "fa" ||
      l === "fil" ||
      l === "fr" ||
      l === "hi" ||
      l === "id" ||
      l === "it" ||
      l === "ja" ||
      l === "ko" ||
      l === "mk" ||
      l === "ms" ||
      l === "nl" ||
      l === "pl" ||
      l === "pt" ||
      l === "ro" ||
      l === "ru" ||
      l === "sv" ||
      l === "th" ||
      l === "tr" ||
      l === "vi"
    );
  }

  //   public async connect(ws: WebSocket, userId: string, ev: EventTypeMap["stt_user_connect"]) {
  //   if (this.sessions.has(ws)) return this.error(ws, ev.draftId, 409, "session already live");
  //   const [ownerId] = parseDraftId(ev.draftId);
  //   if (ownerId !== userId) return this.prisma.safeErrMsg(ws, ev.draftId, 403, "draft owner mismatch");

  //   const session = { draftId: ev.draftId, userId, ws, xaiClient: null,
  //     phase: "starting", expectedFrameOrdinal: 0, lastUtteranceAt: Date.now(),
  //     idleTimer: null, closeTimer: null, finalReceived: false,
  //     segments: Array.of<{ text: string; start: number; duration: number }>()
  //   } satisfies STTSession;
  //   this.sessions.set(ws, session);                     // reserved before any await

  //   await this.prisma.dictationInsert({ ...ev, userId }); // row durable BEFORE the provider
  //   const leased = await this.redis.setNx(`stt:own:${userId}:${ev.draftId}`, this.runId, LEASE_S);
  //   if (!leased) return this.fail(session, "INTERNAL_ERROR", "draftId already owned");

  //   this.openXaiClient(session, ev);
  // }
}

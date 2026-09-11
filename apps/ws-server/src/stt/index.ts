import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { STTTypes } from "@/stt/types.ts";
import type { Logger as PinoLogger } from "pino";
import type { RawData, WebSocket } from "ws";
import { WebSocket as TTSWebSocket } from "ws";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";

export class STTService {
  protected readonly baseSTTUrl = "wss://api.x.ai/v1/stt";
  protected logger: PinoLogger;

  constructor(
    protected redis: EnhancedRedisPubSub,
    protected s3: S3Storage,
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
}

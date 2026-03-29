import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { Logger as PinoLogger } from "pino";
import { WebSocket as TTSWebSocket } from "ws";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type {
  GrokAudioCodecTTS,
  GrokBitRateTTS,
  GrokSampleRateTTS,
  GrokVoiceTTS
} from "@slipstream/types";

export class TTSService {
  protected readonly baseTTSUrl = "wss://api.x.ai/v1/tts";
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
        { msgPrefix: "[tts] " }
      );
  }

  private mapSearchParams(
    params: readonly [string, string | number | boolean][] | string[][]
  ) {
    return params
      .reduce<string[]>((arr, [k, v]) => {
        if (v) arr.push(`${k}=${encodeURIComponent(v)}`);
        return arr;
      }, [])
      .join("&");
  }

  private isValidCodec(codec: string) {
    return (
      codec === "mp3" ||
      codec === "wav" ||
      codec === "pcm" ||
      codec === "mulaw" ||
      codec === "alaw"
    );
  }

  private isValidVoice(v: string) {
    return (
      v === "eve" ||
      v === "ara" ||
      v === "leo" ||
      v === "rex" ||
      v === "sal" ||
      v === "una"
    );
  }

  private isValidSampleRate(s: number) {
    return (
      s === 8000 ||
      s === 16000 ||
      s === 22050 ||
      s === 24000 ||
      s === 44100 ||
      s === 48000
    );
  }

  private isValidBitRate(s: number) {
    return (
      s === 32000 || s === 64000 || s === 96000 || s === 128000 || s === 192000
    );
  }

  private isValidLanguage(l: string) {
    return (
      l === "auto" ||
      l === "en" ||
      l === "es-MX" ||
      l === "es-ES" ||
      l === "id" ||
      l === "ar-EG" ||
      l === "ar-SA" ||
      l === "ar-AE" ||
      l === "bn" ||
      l === "zh" ||
      l === "fr" ||
      l === "de" ||
      l === "hi" ||
      l === "it" ||
      l === "ja" ||
      l === "ko" ||
      l === "pt-BR" ||
      l === "pt-PT" ||
      l === "ru" ||
      l === "tr" ||
      l === "vi"
    );
  }

  protected buildWssUrl(
    voice_id = "eve",
    language = "auto",
    output_format?: {
      codec?: string;
      sample_rate?: number | null;
      bit_rate?: number | null;
    }
  ) {
    let sample_rate: GrokSampleRateTTS,
      bit_rate: GrokBitRateTTS,
      codec: GrokAudioCodecTTS;

    // voice
    const voice =
      voice_id && this.isValidVoice(voice_id)
        ? (voice_id satisfies GrokVoiceTTS)
        : "eve";

    // language
    const lang = language && this.isValidLanguage(language) ? language : "auto";

    // sample_rate
    if (
      output_format?.sample_rate &&
      this.isValidSampleRate(output_format.sample_rate)
    ) {
      sample_rate = output_format.sample_rate;
    } else {
      sample_rate = 24000;
    }

    // bit_rate
    if (
      output_format?.bit_rate &&
      this.isValidBitRate(output_format.bit_rate)
    ) {
      bit_rate = output_format.bit_rate;
    } else {
      bit_rate = 128000;
    }

    // codec
    if (output_format?.codec && this.isValidCodec(output_format.codec)) {
      codec = output_format.codec;
    } else {
      codec = "mp3";
    }

    let qp: string;

    if (codec === "mp3") {
      qp = this.mapSearchParams([
        ["voice", voice],
        ["codec", codec],
        ["language", lang],
        ["sample_rate", sample_rate],
        ["bit_rate", bit_rate]
      ] as const);
    } else {
      qp = this.mapSearchParams([
        ["voice", voice],
        ["codec", codec],
        ["language", lang],
        ["sample_rate", sample_rate]
      ] as const);
    }

    return `wss://api.x.ai/v1/tts?${qp}`;
  }

  protected wssUrlConnect(
    voice_id?: string,
    language?: string,
    output_format?: {
      codec?: string | undefined;
      sample_rate?: number | null | undefined;
      bit_rate?: number | null | undefined;
    }
  ) {
    const wssUrl = this.buildWssUrl(voice_id, language, output_format);

    const ttsWs = new TTSWebSocket(wssUrl, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

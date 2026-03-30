import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { TTSTypes } from "@/tts/types.ts";
import type { Logger as PinoLogger } from "pino";
import type { RawData, WebSocket } from "ws";
import { WebSocket as TTSWebSocket } from "ws";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type {
  EventTypeMap,
  GrokAudioCodecTTS,
  GrokBitRateTTS,
  GrokSampleRateTTS,
  GrokVoiceTTS,
  TTSJobSingleton
} from "@slipstream/types";

export class TTSService {
  /**
   * composite key -> `${conversationId}:${sourceMessageId}`
   */
  public ttsJobCache = new Map<string, TTSJobSingleton<true>>();
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

  protected sendTextChunks(xaiWs: TTSWebSocket, text: string) {
    const MAX_CHUNK = 15_000;
    let offset = 0;
    while (offset < text.length) {
      let end = Math.min(offset + MAX_CHUNK, text.length);
      if (end < text.length) {
        const slice = text.slice(offset, end);
        const lastSentence = Math.max(
          slice.lastIndexOf(". "),
          slice.lastIndexOf("! "),
          slice.lastIndexOf("? "),
          slice.lastIndexOf("\n")
        );
        if (lastSentence > MAX_CHUNK * 0.5) {
          end = offset + lastSentence + 1;
        }
      }
      const chunk = text.slice(offset, end);
      xaiWs.send(
        JSON.stringify({
          type: "text.delta",
          delta: chunk
        } satisfies TTSTypes.Text.Delta)
      );
      offset = end;
    }
    xaiWs.send(
      JSON.stringify({ type: "text.done" } satisfies TTSTypes.Text.Done)
    );
  }

  public codecToContentType(codec: string) {
    if (codec === "mp3") return "audio/mpeg";
    if (codec === "wav") return "audio/wav";
    if (codec === "pcm") return "audio/pcm";
    if (codec === "mulaw" || codec === "alaw") return "audio/basic";
    return "audio/mpeg";
  }

  public estimateDurationMs(
    byteLength: number,
    codec: string,
    bitRate: number,
    sampleRate: number
  ) {
    if (codec === "mp3") return Math.round((byteLength * 8 * 1000) / bitRate);
    if (codec === "wav" || codec === "pcm")
      return Math.round((byteLength / (sampleRate * 2)) * 1000);
    if (codec === "mulaw" || codec === "alaw")
      return Math.round((byteLength / sampleRate) * 1000);
    return Math.round((byteLength * 8 * 1000) / bitRate);
  }

  protected async finalize(
    ws: WebSocket,
    audioChunks: string[],
    ttsJob: TTSJobSingleton<true>,
    conversationId: string,
    messageId: string,
    userId: string,
    codec: string,
    bitRate: number,
    sampleRate: number,
    t0: number,
    traceId: string
  ) {
    try {
      const audioBuffer = Buffer.concat(
        audioChunks.map(c => Buffer.from(c, "base64"))
      );
      const generationMs = Math.round(performance.now() - t0);
      const contentType = this.codecToContentType(codec);
      const filename = `${ttsJob.id}.${codec === "mulaw" ? "ul" : codec}`;
      const uploadDurInitial = performance.now();
      const s3Result = await this.s3.uploadGenerated(
        audioBuffer,
        this.prisma.isProd,
        {
          messageId,
          contentType,
          filename,
          userId,
          size: audioBuffer.byteLength,
          conversationId,
          origin: "GENERATED"
        }
      );
      const uploadDurFinal = performance.now();

      const durationMs = this.estimateDurationMs(
        audioBuffer.byteLength,
        codec,
        bitRate,
        sampleRate
      );

      const mime =
        (s3Result.contentType ?? codec === "mp3")
          ? "mpeg"
          : codec === "mulaw"
            ? "audio/basic"
            : codec === "alaw"
              ? "audio/basic"
              : `audio/${codec}`;

      const attachment = await this.prisma.createAttachment({
        userId,
        bucket: s3Result.bucket,
        key: s3Result.key,
        versionId: s3Result.versionId ?? undefined,
        s3ObjectId: s3Result.s3ObjectId,
        compatKey: s3Result.key,
        compatReadyAt: new Date(uploadDurFinal),
        compatS3ObjectId: s3Result.s3ObjectId,
        compatVersionId: s3Result.versionId,
        etag: s3Result.etag,
        region: "us-east-1",
        storageClass: s3Result.storageClass,
        s3LastModified: new Date(s3Result.lastModified ?? uploadDurFinal),
        cdnUrl: s3Result.cdnUrl,
        publicUrl: s3Result.publicUrl,
        mime,
        ext: codec,
        filename,
        size: BigInt(s3Result.size ?? audioBuffer.byteLength),
        conversationId,
        messageId,
        compatStatus: "ALIASED",
        origin: "GENERATED",
        status: "READY",
        assetType: "AUDIO",
        uploadMethod: "GENERATED",
        cacheControl: s3Result.cacheControl,
        checksumAlgo: s3Result.checksum?.algo,
        checksumSha256: s3Result.checksum?.value,
        uploadDuration: uploadDurFinal - uploadDurInitial,
        compatCdnUrl: s3Result.cdnUrl,
        compatExt: codec,
        compatMime: mime,
        contentDisposition: s3Result.contentDisposition,
        audio: {
          format: contentType,
          duration: durationMs,
          bitrate: bitRate,
          sampleRate,
          channels: 1,
          createdAt: new Date(Date.now()),
          year: new Date(Date.now()).getFullYear(),
          codec
        }
      });

      await this.prisma.updateTTSJobStatus(ttsJob.id, "COUPLED", {
        durationMs,
        generationMs,
        sizeBytes: BigInt(audioBuffer.byteLength),
        cdnUrl: s3Result.cdnUrl,
        attachmentId: attachment.id
      });

      this.ttsJobCache.set(`${conversationId}:${messageId}`, {
        ...ttsJob,
        status: "COUPLED",
        durationMs,
        generationMs,
        sizeBytes: audioBuffer.byteLength,
        cdnUrl: s3Result.cdnUrl,
        attachmentId: attachment.id
      });

      ws.send(
        JSON.stringify({
          type: "user_tts_response",
          ttsJobId: ttsJob.id,
          attachmentId: attachment.id,
          conversationId,
          messageId,
          durationMs,
          generationMs,
          size: audioBuffer.byteLength,
          cdnUrl: s3Result.cdnUrl,
          codec: this.isValidCodec(codec) ? codec : "mp3"
        } satisfies EventTypeMap["user_tts_response"])
      );

      this.logger.info(
        {
          ttsJobId: ttsJob.id,
          traceId,
          durationMs,
          generationMs,
          size: audioBuffer.byteLength
        },
        "TTS finalized"
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "finalize failed";
      void this.handleStreamError(ws, ttsJob, conversationId, messageId, msg);
    }
  }

  protected async handleStreamError(
    ws: WebSocket,
    ttsJob: TTSJobSingleton<true>,
    conversationId: string,
    messageId: string,
    errorMsg: string
  ) {
    this.logger.error(
      { ttsJobId: ttsJob.id, error: errorMsg },
      "TTS stream error"
    );
    try {
      await this.prisma.updateTTSJobStatus(ttsJob.id, "FAILED", {
        error: errorMsg
      });
    } catch (dbErr) {
      this.logger.error(
        {
          ttsJobId: ttsJob.id,
          error: dbErr instanceof Error ? dbErr.message : "db update failed"
        },
        "Failed to update TTSJob status"
      );
    }
    ws.send(
      JSON.stringify({
        type: "user_tts_error",
        status: 500,
        statusText: errorMsg,
        conversationId,
        messageId
      } satisfies EventTypeMap["user_tts_error"])
    );
  }

  public streamToClient(
    ws: WebSocket,
    conversationId: string,
    messageId: string,
    userId: string,
    text: string,
    ttsJob: TTSJobSingleton<true>,
    voice = "eve",
    language = "auto",
    codec = "mp3",
    sampleRate = 24000,
    bitRate = 128000
  ) {
    const t0 = performance.now();
    const xaiWs = new TTSWebSocket(
      this.buildWssUrl(voice, language, {
        codec,
        sample_rate: sampleRate,
        bit_rate: bitRate
      }),
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );

    let audioChunk: string | undefined;
    const audioChunks = Array.of<string>();

    const handleOpen = () => {
      this.logger.info(
        { ttsJobId: ttsJob.id, voice, language, codec },
        "xAI TTS connected"
      );
      this.sendTextChunks(xaiWs, text);
    };

    const handleMessage = (raw: RawData) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const event = JSON.parse<TTSTypes.Inbound>(raw.toString());

      if (event.type === "audio.delta") {
        audioChunk = event.delta;
      } else if (event.type === "audio.done") {
        cleanup();
        void this.finalize(
          ws,
          audioChunks,
          ttsJob,
          conversationId,
          messageId,
          userId,
          codec,
          bitRate,
          sampleRate,
          t0,
          event.trace_id
        );
        return;
      } else if (event.type === "error") {
        cleanup();
        void this.handleStreamError(
          ws,
          ttsJob,
          conversationId,
          messageId,
          event.message
        );
        return;
      }

      if (audioChunk) {
        audioChunks.push(audioChunk);

        ws.send(
          JSON.stringify({
            type: "user_tts_chunk",
            conversationId,
            ttsJobId: ttsJob.id,
            generationMs: performance.now() - t0,
            messageId,
            audioChunk
          } satisfies EventTypeMap["user_tts_chunk"])
        );

        audioChunk = undefined;
      }
    };

    const handleError = (err: Error) => {
      cleanup();
      void this.handleStreamError(
        ws,
        ttsJob,
        conversationId,
        messageId,
        err.message
      );
    };

    const handleClose = () => {
      cleanup();
    };

    const cleanup = () => {
      xaiWs.off("open", handleOpen);
      xaiWs.off("message", handleMessage);
      xaiWs.off("error", handleError);
      xaiWs.off("close", handleClose);
      if (xaiWs.readyState === TTSWebSocket.OPEN) xaiWs.close();
    };

    xaiWs.once("open", handleOpen);
    xaiWs.on("message", handleMessage);
    xaiWs.on("error", handleError);
    xaiWs.on("close", handleClose);
  }

  protected async syncCache(userId: string) {
    this.ttsJobCache.clear();
    const hasTTSJobs = await this.prisma.hasTTSJobsOnFile(userId);
    if (!hasTTSJobs) return;
    const allTTSJobs = await this.prisma.findAllTTSJobs(userId);
    if (allTTSJobs.length < 1) return;
    for (const m of allTTSJobs) {
      const composite = `${m.conversationId}:${m.sourceMessageId}`;
      this.ttsJobCache.set(composite, m);
    }
    this.logger.info(
      { userId, jobCount: allTTSJobs.length },
      "TTS cache synced"
    );
  }

  public async syncTTSCache(userId: string) {
    await this.syncCache(userId);
  }
}

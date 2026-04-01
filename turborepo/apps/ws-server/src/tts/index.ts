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
  MessageSingleton,
  TTSJobSingleton
} from "@slipstream/types";

export class TTSService {
  /**
   * composite key -> `${conversationId}:${sourceMessageId}`
   */
  public ttsJobCache = new Map<string, TTSJobSingleton<true>>();
  /** Message IDs with in-flight TTS generation — prevents duplicate jobs */
  public inflight = new Set<string>();
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

  public messageText(
    msg: Pick<MessageSingleton<true>, "content" | "messageBlocks">
  ) {
    const textBlocks = Array.of<string>();

    if (msg.messageBlocks && msg.messageBlocks.length > 0) {
      for (const block of msg.messageBlocks) {
        if (block.type === "TEXT") {
          textBlocks.push(block.content);
        }
      }
    }

    if (textBlocks.length > 0) {
      return textBlocks.join("\n");
    }

    return msg.content;
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

  /**
   * Wraps raw PCM (16-bit signed LE, mono) in a 44-byte RIFF/WAV header
   * so the CDN asset is directly browser-playable.
   */
  protected pcmToWav(pcmBuffer: Buffer, sampleRate: number) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataLength = pcmBuffer.byteLength;

    const header = Buffer.alloc(44);

    // RIFF chunk descriptor
    header.write("RIFF", 0, "ascii");
    header.writeUInt32LE(36 + dataLength, 4);
    header.write("WAVE", 8, "ascii");

    // fmt sub-chunk
    header.write("fmt ", 12, "ascii");
    header.writeUInt32LE(16, 16); // Subchunk1Size (PCM = 16)
    header.writeUInt16LE(1, 20); // AudioFormat (PCM = 1)
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);

    // data sub-chunk
    header.write("data", 36, "ascii");
    header.writeUInt32LE(dataLength, 40);

    return Buffer.concat([header, pcmBuffer]);
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
      const rawPcmBuffer = Buffer.concat(
        audioChunks.map(c => Buffer.from(c, "base64"))
      );
      const generationMs = Math.round(performance.now() - t0);

      // When codec is PCM, wrap in WAV so the CDN asset is browser-playable.
      // Duration is estimated from the raw PCM size (before WAV header).
      const isPcm = codec === "pcm";
      const uploadBuffer = isPcm
        ? this.pcmToWav(rawPcmBuffer, sampleRate)
        : rawPcmBuffer;
      const uploadCodec = isPcm ? "wav" : codec;
      const contentType = this.codecToContentType(uploadCodec);
      const filename = `${ttsJob.id}.${uploadCodec === "mulaw" ? "ul" : uploadCodec}`;
      const uploadDurInitial = performance.now();
      const s3Result = await this.s3.uploadGenerated(
        uploadBuffer,
        this.prisma.isProd,
        {
          messageId,
          contentType,
          filename,
          userId,
          size: uploadBuffer.byteLength,
          conversationId,
          origin: "GENERATED"
        }
      );
      const uploadDurFinal = performance.now();

      const durationMs = this.estimateDurationMs(
        rawPcmBuffer.byteLength,
        codec,
        bitRate,
        sampleRate
      );

      const mime =
        uploadCodec === "mp3"
          ? "audio/mpeg"
          : uploadCodec === "wav" || uploadCodec === "pcm"
            ? "audio/wav"
            : uploadCodec === "mulaw" || uploadCodec === "alaw"
              ? "audio/basic"
              : `audio/${uploadCodec}`;

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
        ext: uploadCodec,
        filename,
        size: BigInt(s3Result.size ?? uploadBuffer.byteLength),
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
        compatExt: uploadCodec,
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
          codec: uploadCodec
        }
      });

      await this.prisma.updateTTSJobStatus(ttsJob.id, "COUPLED", {
        durationMs,
        generationMs,
        sizeBytes: BigInt(uploadBuffer.byteLength),
        cdnUrl: s3Result.cdnUrl,
        attachmentId: attachment.id
      });

      this.ttsJobCache.set(`${conversationId}:${messageId}`, {
        ...ttsJob,
        status: "COUPLED",
        durationMs,
        generationMs,
        sizeBytes: uploadBuffer.byteLength,
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
          size: uploadBuffer.byteLength,
          cdnUrl: s3Result.cdnUrl,
          codec: this.isValidCodec(uploadCodec) ? uploadCodec : "mp3"
        } satisfies EventTypeMap["user_tts_response"])
      );

      this.logger.info(
        {
          ttsJobId: ttsJob.id,
          traceId,
          durationMs,
          generationMs,
          size: uploadBuffer.byteLength
        },
        "TTS finalized"
      );
      this.inflight.delete(messageId);
    } catch (err) {
      this.inflight.delete(messageId);
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
    this.inflight.delete(messageId);
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
    this.inflight.add(messageId);
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
      let event: TTSTypes.Inbound;
      try {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        event = JSON.parse<TTSTypes.Inbound>(raw.toString());
      } catch {
        this.logger.warn(
          { ttsJobId: ttsJob.id, rawLength: Buffer.isBuffer(raw) ? raw.byteLength : 0 },
          "Non-JSON frame from xAI TTS, skipping"
        );
        return;
      }

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

import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { TTSTypes } from "@/tts/types.ts";
import type { Logger as PinoLogger } from "pino";
import type { RawData, WebSocket } from "ws";
import { WebSocket as TTSWebSocket } from "ws";
import type { $Enums } from "@slipstream/db/node/generated/client";
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
  /**
   * Drain registry — per-job promise that resolves when finalize() (success
   * or failure) completes for a given messageId. Used by `awaitAllInflight`
   * during graceful shutdown so server-side work survives client disconnect.
   */
  private inflightPromises = new Map<string, Promise<void>>();
  /** userId -> messageId -> resolver. Lets us drain a single user's work. */
  private inflightByUser = new Map<string, Map<string, () => void>>();
  /** messageId -> resolver. Direct lookup for `clearInflight` cleanup. */
  private inflightResolvers = new Map<string, () => void>();
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

  public isValidCodec(codec: string) {
    return (
      codec === "mp3" ||
      codec === "wav" ||
      codec === "pcm" ||
      codec === "mulaw" ||
      codec === "alaw"
    );
  }

  public isValidVoice(v: string) {
    return (
      v === "eve" ||
      v === "ara" ||
      v === "leo" ||
      v === "rex" ||
      v === "sal" ||
      v === "una"
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

  public isValidBitRate(s: number) {
    return (
      s === 32000 || s === 64000 || s === 96000 || s === 128000 || s === 192000
    );
  }

  public isValidLanguage(l: string) {
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
  private sanitizeBlockContent(
    content: string,
    provider: $Enums.Provider | null,
    model = "claude-opus-4-6"
  ) {
    if (provider !== "ANTHROPIC") return content;

    const out = content
      .replace(/<model\s+provider="[^"]*"\s+name="[^"]*"\s*>/g, "")
      .replace(/<\/model>/g, "")
      .trim();

    return `<model provider="anthropic" name="${model}">\n\n${out}\n\n</model>`;
  }

  public messageText(
    msg: Pick<
      MessageSingleton<true>,
      "content" | "messageBlocks" | "model" | "provider" | "senderType"
    >
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
      const content = textBlocks.join("\n");
      return msg.senderType === "AI"
        ? this.sanitizeBlockContent(
            content,
            msg.provider,
            msg.model ?? undefined
          )
        : content;
    }

    return msg.senderType === "AI"
      ? this.sanitizeBlockContent(
          msg.content,
          msg.provider,
          msg.model ?? undefined
        )
      : msg.content;
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
    if (codec === "mp3") {
      return Math.round((byteLength * 8 * 1000) / bitRate);
    } else if (codec === "wav" || codec === "pcm") {
      return Math.round((byteLength / (sampleRate * 2)) * 1000);
    } else if (codec === "mulaw" || codec === "alaw") {
      return Math.round((byteLength / sampleRate) * 1000);
    } else return Math.round((byteLength * 8 * 1000) / bitRate);
  }

  /**
   * Best-effort socket send. Checks readyState, swallows throws so a dead
   * client socket cannot abort server-side work.
   *
   * Returns `true` only if the send was actually attempted AND did not throw
   * synchronously. The async `(err) => ...` ws callback is not awaited — for
   * the purposes of in-flight detach, that asynchronous failure is moot
   * because the persist phase has already completed by the time we send.
   */
  protected trySend<T extends keyof EventTypeMap>(
    ws: WebSocket,
    type: T,
    data: EventTypeMap[T]
  ) {
    if (ws.readyState !== TTSWebSocket.OPEN) {
      this.logger.debug(
        { type, readyState: ws.readyState },
        "trySend skipped — socket not open"
      );
      return false;
    }
    try {
      ws.send(JSON.stringify({ ...data, type }));
      return true;
    } catch (err) {
      this.logger.debug(
        {
          type,
          err: err instanceof Error ? err.message : "unknown send error"
        },
        "trySend failed — client likely disconnected"
      );
      return false;
    }
  }

  /**
   * Register a new in-flight TTS job for drain tracking. Called from
   * `streamToClient` immediately after `inflight.add(messageId)`. Idempotent
   * for the same `messageId` (the existing `inflight.has` check upstream
   * already prevents duplicate jobs).
   */
  private registerInflight(userId: string, messageId: string) {
    const { promise, resolve } = Promise.withResolvers<void>();
    this.inflightPromises.set(messageId, promise);
    this.inflightResolvers.set(messageId, resolve);
    let userMap = this.inflightByUser.get(userId);
    if (!userMap) {
      userMap = new Map<string, () => void>();
      this.inflightByUser.set(userId, userMap);
    }
    userMap.set(messageId, resolve);
  }

  /**
   * Single cleanup point for in-flight state. Resolves the drain promise,
   * removes the messageId from all registries, prunes empty user buckets.
   * Replaces the previously scattered `this.inflight.delete(messageId)`
   * call sites so cleanup state cannot drift.
   */
  private clearInflight(userId: string, messageId: string) {
    this.inflight.delete(messageId);
    const resolve = this.inflightResolvers.get(messageId);
    if (resolve) resolve();
    this.inflightResolvers.delete(messageId);
    this.inflightPromises.delete(messageId);
    const userMap = this.inflightByUser.get(userId);
    if (userMap) {
      userMap.delete(messageId);
      if (userMap.size === 0) this.inflightByUser.delete(userId);
    }
  }

  /**
   * Drain primitive — wait for all in-flight TTS jobs to complete or for
   * the deadline to elapse. Used by `WSServer.stop()` graceful shutdown.
   *
   * Implementation notes:
   * - Uses `Promise.withResolvers` + a polling tick rather than a one-shot
   *   `Promise.race([Promise.all(snapshot), timeout])`. The naive shape has
   *   a snapshot-freshness bug: between calling `awaitAllInflight()` and the
   *   snapshot resolving, new TTS requests can be admitted from connected
   *   clients (the drain runs *before* `wss.close()`). New jobs registered
   *   after the snapshot would be invisible to the await. The tick re-snapshots
   *   on each iteration so newly registered jobs are caught.
   * - Default ceiling 90s, env-overridable via `INFLIGHT_DRAIN_TIMEOUT_MS`.
   *   This codebase deploys to ECS Fargate which hard-caps the container
   *   `stopTimeout` at 120s, so the application drain leaves ~30s of headroom
   *   for `redis.quit()` + `wss.close()` + container teardown.
   * - Never throws on timeout — returns after either completion or deadline.
   */
  public awaitAllInflight(
    timeoutMs = Number(process.env.INFLIGHT_DRAIN_TIMEOUT_MS) || 90_000
  ) {
    return this.drainSnapshot(() => this.inflightPromises, timeoutMs);
  }

  /**
   * Per-user variant of `awaitAllInflight`. Same drain semantics, scoped
   * to a single userId. Returns immediately if the user has no in-flight
   * jobs.
   */
  public awaitUserInflight(
    userId: string,
    timeoutMs = Number(process.env.INFLIGHT_DRAIN_TIMEOUT_MS) || 90_000
  ) {
    return this.drainSnapshot(() => {
      // Adapt the per-user resolver map into a Promise map for the shared
      // drain loop. The promises themselves live in `inflightPromises`.
      const userMap = this.inflightByUser.get(userId);
      const out = new Map<string, Promise<void>>();
      if (!userMap) return out;
      for (const messageId of userMap.keys()) {
        const p = this.inflightPromises.get(messageId);
        if (p) out.set(messageId, p);
      }
      return out;
    }, timeoutMs);
  }

  private async drainSnapshot(
    accessor: () => Map<string, Promise<void>>,
    timeoutMs: number
  ) {
    if (accessor().size === 0) return;

    const { promise: drainComplete, resolve: resolveDrain } =
      Promise.withResolvers<void>();
    const deadline = Date.now() + timeoutMs;
    const POLL_INTERVAL_MS = 5_000;

    const tick = async () => {
      const snapshotMap = accessor();
      if (snapshotMap.size === 0) {
        this.logger.info("Drain complete: all in-flight TTS work finished");
        resolveDrain();
        return;
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        this.logger.warn(
          { remaining: snapshotMap.size },
          "Drain deadline exceeded, abandoning in-flight TTS work"
        );
        resolveDrain();
        return;
      }

      this.logger.info(
        { remaining: snapshotMap.size, msUntilDeadline: remainingMs },
        "Draining in-flight TTS work"
      );

      // Re-snapshot on each iteration so newly registered jobs are awaited.
      // Promise.race against a poll timer gives event-driven completion in
      // the common case + a polling fallback to re-snapshot for new arrivals.
      const snapshot = Array.from(snapshotMap.values());
      await Promise.race([
        Promise.all(snapshot),
        new Promise<void>(r =>
          setTimeout(r, Math.min(remainingMs, POLL_INTERVAL_MS))
        )
      ]);

      void tick();
    };

    void tick();
    return drainComplete;
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
    traceId: string,
    provider: $Enums.Provider,
    model: string | null
  ) {
    // Persist phase: anything in here failing → handleStreamError → FAILED.
    // Notify phase (after the try/catch) is best-effort and MUST NOT mutate
    // the COUPLED job status. This split is the fix for the
    // COUPLED→FAILED overwrite bug where a dead-socket throw on the trailing
    // `ws.send(user_tts_response)` was cascading into handleStreamError and
    // wiping the COUPLED status that had just been written one block earlier.
    let persisted: {
      attachmentId: string;
      durationMs: number;
      generationMs: number;
      uploadByteLength: number;
      cdnUrl: string;
      uploadCodec: string;
    };
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
          title: `${conversationId}-${messageId}-${ttsJob.id}`,
          album: conversationId,
          artist: `${provider.slice(0, 1).concat(provider.slice(1).toLowerCase())}, ${model}`,
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

      persisted = {
        attachmentId: attachment.id,
        durationMs,
        generationMs,
        uploadByteLength: uploadBuffer.byteLength,
        cdnUrl: s3Result.cdnUrl,
        uploadCodec
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "finalize failed";
      await this.handleStreamError(ws, ttsJob, conversationId, messageId, msg);
      this.clearInflight(userId, messageId);
      return;
    }

    // Notify phase — best-effort. A failure here MUST NOT mutate the COUPLED
    // job that the persist phase just wrote. The client will re-fetch via
    // `user_tts_response_preexisting` on next request from the cache.
    this.trySend(ws, "user_tts_response", {
      type: "user_tts_response",
      ttsJobId: ttsJob.id,
      attachmentId: persisted.attachmentId,
      conversationId,
      messageId,
      durationMs: persisted.durationMs,
      generationMs: persisted.generationMs,
      size: persisted.uploadByteLength,
      cdnUrl: persisted.cdnUrl,
      codec: this.isValidCodec(persisted.uploadCodec)
        ? persisted.uploadCodec
        : "mp3"
    } satisfies EventTypeMap["user_tts_response"]);

    this.clearInflight(userId, messageId);
  }

  protected async handleStreamError(
    ws: WebSocket,
    ttsJob: TTSJobSingleton<true>,
    conversationId: string,
    messageId: string,
    errorMsg: string
  ) {
    // Note: in-flight cleanup happens at the call site via `clearInflight`
    // (it needs the userId, which this method doesn't carry). All callers
    // wrap this in `try { await handleStreamError(...) } finally { clearInflight }`
    // semantics.
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
    this.trySend(ws, "user_tts_error", {
      type: "user_tts_error",
      status: 500,
      statusText: errorMsg,
      conversationId,
      messageId
    } satisfies EventTypeMap["user_tts_error"]);
  }

  public streamToClient(
    ws: WebSocket,
    conversationId: string,
    messageId: string,
    userId: string,
    text: string,
    provider: $Enums.Provider,
    model: string | null,
    ttsJob: TTSJobSingleton<true>,
    voice = "eve",
    language = "auto",
    codec = "mp3",
    sampleRate = 24000,
    bitRate = 128000
  ) {
    const t0 = performance.now();
    this.inflight.add(messageId);
    this.registerInflight(userId, messageId);
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
          {
            ttsJobId: ttsJob.id,
            rawLength: Buffer.isBuffer(raw) ? raw.byteLength : 0
          },
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
          event.trace_id,
          provider,
          model
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
        ).finally(() => this.clearInflight(userId, messageId));
        return;
      }

      if (audioChunk) {
        audioChunks.push(audioChunk);

        // Best-effort: a dead client socket must NOT abort the streaming
        // loop. Server-side persistence in finalize() is authoritative; the
        // client will replay from the cached cdnUrl on next request via
        // `user_tts_response_preexisting`.
        this.trySend(ws, "user_tts_chunk", {
          type: "user_tts_chunk",
          conversationId,
          ttsJobId: ttsJob.id,
          generationMs: performance.now() - t0,
          messageId,
          audioChunk
        } satisfies EventTypeMap["user_tts_chunk"]);

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
      ).finally(() => this.clearInflight(userId, messageId));
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

  public async syncTTSCache(userId: string) {
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
}

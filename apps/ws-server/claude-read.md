before

```ts
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
```

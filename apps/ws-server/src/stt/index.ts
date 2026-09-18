import { randomUUID } from "node:crypto";
import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { Logger as PinoLogger } from "pino";
import type { RawData, WebSocket } from "ws";
import { WebSocket as STTWebSocket } from "ws";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { EventTypeMap, STTEventUnion, STTTypes } from "@slipstream/types";

type FinishReason = Extract<
  $Enums.DictationTerminationReason,
  "USER_FINISHED" | "IDLE_TIMEOUT"
>;

type InterruptReason = Extract<
  $Enums.DictationTerminationReason,
  "UPSTREAM_ERROR" | "INTERNAL_ERROR" | "CLIENT_DISCONNECTED"
>;

type RecoverableReason = Exclude<
  $Enums.DictationTerminationReason,
  "USER_FINISHED" | "IDLE_TIMEOUT" | "NONE"
>;

type RecoverRow = Awaited<
  ReturnType<PrismaService["dictationRecoverables"]>
>[number];

export class STTService {
  /** one live session per aic-client socket; reserved synchronously in `connect` */
  private readonly sessions = new Map<WebSocket, STTTypes.Session>();
  private readonly inflightPromises = new Map<WebSocket, Promise<void>>();
  private readonly inflightResolvers = new Map<WebSocket, () => void>();
  private readonly drainPromises = new Map<WebSocket, Promise<void>>();
  /** userId → live session; write-through at connect / teardown */
  private readonly liveByUser = new Map<string, STTTypes.Session>();
  /**
   * userId → draftId → settled outcome; fast path for post-session cancel,
   * recover, and restore. Write-through at complete / interrupt / cancel /
   * restore; a miss always falls through to the row, which stays the authority.
   */
  private readonly settledByUser = new Map<
    string,
    Map<string, STTTypes.Session.SettledDraft>
  >();
  private readonly runId = randomUUID();
  private isDraining = false;

  /** no finalized utterance for this long → `stt_user_timeout` */
  private readonly IDLE_MS = 30_000;
  /** `stt_user_timeout.closesInMs` — `stt_user_present` or a new utterance resets */
  private readonly CLOSE_MS = 15_000;
  /** `transcript.created` must arrive within this after the xai-client opens */
  private readonly READY_DEADLINE_MS = 10_000;
  /** `transcript.done` must arrive within this after `audio.done` */
  private readonly FINISH_DEADLINE_MS = 15_000;
  /** any single Redis command; expiry → `storage: "unavailable"`, lifecycle proceeds */
  private readonly STORAGE_DEADLINE_MS = 2_000;
  private readonly LEASE_S = 120;
  /** transient-session hygiene only; the Postgres row is the durable copy */
  private readonly CHECKPOINT_TTL_S = 6 * 60 * 60;
  /** settled entries linger this long in memory (the recovery window) */
  private readonly SETTLED_TTL_MS = 60 * 60 * 1000;
  /** xai-client send backlog above this = stalled hop 2 */
  private readonly MAX_XAI_CLIENT_BUFFER = 1 << 20;
  /**
   * voice detection is RELATIVE to a per-session noise floor: a fan, A/C, or
   * open window is steady, speech is bursty. A frame is voiced when it is
   * both above an absolute minimum and well above the tracked floor; the
   * floor learns only from quiet frames (fast fall, slow rise) so continuous
   * speech never lifts it into a false idle
   */
  private readonly VOICE_ABS_MIN_RMS = 0.01; // -40 dBFS: nothing below this counts, however quiet the room
  private readonly VOICE_OVER_FLOOR = 3; // ≈ +9.5 dB above the floor
  private readonly FLOOR_ADAPT = 0.05; // per quiet frame; ~2 s to settle at 10 fps
  private readonly noiseFloors = new WeakMap<STTTypes.Session, number>();
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

  // ── C→S entry points (called by resolver/stt.ts) ─────────────────────

  /** `stt_user_connect` — reserve → row → lease → xai-client */
  public async connect(
    ws: WebSocket,
    userId: string,
    ev: EventTypeMap["stt_user_connect"]
  ) {
    if (this.isDraining) {
      this.sendError(
        ws,
        ev.draftId,
        503,
        "Server is draining, please retry shortly"
      );
      return;
    }
    if (this.sessions.has(ws)) {
      this.sendError(ws, ev.draftId, 409, "session already live");
      return;
    }
    const session: STTTypes.Session = {
      draftId: ev.draftId,
      userId,
      batchId: ev.batchId,
      ordinal: ev.ordinal,
      conversationId: ev.conversationId,
      createdAt: Date.now(),
      ws,
      sampleRate: ev.sampleRate,
      xaiClient: null,
      externalId: null,
      phase: "starting",
      pendingReason: "USER_FINISHED",
      disconnected: false,
      expectedFrameOrdinal: 0,
      lastUtteranceAt: performance.now(), // monotonic: the idle clock, never wall time
      idleTimer: null,
      closeTimer: null,
      deadlineTimer: null,
      finalReceived: false,
      reconciled: true,
      segments: Array.of<STTTypes.Session.Segment>(),
      storage: "ok",
      pendingSnapshot: null,
      writeInFlight: false
    };
    // reserved before any await — every callback below re-checks identity
    this.sessions.set(ws, session);
    this.liveByUser.set(userId, session);
    this.registerInflight(ws);

    const { type, ...insert } = ev;
    this.logger.debug({ type, draftId: ev.draftId, userId }, "connect");

    try {
      await this.prisma.dictationInsert(insert);
    } catch (err) {
      this.logger.error(
        { draftId: ev.draftId, err: this.prisma.safeErrMsg(err) },
        "dictation insert failed"
      );
      session.phase = "terminal";
      this.sendError(ws, ev.draftId, 500, "dictation insert failed");
      this.teardown(session);
      return;
    }
    if (await this.settleStarting(session)) return;

    const lease = await this.leaseDraft(session);
    if (lease === "owned") {
      session.phase = "terminal";
      await this.prisma
        .dictationInterrupt(
          session.draftId,
          { text: "", durationMs: 0 },
          "INTERNAL_ERROR"
        )
        .catch((err: unknown) =>
          this.logger.warn(
            { draftId: session.draftId, err: this.prisma.safeErrMsg(err) },
            "owned-draft FAILED write did not land"
          )
        );
      this.sendError(ws, ev.draftId, 409, "draftId already owned");
      this.teardown(session);
      return;
    }
    if (await this.settleStarting(session)) return;

    this.openXaiClient(session, ev);
  }

  /**
   * `stt_user_binary_frame` — synchronous end to end so hop-2 order equals
   * hop-1 order; nothing may be awaited before `xaiClient.send`
   */
  public pushFrame(ws: WebSocket, ev: EventTypeMap["stt_user_binary_frame"]) {
    const session = this.sessions.get(ws);
    if (session?.draftId !== ev.draftId) return; // stale tail from a replaced session
    if (session.phase !== "recording" || !session.xaiClient) return; // before created / after finish
    if (ev.frameOrdinal < session.expectedFrameOrdinal) return; // duplicate
    if (ev.frameOrdinal > session.expectedFrameOrdinal) {
      void this.interrupt(
        session,
        "INTERNAL_ERROR",
        `frame gap: expected ${session.expectedFrameOrdinal}, got ${ev.frameOrdinal}`
      );
      return;
    }
    session.expectedFrameOrdinal += 1;
    if (session.xaiClient.bufferedAmount > this.MAX_XAI_CLIENT_BUFFER) {
      void this.interrupt(session, "INTERNAL_ERROR", "xai-client stalled");
      return;
    }
    const pcm = Buffer.from(ev.frame, "base64");
    // the idle clock runs from the last VOICED frame, not the last finalized
    // utterance — a long unbroken sentence must never look idle
    const rms = this.frameRms(pcm);
    const voiced = this.isVoiced(session, rms);
    if (voiced) this.noteVoice(session);
    if (ev.frameOrdinal === 0 || ev.frameOrdinal % 50 === 0) {
      this.logger.debug(
        {
          draftId: session.draftId,
          frameOrdinal: ev.frameOrdinal,
          bytes: pcm.byteLength,
          rms: Number(rms.toFixed(4)),
          floor: Number((this.noiseFloors.get(session) ?? 0).toFixed(4)),
          voiced
        },
        "frame → xai-client"
      );
    }
    session.xaiClient.send(pcm, { binary: true });
  }

  /** `stt_user_finish` (■ / ↑) and the idle-close path (`IDLE_TIMEOUT`) */
  public finish(
    ws: WebSocket,
    ev: EventTypeMap["stt_user_finish"],
    reason: FinishReason = "USER_FINISHED"
  ) {
    const session = this.sessions.get(ws);
    if (session?.draftId !== ev.draftId) {
      this.sendError(ws, ev.draftId, 404, "no live session for draftId");
      return;
    }
    if (session.phase === "starting") {
      this.sendError(ws, ev.draftId, 409, "session not ready");
      return;
    }
    if (session.phase !== "recording") return; // duplicate finish → ignored, never a second audio.done
    session.phase = "finishing"; // synchronous terminal-ward gate
    this.clearTimers(session);
    session.pendingReason = reason;
    this.sendAudioDone(session);
    this.logger.info(
      {
        draftId: session.draftId,
        reason,
        frames: session.expectedFrameOrdinal
      },
      "audio.done sent"
    );
    this.armFinishDeadline(session);
  }

  /**
   * `stt_user_cancel` — live session: abort + ORPHANED; no live session (the
   * two-phase ✕ after `stt_user_finished`): DECOUPLED → RECOVERABLE
   */
  public async cancel(
    ws: WebSocket,
    userId: string,
    ev: EventTypeMap["stt_user_cancel"]
  ) {
    const session = this.sessions.get(ws);
    if (session?.draftId === ev.draftId && session.phase !== "terminal") {
      if (session.phase === "starting" && session.xaiClient === null) {
        session.phase = "terminal"; // connect() continuation settles the row + sends canceled
        return;
      }
      session.phase = "terminal";
      this.clearTimers(session);
      this.closeXaiClient(session);
      await this.settleCancel(session);
      return;
    }
    const entry = this.settledEntry(userId, ev.draftId);
    if (entry) {
      // fast path: outcome is known from the settled entry; the row write trails
      const outcome = this.cancelSettled(userId, entry);
      this.trySend(ws, {
        type: "stt_user_canceled",
        draftId: ev.draftId,
        terminationReason: "USER_CANCELED",
        ...outcome
      });
      if (outcome.trailingWrite) {
        void this.prisma
          .dictationCancel(
            ev.draftId,
            userId,
            outcome.recoveryExpiresAt === null
              ? undefined
              : new Date(outcome.recoveryExpiresAt)
          )
          .then(
            row => {
              if (row === null) {
                this.logger.warn(
                  { draftId: ev.draftId },
                  "settled entry had no cancelable row"
                );
              }
            },
            (err: unknown) =>
              this.logger.error(
                { draftId: ev.draftId, err: this.prisma.safeErrMsg(err) },
                "trailing cancel write failed"
              )
          );
        void this.releaseRedisKeys(userId, ev.draftId).catch((err: unknown) =>
          this.logger.debug(
            { draftId: ev.draftId, err: this.prisma.safeErrMsg(err) },
            "redis release failed"
          )
        );
      }
      return;
    }
    try {
      const outcome = await this.prisma.dictationCancel(ev.draftId, userId);
      if (outcome === null) {
        this.sendError(ws, ev.draftId, 404, "no dictation to cancel");
        return;
      }
      await this.releaseRedisKeys(userId, ev.draftId);
      this.trySend(ws, {
        type: "stt_user_canceled",
        draftId: ev.draftId,
        terminationReason: "USER_CANCELED",
        ...outcome
      });
    } catch (err) {
      this.logger.error(
        { draftId: ev.draftId, err: this.prisma.safeErrMsg(err) },
        "dictation cancel failed"
      );
      this.sendError(ws, ev.draftId, 500, "dictation cancel failed");
    }
  }

  /** `stt_user_present` — "I'm here" button or local voice energy */
  public present(ws: WebSocket, ev: EventTypeMap["stt_user_present"]) {
    const session = this.sessions.get(ws);
    if (session?.draftId !== ev.draftId) {
      this.sendError(ws, ev.draftId, 404, "no live session for draftId");
      return;
    }
    if (session.phase !== "recording") return;
    session.lastUtteranceAt = performance.now();
    this.armIdleTimer(session); // clears the close timer too
    this.renewLease(session);
  }

  /** `stt_user_recover` — read only; RECOVERABLE rows, tri-state conversation scope */
  public async recover(
    ws: WebSocket,
    userId: string,
    ev: EventTypeMap["stt_user_recover"]
  ) {
    const results =
      Array.of<EventTypeMap["stt_user_recovered"]["results"][number]>();

    // fast path: settled in this process and still inside the window
    for (const entry of this.recoverableEntries(userId, ev.conversationId)) {
      results.push({
        draftId: entry.draftId,
        batchId: entry.batchId,
        ordinal: entry.ordinal,
        conversationId: entry.conversationId,
        text: entry.text,
        terminationReason: entry.terminationReason,
        reconciled: entry.reconciled,
        recoveryExpiresAt: entry.recoveryExpiresAt,
        createdAt: entry.createdAt
      });
    }
    if (results.length > 0) {
      this.trySend(ws, { type: "stt_user_recovered", results });
      return;
    }

    // miss: the row is the authority; populate the registry from what it returns
    const rows = await this.prisma.dictationRecoverables(
      userId,
      ev.conversationId
    );
    for (const row of rows) {
      if (!this.isRecoverableRow(row)) {
        this.logger.warn(
          { draftId: row.draftId, terminationReason: row.terminationReason },
          "RECOVERABLE row with a non-recoverable terminationReason skipped"
        );
        continue;
      }
      const entry = {
        draftId: row.draftId,
        batchId: row.batchId,
        ordinal: row.ordinal,
        conversationId: row.conversationId,
        text: row.content,
        terminationReason: row.terminationReason,
        couplingStatus: "RECOVERABLE",
        reconciled: true,
        recoveryExpiresAt: row.recoveryExpiresAt.getTime(),
        createdAt: row.createdAt.getTime(),
        settledAt: Date.now()
      } satisfies STTTypes.Session.SettledDraft;
      this.settledFor(userId).set(row.draftId, entry);
      results.push({
        draftId: entry.draftId,
        batchId: entry.batchId,
        ordinal: entry.ordinal,
        conversationId: entry.conversationId,
        text: entry.text,
        terminationReason: row.terminationReason,
        reconciled: entry.reconciled,
        recoveryExpiresAt: entry.recoveryExpiresAt,
        createdAt: entry.createdAt
      });
    }
    this.trySend(ws, { type: "stt_user_recovered", results });
  }

  /** `stt_user_restore` — RECOVERABLE → DECOUPLED */
  public async restore(
    ws: WebSocket,
    userId: string,
    ev: EventTypeMap["stt_user_restore"]
  ) {
    const restored = await this.prisma.dictationRestore(ev.draftId, userId);
    if (!restored) {
      this.settledByUser.get(userId)?.delete(ev.draftId); // registry disagreed with the row
      this.sendError(ws, ev.draftId, 404, "nothing to restore");
      return;
    }
    const entry = this.settledEntry(userId, ev.draftId);
    if (entry) {
      entry.couplingStatus = "DECOUPLED";
      entry.recoveryExpiresAt = null;
      entry.settledAt = Date.now();
    }
    this.trySend(ws, {
      type: "stt_user_restored",
      draftId: ev.draftId,
      couplingStatus: "DECOUPLED"
    });
  }

  /** ws-server `close` handler, alongside `localToolBroker.dropSocket` */
  public handleSocketClose(ws: WebSocket) {
    const session = this.sessions.get(ws);
    if (!session || session.phase === "terminal") return;
    session.disconnected = true;
    switch (session.phase) {
      case "starting": {
        if (session.xaiClient === null) {
          session.phase = "terminal"; // connect() continuation settles the row
          return;
        }
        void this.interrupt(
          session,
          "CLIENT_DISCONNECTED",
          "aic-client closed before transcript.created"
        );
        return;
      }
      case "recording": {
        // bounded completion attempt: aic-client is gone, xai-client is not
        session.phase = "finishing";
        this.clearTimers(session);
        this.sendAudioDone(session);
        this.armFinishDeadline(session);
        return;
      }
      case "finishing": {
        return; // audio.done already sent; complete() stores RECOVERABLE
      }
    }
  }

  /** shutdown: reject new sessions, interrupt active ones, await the writes */
  public async stop(timeoutMs?: number) {
    this.isDraining = true;
    for (const session of this.sessions.values()) {
      if (session.phase === "terminal") continue;
      if (session.phase === "starting" && session.xaiClient === null) {
        session.disconnected = true;
        session.phase = "terminal"; // connect() continuation settles the row
        continue;
      }
      void this.interrupt(session, "INTERNAL_ERROR", "server draining");
    }
    await this.awaitAllInflight(timeoutMs);
  }

  // ── xai-client (hop 2) ───────────────────────────────────────────────

  private buildUrl(ev: EventTypeMap["stt_user_connect"]) {
    const params = new URLSearchParams();
    params.set("encoding", "pcm");
    params.set("sample_rate", String(ev.sampleRate));
    params.set("interim_results", "false");
    if (typeof ev.language === "string" && this.isValidLanguage(ev.language)) {
      params.set("language", ev.language);
    }
    if (typeof ev.endpointing === "number") {
      params.set("endpointing", String(ev.endpointing));
    }
    if (typeof ev.diarize === "boolean") {
      params.set("diarize", String(ev.diarize));
    }
    if (typeof ev.fillerWords === "boolean") {
      params.set("filler_words", String(ev.fillerWords));
    }
    if (typeof ev.vadThreshold === "number") {
      params.set("vad_threshold", String(ev.vadThreshold));
    }
    for (const keyterm of ev.keyterms ?? []) params.append("keyterm", keyterm);
    return `${this.baseSTTUrl}?${params.toString()}`;
  }

  private openXaiClient(
    session: STTTypes.Session,
    ev: EventTypeMap["stt_user_connect"]
  ) {
    const xaiClient = new STTWebSocket(this.buildUrl(ev), {
      headers: { Authorization: `Bearer ${this.apiKey}` }
    });
    session.xaiClient = xaiClient;
    session.deadlineTimer = setTimeout(() => {
      void this.interrupt(
        session,
        "UPSTREAM_ERROR",
        "transcript.created deadline exceeded"
      );
    }, this.READY_DEADLINE_MS);

    const isLive = () => this.sessions.get(session.ws) === session;

    xaiClient.on("open", () => {
      if (!isLive()) return;
      this.logger.info(
        { draftId: session.draftId, sampleRate: session.sampleRate },
        "xai-client connected"
      );
    });

    xaiClient.on("message", (raw: RawData) => {
      if (!isLive()) return; // stale callback from a replaced session
      let event: STTTypes.Inbound;
      try {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        event = JSON.parse<STTTypes.Inbound>(raw.toString());
      } catch {
        void this.interrupt(
          session,
          "UPSTREAM_ERROR",
          "non-JSON frame from xai-server"
        );
        return;
      }
      this.logger.debug(
        { draftId: session.draftId, type: event.type },
        "xai-server frame"
      );
      switch (event.type) {
        case "transcript.created": {
          this.clearDeadline(session);
          session.phase = "recording";
          session.externalId = event.id;
          this.logger.info(
            { draftId: session.draftId, externalId: event.id },
            "xai-server ready → stt_user_connected"
          );
          void this.prisma
            .dictationGenerating(session.draftId, event.id)
            .catch((err: unknown) =>
              this.logger.warn(
                { draftId: session.draftId, err: this.prisma.safeErrMsg(err) },
                "GENERATING write did not land"
              )
            );
          this.armIdleTimer(session);
          this.trySend(session.ws, {
            type: "stt_user_connected",
            draftId: session.draftId,
            externalId: event.id
          });
          return;
        }
        case "transcript.partial": {
          if (!event.is_final) return; // never expected with interims off
          this.logger.debug(
            { draftId: session.draftId, event },
            "transcript.partial (final) — verbose probe"
          );
          // xai-server emits empty finals over silence; only text is presence
          if (event.text.trim().length > 0) {
            session.lastUtteranceAt = performance.now();
            if (session.phase === "recording") this.armIdleTimer(session);
          }
          this.checkpoint(session, event);
          return;
        }
        case "transcript.done": {
          session.finalReceived = true;
          this.logger.debug(
            { draftId: session.draftId, event },
            "transcript.done — verbose probe"
          );
          this.logger.info(
            {
              draftId: session.draftId,
              chars: event.text.length,
              duration: event.duration,
              reason: session.pendingReason
            },
            "transcript.done"
          );
          void this.complete(session, event, session.pendingReason);
          return;
        }
        case "error": {
          void this.interrupt(session, "UPSTREAM_ERROR", event.message);
          return;
        }
        default: {
          const unhandled: never = event;
          this.logger.warn({ event: unhandled }, "unhandled xai-server frame");
        }
      }
    });

    xaiClient.on("error", (err: Error) => {
      if (!isLive()) return;
      void this.interrupt(session, "UPSTREAM_ERROR", err.message);
    });

    xaiClient.on("close", (code: number, reason: Buffer) => {
      if (!isLive()) return;
      if (session.finalReceived || session.phase === "terminal") return; // normal close after done
      void this.interrupt(
        session,
        "UPSTREAM_ERROR",
        `xai-server closed before transcript.done (${code} ${reason.toString()})`
      );
    });
  }

  private sendAudioDone(session: STTTypes.Session) {
    const xaiClient = session.xaiClient;
    if (xaiClient?.readyState !== STTWebSocket.OPEN) {
      this.logger.warn(
        { draftId: session.draftId, readyState: xaiClient?.readyState },
        "audio.done skipped — xai-client not open; finish deadline will settle the row"
      );
      return;
    }
    xaiClient.send(
      JSON.stringify({
        type: "audio.done"
      } satisfies STTTypes.OutboundRecord["audio.done"])
    );
  }

  private closeXaiClient(session: STTTypes.Session) {
    const xaiClient = session.xaiClient;
    if (!xaiClient) return;
    xaiClient.removeAllListeners();
    // a CONNECTING socket emits `error` on terminate; never let it go unhandled
    xaiClient.on("error", () => {});
    if (
      xaiClient.readyState === STTWebSocket.OPEN ||
      xaiClient.readyState === STTWebSocket.CONNECTING
    ) {
      xaiClient.terminate();
    }
  }

  // ── timers ───────────────────────────────────────────────────────────

  /** RMS of an Int16LE PCM frame, normalised to 0..1 */
  private frameRms(pcm: Buffer) {
    const samples = pcm.byteLength >> 1;
    if (samples === 0) return 0;
    let sumSq = 0;
    for (let i = 0; i < samples; i++) {
      const s = pcm.readInt16LE(i << 1) / 0x8000;
      sumSq += s * s;
    }
    return Math.sqrt(sumSq / samples);
  }

  /** relative VAD — see the VOICE_* constants */
  private isVoiced(session: STTTypes.Session, rms: number) {
    const floor = this.noiseFloors.get(session) ?? rms;
    const voiced =
      rms > this.VOICE_ABS_MIN_RMS && rms > floor * this.VOICE_OVER_FLOOR;
    // a floor seeded mid-sentence self-corrects on the first quiet frame
    // (fast fall); quiet frames drift it up slowly; voiced frames leave it alone
    const next = voiced
      ? floor
      : rms < floor
        ? rms
        : floor + (rms - floor) * this.FLOOR_ADAPT;
    this.noiseFloors.set(session, next);
    return voiced;
  }

  /**
   * a voiced frame arrived: stamp the clock, and if the "still there?" prompt
   * is up, that IS the answer — back to recording without waiting for
   * `stt_user_present` (the client dismisses its own dialog from local energy)
   */
  private noteVoice(session: STTTypes.Session) {
    session.lastUtteranceAt = performance.now();
    if (session.closeTimer) this.armIdleTimer(session);
  }

  /**
   * check-on-fire: the timer wakes at IDLE_MS and re-arms for the remainder
   * if voice was heard since, so a voiced frame every 100 ms never churns it
   */
  private armIdleTimer(session: STTTypes.Session) {
    this.clearIdleTimers(session);
    const tick = () => {
      if (session.phase !== "recording") return;
      const idleFor = performance.now() - session.lastUtteranceAt;
      if (idleFor < this.IDLE_MS) {
        session.idleTimer = setTimeout(tick, this.IDLE_MS - idleFor);
        return;
      }
      this.trySend(session.ws, {
        type: "stt_user_timeout",
        draftId: session.draftId,
        closesInMs: this.CLOSE_MS
      });
      session.closeTimer = setTimeout(() => {
        if (session.phase !== "recording") return;
        this.finish(
          session.ws,
          { type: "stt_user_finish", draftId: session.draftId },
          "IDLE_TIMEOUT"
        );
      }, this.CLOSE_MS);
    };
    session.idleTimer = setTimeout(tick, this.IDLE_MS);
  }

  private armFinishDeadline(session: STTTypes.Session) {
    this.clearDeadline(session);
    session.deadlineTimer = setTimeout(() => {
      void this.interrupt(
        session,
        "UPSTREAM_ERROR",
        "transcript.done deadline exceeded after audio.done"
      );
    }, this.FINISH_DEADLINE_MS);
  }

  private clearIdleTimers(session: STTTypes.Session) {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    if (session.closeTimer) clearTimeout(session.closeTimer);
    session.idleTimer = null;
    session.closeTimer = null;
  }

  private clearDeadline(session: STTTypes.Session) {
    if (session.deadlineTimer) clearTimeout(session.deadlineTimer);
    session.deadlineTimer = null;
  }

  private clearTimers(session: STTTypes.Session) {
    this.clearIdleTimers(session);
    this.clearDeadline(session);
  }

  // ── terminal transitions ─────────────────────────────────────────────

  /**
   * after each `await` in `connect`: a cancel or socket close that landed
   * while the row/lease was in flight is settled here, by the one writer
   * that knows the row exists
   */
  private async settleStarting(session: STTTypes.Session) {
    if (session.phase !== "terminal") return false;
    if (session.disconnected) {
      await this.prisma
        .dictationInterrupt(
          session.draftId,
          { text: "", durationMs: 0 },
          "CLIENT_DISCONNECTED"
        )
        .catch((err: unknown) =>
          this.logger.warn(
            { draftId: session.draftId, err: this.prisma.safeErrMsg(err) },
            "starting-phase FAILED write did not land"
          )
        );
      await this.releaseRedis(session);
      this.teardown(session);
      return true;
    }
    await this.settleCancel(session);
    return true;
  }

  private async settleCancel(session: STTTypes.Session) {
    try {
      const outcome = await this.prisma.dictationCancel(
        session.draftId,
        session.userId
      );
      await this.releaseRedis(session);
      if (outcome === null) {
        this.sendError(
          session.ws,
          session.draftId,
          404,
          "no dictation to cancel"
        );
        this.teardown(session);
        return;
      }
      this.settledByUser.get(session.userId)?.delete(session.draftId);
      this.trySend(session.ws, {
        type: "stt_user_canceled",
        draftId: session.draftId,
        terminationReason: "USER_CANCELED",
        ...outcome
      });
    } catch (err) {
      this.logger.error(
        { draftId: session.draftId, err: this.prisma.safeErrMsg(err) },
        "dictation cancel failed"
      );
      this.sendError(
        session.ws,
        session.draftId,
        500,
        "dictation cancel failed"
      );
    }
    this.teardown(session);
  }

  private async complete(
    session: STTTypes.Session,
    done: STTTypes.Transcript.Done,
    reason: FinishReason
  ) {
    if (session.phase === "terminal") return;
    session.phase = "terminal";
    this.clearTimers(session);
    const durationMs = Math.round(done.duration * 1000);
    const { text, words } = this.finalTranscript(session, done);

    // completed checkpoint lands before the row and before stt_user_finished
    await this.terminalWrite(
      session,
      this.snapshot(session, "completed", text, done.duration)
    );

    try {
      if (session.disconnected) {
        // aic-client gone: stored for `stt_user_recover`, nothing to send
        const outcome = await this.prisma.dictationInterrupt(
          session.draftId,
          { text, durationMs },
          "CLIENT_DISCONNECTED"
        );
        this.settle(session, text, "CLIENT_DISCONNECTED", true, outcome);
      } else {
        await this.prisma.dictationComplete(
          session.draftId,
          { ...done, text, words },
          reason
        );
        this.settle(session, text, reason, true, {
          couplingStatus: "DECOUPLED",
          recoveryExpiresAt: null
        });
      }
    } catch (err) {
      this.logger.error(
        { draftId: session.draftId, err: this.prisma.safeErrMsg(err) },
        "dictation complete write failed; checkpoint retained in redis"
      );
      this.sendError(
        session.ws,
        session.draftId,
        500,
        "dictation persist failed"
      );
      this.teardown(session);
      return;
    }
    await this.releaseRedis(session);
    this.logger.info(
      {
        draftId: session.draftId,
        chars: text.length,
        tailChars: done.text.length,
        words: words.length,
        tailWords: done.words.length,
        reason
      },
      "stt_user_finished → aic-client"
    );
    this.trySend(session.ws, {
      type: "stt_user_finished",
      draftId: session.draftId,
      words,
      text,
      duration: done.duration,
      sampleRate: session.sampleRate,
      couplingStatus: "DECOUPLED",
      terminationReason: reason
    });
    this.teardown(session);
  }

  private async interrupt(
    session: STTTypes.Session,
    reason: InterruptReason,
    why: string
  ) {
    if (session.phase === "terminal") return;
    session.phase = "terminal";
    this.clearTimers(session);
    this.closeXaiClient(session);
    const { text, words, duration } = this.reconciledText(session.segments);
    const effective = session.disconnected ? "CLIENT_DISCONNECTED" : reason;
    this.logger.warn(
      { draftId: session.draftId, reason: effective, why, chars: text.length },
      "dictation interrupted"
    );

    await this.terminalWrite(
      session,
      this.snapshot(session, "interrupted", text, duration)
    );

    let outcome: Awaited<ReturnType<PrismaService["dictationInterrupt"]>>;
    try {
      outcome = await this.prisma.dictationInterrupt(
        session.draftId,
        { text, durationMs: Math.round(duration * 1000) },
        effective
      );
    } catch (err) {
      this.logger.error(
        { draftId: session.draftId, err: this.prisma.safeErrMsg(err) },
        "dictation interrupt write failed; checkpoint retained in redis"
      );
      this.sendError(
        session.ws,
        session.draftId,
        500,
        "dictation persist failed"
      );
      this.teardown(session);
      return;
    }
    this.settle(session, text, effective, session.reconciled, outcome);
    await this.releaseRedis(session);
    if (!session.disconnected && reason !== "CLIENT_DISCONNECTED") {
      this.trySend(session.ws, {
        type: "stt_user_interrupted",
        draftId: session.draftId,
        text,
        words,
        duration,
        reconciled: session.reconciled,
        terminationReason: reason,
        ...outcome
      });
    }
    this.teardown(session);
  }

  private teardown(session: STTTypes.Session) {
    this.clearTimers(session);
    this.closeXaiClient(session);
    if (this.sessions.get(session.ws) === session) {
      this.sessions.delete(session.ws);
    }
    if (this.liveByUser.get(session.userId) === session) {
      this.liveByUser.delete(session.userId);
    }
    this.drainPromises.delete(session.ws);
    this.clearInflight(session.ws);
  }

  // ── settled registry (userId → draftId → outcome) ────────────────────

  private settledFor(userId: string) {
    let drafts = this.settledByUser.get(userId);
    if (!drafts) {
      drafts = new Map<string, STTTypes.Session.SettledDraft>();
      this.settledByUser.set(userId, drafts);
    }
    return drafts;
  }

  /** lazy eviction: aged past the window, or RECOVERABLE and expired */
  private evictSettled(userId: string) {
    const drafts = this.settledByUser.get(userId);
    if (!drafts) return null;
    const now = Date.now();
    for (const [draftId, entry] of drafts) {
      const aged = now - entry.settledAt > this.SETTLED_TTL_MS;
      const expired =
        entry.couplingStatus === "RECOVERABLE" &&
        entry.recoveryExpiresAt !== null &&
        entry.recoveryExpiresAt <= now;
      if (aged || expired) drafts.delete(draftId);
    }
    if (drafts.size === 0) {
      this.settledByUser.delete(userId);
      return null;
    }
    return drafts;
  }

  private settledEntry(userId: string, draftId: string) {
    return this.evictSettled(userId)?.get(draftId) ?? null;
  }

  /** after `dictationCouple` lands: coupled rows must not linger as DECOUPLED in memory */
  public forgetBatch(userId: string, batchId: string) {
    const drafts = this.settledByUser.get(userId);
    if (!drafts) return;
    for (const [draftId, entry] of drafts) {
      if (entry.batchId === batchId) drafts.delete(draftId);
    }
    if (drafts.size === 0) this.settledByUser.delete(userId);
  }

  private recoverableEntries(userId: string, conversationId?: string | null) {
    const out = Array.of<
      STTTypes.Session.SettledDraft & {
        terminationReason: RecoverableReason;
        recoveryExpiresAt: number;
      }
    >();
    const drafts = this.evictSettled(userId);
    if (!drafts) return out;
    for (const entry of drafts.values()) {
      if (entry.couplingStatus !== "RECOVERABLE") continue;
      if (entry.recoveryExpiresAt === null) continue;
      if (
        conversationId !== undefined &&
        entry.conversationId !== conversationId
      ) {
        continue;
      }
      const { terminationReason, recoveryExpiresAt } = entry;
      if (!this.isRecoverableReason(terminationReason)) continue;
      out.push({ ...entry, terminationReason, recoveryExpiresAt });
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  }

  /** write-through at complete / interrupt; FAILED and ORPHANED are never settled */
  private settle(
    session: STTTypes.Session,
    text: string,
    terminationReason: $Enums.DictationTerminationReason,
    reconciled: boolean,
    outcome: {
      couplingStatus: $Enums.DictationCouplingStatus;
      recoveryExpiresAt: number | null;
    }
  ) {
    if (
      outcome.couplingStatus !== "DECOUPLED" &&
      outcome.couplingStatus !== "RECOVERABLE"
    ) {
      return;
    }
    this.settledFor(session.userId).set(session.draftId, {
      draftId: session.draftId,
      batchId: session.batchId,
      ordinal: session.ordinal,
      conversationId: session.conversationId,
      text,
      terminationReason,
      couplingStatus: outcome.couplingStatus,
      reconciled,
      recoveryExpiresAt: outcome.recoveryExpiresAt,
      createdAt: session.createdAt,
      settledAt: Date.now()
    });
  }

  /**
   * in-memory cancel decision, mirroring `dictationCancel`: DECOUPLED with
   * text → RECOVERABLE (trailing row write); already RECOVERABLE → idempotent
   * re-ack; empty → ORPHANED (trailing row write, entry dropped)
   */
  private cancelSettled(userId: string, entry: STTTypes.Session.SettledDraft) {
    if (entry.couplingStatus === "RECOVERABLE") {
      return {
        couplingStatus: "RECOVERABLE",
        recoveryExpiresAt: entry.recoveryExpiresAt ?? Date.now(),
        trailingWrite: false
      } as const;
    }
    if (entry.text.length > 0) {
      const recoveryExpiresAt = Date.now() + this.SETTLED_TTL_MS;
      entry.couplingStatus = "RECOVERABLE";
      entry.terminationReason = "USER_CANCELED";
      entry.recoveryExpiresAt = recoveryExpiresAt;
      entry.settledAt = Date.now();
      return {
        couplingStatus: "RECOVERABLE",
        recoveryExpiresAt,
        trailingWrite: true
      } as const;
    }
    this.settledByUser.get(userId)?.delete(entry.draftId);
    return {
      couplingStatus: "ORPHANED",
      recoveryExpiresAt: null,
      trailingWrite: true
    } as const;
  }

  private isRecoverableReason(reason: $Enums.DictationTerminationReason) {
    return (
      reason === "USER_CANCELED" ||
      reason === "UPSTREAM_ERROR" ||
      reason === "INTERNAL_ERROR" ||
      reason === "CLIENT_DISCONNECTED"
    );
  }

  // ── checkpoint reconciliation (§8.5) ─────────────────────────────────

  private checkpoint(
    session: STTTypes.Session,
    ev: STTTypes.Transcript.Partial
  ) {
    if (session.phase === "terminal") return; // gate: terminal rows admit nothing
    if (ev.text.trim().length === 0) return; // empty finals ignored
    this.reconcile(session, ev);
    const { text, duration } = this.reconciledText(session.segments);
    session.pendingSnapshot = this.snapshot(session, "active", text, duration);
    if (!session.writeInFlight) {
      this.drainPromises.set(session.ws, this.drain(session));
    }
  }

  /**
   * equal or fully-contained range → replace; adjacent/disjoint → append;
   * partial non-nested overlap → retain both, `reconciled: false`;
   * timestamps compared at the provider's 2-d.p. precision
   */
  private reconcile(
    session: STTTypes.Session,
    ev: STTTypes.Transcript.Partial
  ) {
    const cents = (seconds: number) => Math.round(seconds * 100);
    const nextStart = cents(ev.start);
    const nextEnd = cents(ev.start + ev.duration);
    const kept = Array.of<STTTypes.Session.Segment>();
    for (const seg of session.segments) {
      const segStart = cents(seg.start);
      const segEnd = cents(seg.start + seg.duration);
      const disjoint = segEnd <= nextStart || segStart >= nextEnd;
      const superseded = segStart >= nextStart && segEnd <= nextEnd;
      if (disjoint) {
        kept.push(seg);
      } else if (superseded) {
        continue;
      } else {
        kept.push(seg);
        session.reconciled = false;
      }
    }
    kept.push({
      text: ev.text,
      start: ev.start,
      duration: ev.duration,
      words: ev.words
    });
    kept.sort((a, b) => a.start - b.start);
    session.segments = kept;
  }

  /**
   * `transcript.done.text` is the tail flushed by `audio.done`, not the
   * cumulative transcript (probe 2026-09-16: the utterance-final partial
   * carried 41 chars, done carried 0). The reconciled segments ARE the
   * transcript; `done` contributes only what they don't already hold.
   * Absent word confidence is documented as 0, so it is filled in as 0.
   */
  private finalTranscript(
    session: STTTypes.Session,
    done: STTTypes.Transcript.Done
  ) {
    const reconciled = this.reconciledText(session.segments);
    const words = reconciled.words.map(word => ({
      ...word,
      confidence: word.confidence ?? 0
    }));
    const tail = done.text.trim();
    if (tail.length === 0) return { text: reconciled.text, words };
    // cumulative done (or a single utterance): done is the whole
    if (tail.startsWith(reconciled.text))
      return { text: tail, words: done.words };
    // the tail's own utterance-final already landed
    if (reconciled.text.endsWith(tail)) return { text: reconciled.text, words };
    return {
      text: `${reconciled.text} ${tail}`.trim(),
      words: [...words, ...done.words]
    };
  }

  private reconciledText(segments: STTTypes.Session.Segment[]) {
    const last = segments.at(-1);
    return {
      text: segments.map(s => s.text).join(" "),
      words: segments.flatMap(s => s.words),
      duration: last ? Math.round((last.start + last.duration) * 100) / 100 : 0
    };
  }

  // ── redis: coalescing writer with terminal gate (§8.4) ───────────────

  private stateKey(userId: string, draftId: string) {
    return `stt:${userId}:${draftId}` as const;
  }

  private ownKey(userId: string, draftId: string) {
    return `stt:own:${userId}:${draftId}` as const;
  }

  private snapshot(
    session: STTTypes.Session,
    state: STTTypes.Session.CheckpointState,
    text: string,
    duration: number
  ) {
    return {
      v: 1,
      draftId: session.draftId,
      externalId: session.externalId,
      ownerRunId: this.runId,
      leaseUntil: Date.now() + this.LEASE_S * 1000,
      state,
      text,
      segments: session.segments,
      reconciled: session.reconciled,
      settings: { encoding: "pcm", sampleRate: session.sampleRate },
      duration,
      updatedAt: Date.now()
    } satisfies STTTypes.Session.Checkpoint;
  }

  /** one pending slot, one write in flight; superseded snapshots coalesce */
  private async drain(session: STTTypes.Session) {
    while (session.pendingSnapshot) {
      const snap = session.pendingSnapshot;
      session.pendingSnapshot = null;
      session.writeInFlight = true;
      try {
        await this.withDeadline(
          this.redis.set(
            this.stateKey(session.userId, session.draftId),
            JSON.stringify(snap),
            { expiration: { type: "EX", value: this.CHECKPOINT_TTL_S } }
          )
        );
        session.storage = "ok";
      } catch (err) {
        session.storage = "unavailable";
        this.logger.warn(
          { draftId: session.draftId, err: this.prisma.safeErrMsg(err) },
          "checkpoint write failed"
        );
      } finally {
        session.writeInFlight = false;
      }
    }
  }

  /** the terminal snapshot goes through the same writer after the slot clears */
  private async terminalWrite(
    session: STTTypes.Session,
    snap: STTTypes.Session.Checkpoint
  ) {
    session.pendingSnapshot = snap;
    if (!session.writeInFlight) {
      this.drainPromises.set(session.ws, this.drain(session));
    }
    await this.drainPromises.get(session.ws);
  }

  private async leaseDraft(session: STTTypes.Session) {
    try {
      const reply = await this.withDeadline(
        this.redis.set(
          this.ownKey(session.userId, session.draftId),
          this.runId,
          { condition: "NX", expiration: { type: "EX", value: this.LEASE_S } }
        )
      );
      return reply === "OK" ? ("leased" as const) : ("owned" as const);
    } catch (err) {
      session.storage = "unavailable";
      this.logger.warn(
        { draftId: session.draftId, err: this.prisma.safeErrMsg(err) },
        "ownership lease unavailable; proceeding"
      );
      return "unavailable" as const;
    }
  }

  private renewLease(session: STTTypes.Session) {
    void this.withDeadline(
      this.redis.expire(
        this.ownKey(session.userId, session.draftId),
        this.LEASE_S
      )
    ).catch((err: unknown) => {
      session.storage = "unavailable";
      this.logger.debug(
        { draftId: session.draftId, err: this.prisma.safeErrMsg(err) },
        "lease renewal failed"
      );
    });
  }

  private async releaseRedis(session: STTTypes.Session) {
    try {
      await this.releaseRedisKeys(session.userId, session.draftId);
    } catch (err) {
      session.storage = "unavailable";
      this.logger.warn(
        { draftId: session.draftId, err: this.prisma.safeErrMsg(err) },
        "redis release failed"
      );
    }
  }

  private releaseRedisKeys(userId: string, draftId: string) {
    return this.withDeadline(
      this.redis.del([
        this.stateKey(userId, draftId),
        this.ownKey(userId, draftId)
      ])
    );
  }

  /**
   * `RedisInstance` runs `disableOfflineQueue: false`, so a command issued
   * during a reconnect stalls rather than fails; bound it here without
   * changing the shared client's policy
   */
  private withDeadline<const T>(
    command: Promise<T>,
    ms = this.STORAGE_DEADLINE_MS
  ) {
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    const timer = setTimeout(
      () => reject(new Error(`redis command exceeded ${ms}ms`)),
      ms
    );
    command.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return promise;
  }

  // ── hop-1 send helpers ───────────────────────────────────────────────

  protected trySend(ws: WebSocket, data: STTEventUnion) {
    if (ws.readyState !== STTWebSocket.OPEN) {
      this.logger.debug(
        { type: data.type, readyState: ws.readyState },
        "trySend skipped — socket not open"
      );
      return false;
    }
    try {
      ws.send(JSON.stringify(data));
      return true;
    } catch (err) {
      this.logger.debug(
        {
          type: data.type,
          err: err instanceof Error ? err.message : "unknown send error"
        },
        "trySend failed — client likely disconnected"
      );
      return false;
    }
  }

  protected sendError(
    ws: WebSocket,
    draftId: string,
    status: number,
    statusText: string
  ) {
    return this.trySend(ws, {
      type: "stt_user_error",
      draftId,
      status,
      statusText
    });
  }

  private isRecoverableRow(row: RecoverRow): row is RecoverRow & {
    terminationReason: RecoverableReason;
    recoveryExpiresAt: Date;
  } {
    return (
      row.recoveryExpiresAt !== null &&
      (row.terminationReason === "USER_CANCELED" ||
        row.terminationReason === "UPSTREAM_ERROR" ||
        row.terminationReason === "INTERNAL_ERROR" ||
        row.terminationReason === "CLIENT_DISCONNECTED")
    );
  }

  // ── drain tracking (mirrors TTSService) ──────────────────────────────

  private registerInflight(ws: WebSocket) {
    if (this.inflightPromises.has(ws)) return;
    const { promise, resolve } = Promise.withResolvers<void>();
    this.inflightPromises.set(ws, promise);
    this.inflightResolvers.set(ws, resolve);
  }

  private clearInflight(ws: WebSocket) {
    const resolve = this.inflightResolvers.get(ws);
    if (resolve) resolve();
    this.inflightResolvers.delete(ws);
    this.inflightPromises.delete(ws);
  }

  /**
   * wait for every live session to reach terminal or for the deadline;
   * re-snapshots each tick so sessions admitted mid-drain are awaited;
   * never throws
   */
  public awaitAllInflight(
    timeoutMs = Number(process.env.INFLIGHT_DRAIN_TIMEOUT_MS ?? 90_000)
  ) {
    if (this.inflightPromises.size === 0) return Promise.resolve();

    const { promise: drainComplete, resolve: resolveDrain } =
      Promise.withResolvers<void>();
    const deadline = Date.now() + timeoutMs;
    const POLL_INTERVAL_MS = 5_000;

    const tick = async () => {
      if (this.inflightPromises.size === 0) {
        this.logger.info("Drain complete: all live dictations settled");
        resolveDrain();
        return;
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        this.logger.warn(
          { remaining: this.inflightPromises.size },
          "Drain deadline exceeded, abandoning live dictations"
        );
        resolveDrain();
        return;
      }
      this.logger.info(
        { remaining: this.inflightPromises.size, msUntilDeadline: remainingMs },
        "Draining live dictations"
      );
      const snapshot = Array.from(this.inflightPromises.values());
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
}

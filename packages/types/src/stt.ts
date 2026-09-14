import type { CTR, UTR } from "@/utils.ts";
import type { WebSocket } from "ws";
import type { $Enums } from "@slipstream/db/node/generated/client";

export namespace STTTypes {
  /**
   * `sample_rate`
   *
   * Optional (default: 16000): Audio sample rate in Hz.
   * Ignored with `encoding=opus` — Opus packets are sample-rate-agnostic.
   */
  export type SampleRate = 8000 | 16000 | 22050 | 24000 | 44100 | 48000;
  /**
   * `encoding`
   *
   * Optional (default: `pcm`): Audio encoding format.
   *
   * `pcm` — signed 16-bit little-endian (2 bytes/sample).
   *
   * `mulaw` — G.711 µ-law (1 byte/sample).
   *
   * `alaw` — G.711 A-law (1 byte/sample).
   *
   * `opus` — raw Opus packets, one packet per binary WebSocket frame, mono only.
   */
  export type Encoding = "pcm" | "mulaw" | "alaw" | "opus";
  /**
   * `language`
   *
   * Optional (default: (empty)): Language code (e.g. `en`, `fr`, `de`, `ja`, `es`).
   * When set, enables Inverse Text Normalization — spoken-form numbers, currencies, and units are converted to their written form.
   */
  export type Language =
    | "ar"
    | "cs"
    | "da"
    | "de"
    | "en"
    | "es"
    | "fa"
    | "fil"
    | "fr"
    | "hi"
    | "id"
    | "it"
    | "ja"
    | "ko"
    | "mk"
    | "ms"
    | "nl"
    | "pl"
    | "pt"
    | "ro"
    | "ru"
    | "sv"
    | "th"
    | "tr"
    | "vi";
  export interface QueryParameters {
    /**
     * Optional (default: 16000): Audio sample rate in Hz.
     * Ignored with `encoding=opus` — Opus packets are sample-rate-agnostic.
     */
    sample_rate?: SampleRate;
    /**
     * Optional (default: `pcm`): Audio encoding format.
     *
     * `pcm` — signed 16-bit little-endian (2 bytes/sample).
     *
     * `mulaw` — G.711 µ-law (1 byte/sample).
     *
     * `alaw` — G.711 A-law (1 byte/sample).
     *
     * `opus` — raw Opus packets, one packet per binary WebSocket frame, mono only.
     */
    encoding?: Encoding;
    /**
     * Optional (default: false): When `true`, the server emits
     * partial transcript events (`is_final=false`) approximately every 500 ms
     * while audio is being processed. When `false` (default), only finalized results are sent.
     */
    interim_results?: boolean;
    /**
     * Optional (default: 400): Silence duration in milliseconds before the server fires
     * a `speech_final=true` event, indicating the speaker stopped talking. Range: 0–5000.
     * Set to `0` for no delay (fire on any VAD silence boundary). Default: 400ms.
     */
    endpointing?: number;
    /**
     * Optional (default: (empty)): Language code (e.g. `en`, `fr`, `de`, `ja`, `es`).
     * When set, enables Inverse Text Normalization — spoken-form numbers, currencies, and units are converted to their written form.
     */
    language?: Language;
    /**
     * Optional (default: false): When `true`, enables per-channel transcription for interleaved multichannel audio.
     * Requires `channels` to be set to ≥ 2. Not supported with `encoding=opus`.
     */
    multichannel?: boolean;
    /**
     * Optional (default: 1): Number of interleaved audio channels. Required when `multichannel=true`. Min: 2, Max: 8.
     */
    channels?: number;
    /**
     * Optional (default: false): When `true`, enables speaker diarization.
     * Words in `transcript.partial` and `transcript.done` events include a `speaker` field (integer) identifying the detected speaker.
     */
    diarize?: boolean;
    /**
     * Optional (repeatable): A key term to bias transcription toward (e.g. product names, proper nouns).
     * Repeat the parameter for each term (e.g. `keyterm=Understand+The+Universe`).
     * Max 100 terms, each up to 50 characters.
     */
    keyterm?: string;
    /**
     * Optional (default: false): When `true`, filler words (e.g. `uh`, `um`, `er`) are included in the transcript.
     * When `false` (default), filler words are automatically removed from the transcript text and the `words` array.
     */
    filler_words?: boolean;
    /**
     * Optional: Enable Smart Turn end-of-turn detection. Set to a confidence threshold between `0.0` and `1.0`.
     * When the model's end-of-turn probability exceeds this threshold at a VAD silence boundary, `speech_final` fires immediately.
     * When confidence is below the threshold, `speech_final` is suppressed and the event is demoted to `chunk_final`.
     * Every `transcript.partial` event includes an `end_of_turn_confidence` field (0.0–1.0) when Smart Turn is enabled.
     * Example: `smart_turn=0.7`.
     */
    smart_turn?: number;
    /**
     * Optional: Maximum silence duration in milliseconds before forcing `speech_final`, even when the Smart Turn model predicts the speaker hasn't finished.
     * Acts as a safety net to prevent sessions from hanging during extended silence. Only applies when `smart_turn` is enabled. Range: 1–5000.
     * Example: `smart_turn_timeout=3000`.
     */
    smart_turn_timeout?: number;
    /**
     * Optional (default: 0.08): Speech-probability threshold for the voice-activity gate (0.0–1.0). Audio in chunks scoring below the threshold is treated as non-speech and skipped for transcription.
     * Lower values transcribe quieter or noisier speech (e.g. narrowband telephony) but may produce spurious text for background noise; `0` disables the gate entirely.
     * Does not affect endpointing or `speech_final` timing.
     */
    vad_threshold?: number;
  }

  export namespace Session {
    export type SessionPhase =
      "starting" | "recording" | "finishing" | "terminal";

    export type Segment = {
      text: string;
      start: number;
      duration: number;
      words: Transcript.Words[];
    };

    export type CheckpointState = "active" | "completed" | "interrupted";
    export interface CheckpointSettings {
      encoding: Encoding;
      sampleRate: SampleRate;
      language?: Language;
    }
    export interface Checkpoint {
      v: 1;
      draftId: string;
      externalId: string | null;
      ownerRunId: string;
      leaseUntil: number;
      state: CheckpointState;
      text: string;
      segments: Segment[];
      reconciled: boolean;
      settings: CheckpointSettings;
      duration?: number;
      updatedAt: number;
    }

    export type SettledDraft = {
      draftId: string;
      batchId: string;
      ordinal: number;
      conversationId: string | null;
      text: string;
      terminationReason: $Enums.DictationTerminationReason;
      couplingStatus: Extract<
        $Enums.DictationCouplingStatus,
        "DECOUPLED" | "RECOVERABLE"
      >;
      reconciled: boolean;
      recoveryExpiresAt: number | null;
      createdAt: number;
      settledAt: number;
    };
  }
  export interface Session {
    readonly draftId: string;
    readonly userId: string;
    readonly batchId: string;
    readonly ordinal: number;
    readonly conversationId: string | null;
    readonly createdAt: number;
    readonly ws: WebSocket; // hop 1 — the aic-client socket
    readonly sampleRate: SampleRate;
    xaiClient: WebSocket | null; // hop 2 — null until opened
    externalId: string | null;
    phase: Session.SessionPhase;
    pendingReason: "USER_FINISHED" | "IDLE_TIMEOUT";
    disconnected: boolean;
    expectedFrameOrdinal: number;
    lastUtteranceAt: number;
    idleTimer: NodeJS.Timeout | null;
    closeTimer: NodeJS.Timeout | null;
    deadlineTimer: NodeJS.Timeout | null;
    finalReceived: boolean;
    reconciled: boolean;
    segments: Session.Segment[];
    storage: "ok" | "unavailable";
    pendingSnapshot: Session.Checkpoint | null;
    writeInFlight: boolean;
  }

  /**
   * Server &rarr; Client
   */
  export namespace Transcript {
    /**
     * Sent immediately after the WebSocket connection is established and the server is ready to receive audio. **Wait for this event before sending audio** — the server needs to initialize its ASR backend.
     */
    export interface Created {
      type: "transcript.created";
      /**
       * Unique session identifier (UUID).
       */
      id: string;
    }
    /**
     * A transcript result for a portion of the audio stream. Two boolean fields convey state:
     * interim (`is_final=false`) means text may still change,
     * chunk final (`is_final=true`, `speech_final=false`) means the chunk is locked,
     * and utterance final (`is_final=true`,`speech_final=true`) means the speaker stopped talking.
     */
    export interface Words {
      /**
       * The word text.
       */
      text: string;
      /**
       * Word start time in seconds (2 d.p.).
       */
      start: number;
      /**
       * Word end time in seconds (2 d.p.).
       */
      end: number;
      /**
       * Confidence score (0.0–1.0). Omitted when 0. Always present on `transcript.done`
       */
      confidence?: number;
      /**
       * Speaker index (0-based). Only present when `diarize=true`
       */
      speaker?: number;
    }
    export interface Partial {
      type: "transcript.partial";
      /**
       * Transcript text for this chunk.
       */
      text: string;
      /**
       * Word-level details with timestamps and confidence scores.
       */
      words: Words[];
      /**
       * Chunk-level finality.
       * `false` = partial (text may change).
       * `true` = chunk fully transcribed (text locked).
       */
      is_final: boolean;
      /**
       * Utterance-level finality.
       * `true` = speaker stopped talking (VAD endpointing).
       * Only meaningful when `is_final=true`.
       */
      speech_final: boolean;
      /**
       * Start position in the audio stream (seconds from stream start, 2 d.p.).
       */
      start: number;
      /**
       * Duration of audio covered by this result (seconds, 2 d.p.).
       */
      duration: number;
      /**
       * Channel index. Only present when `multichannel=true`.
       */
      channel_index?: number;
      /**
       * End-of-turn confidence from the Smart Turn model (0.0–1.0).
       * Only present when `smart_turn` is enabled.
       * Higher values indicate the speaker has likely finished their thought.
       * During active speech the value is `0.0`;
       * at silence boundaries the model evaluates accumulated audio and publishes a confidence score.
       */
      end_of_turn_confidence?: number;
    }
    /**
     * Final transcript after `audio.done`.
     * `duration` always present.
     * One per channel when `multichannel=true`.
     * Connection closes after this event.
     */
    export interface Done {
      type: "transcript.done";
      /**
       * Final transcript text.
       */
      text: string;
      /**
       * Word-level details for the final transcript.
       */
      words: CTR<Words, "confidence">[];
      /**
       * Total audio duration processed (seconds, 2 d.p.).
       */
      duration: number;
      /**
       * Channel index. Only present when `multichannel=true`.
       */
      channel_index?: number;
      /**
       * End-of-turn confidence from the Smart Turn model (0.0–1.0).
       * Only present when `smart_turn` is enabled.
       * Higher values indicate the speaker has likely finished their thought.
       * During active speech the value is `0.0`;
       * at silence boundaries the model evaluates accumulated audio and publishes a confidence score.
       */
      end_of_turn_confidence?: number;
    }
  }
  /**
   * Client &rarr; Server
   *
   * Force the current utterance to finalize as `speech_final` immediately, without waiting for VAD endpointing or Smart Turn.
   * The session stays open so you can continue streaming audio. Accepts `finalize` or `Finalize` as the type value.
   * When `multichannel=true`, optional `channel` (0-based) limits the finalize to that channel; omit `channel` to finalize every channel.
   */
  export interface Finalize {
    type: "finalize";
    /**
     * Optional 0-based channel index. Only meaningful when `multichannel=true`.
     * When omitted, all channels are finalized.
     */
    channel?: number;
  }
  /**
   * Server &rarr; Client
   *
   * An error occurred during the session. Most errors (pipeline failures, stream timeouts, undecodable audio frames) close the connection. Only client message parse errors keep the connection open.
   */
  export interface Error {
    type: "error";
    message: string;
  }
  export namespace Audio {
    /**
     * Client &rarr; Server
     *
     * Signal that all audio has been sent. The server flushes any remaining buffered audio, emits final transcript events, and sends a `transcript.done` event.
     * The connection closes after `transcript.done`.
     */
    export interface Done {
      type: "audio.done";
    }
  }

  /**
   * Server &rarr; Client — every JSON frame the xAI STT socket emits; the
   * relay's parse target (`JSON.parse<STTTypes.Inbound>(raw.toString())`).
   */
  export type Inbound =
    Transcript.Created | Transcript.Partial | Transcript.Done | Error;

  /**
   * Client &rarr; Server JSON control frames — the two we are responsible for
   * sending upstream, with different lifecycles:
   *
   * `finalize` — optional + repeatable. Locks the current utterance as
   * `speech_final` NOW instead of waiting for VAD endpointing / Smart Turn;
   * the session stays open and audio keeps streaming.
   *
   * `audio.done` — terminal + exactly once. Flushes buffered audio, emits the
   * final transcript events, then `transcript.done`, then the socket closes.
   *
   * The third outbound kind is the binary audio frame — see {@link AudioFrame}.
   */
  export type Outbound = Finalize | Audio.Done;

  /**
   * Client &rarr; Server binary WebSocket frame — one real-time-paced chunk
   * (~100 ms) of raw bytes in the `encoding` query param's format; never
   * base64. With `encoding=opus` each frame is exactly one raw Opus packet —
   * never concatenated, never split across frames. An undecodable frame
   * sends an `error` event and closes the session. Not a JSON event: it has
   * no `type` discriminant, so `ws`'s `isBinary` flag is its only runtime
   * discriminant.
   */
  export type AudioFrame = Buffer;

  export type InboundRecord = UTR<Inbound, "type">;

  export type OutboundRecord = UTR<Outbound, "type">;

  export type IO = Outbound | Inbound;

  export type IORecord = UTR<IO, "type">;
}

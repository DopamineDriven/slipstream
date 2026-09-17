import type { Worklet } from "@d0paminedriven/stt-worklet/types";
import type { STTTypes } from "@slipstream/types";

export type CaptureInterruptReason =
  "audio-session" | "hidden" | "pagehide" | "track-ended";

export interface PcmCaptureCallbacks {
  /** every worklet chunk, in order; the flush after `stop` arrives here before `drained` */
  onChunk: (chunk: Worklet.WorkletToMain.Chunk) => void;
  /** per-chunk RMS of the emitted samples (0..1) — waveform + voice-energy presence */
  onLevel?: (rms: number) => void;
  /** the mic is gone or about to be: the owner should finish the dictation */
  onInterrupted: (reason: CaptureInterruptReason) => void;
}

const WORKLET_URL = "/worklets/pcm-capture.js";
const PROCESSOR_NAME = "pcm-capture";
const CHUNK_MS = 100;
/** `drained` must follow `stop` within this; past it the tail is abandoned */
const DRAIN_TIMEOUT_MS = 1_000;
/** integer-ratio targets the worklet box-filters cleanly; order = preference */
const TARGET_RATES = [
  16000, 22050, 24000, 8000, 44100, 48000
] as const satisfies readonly STTTypes.SampleRate[];

function isSampleRate(rate: number) {
  return (
    rate === 8000 ||
    rate === 16000 ||
    rate === 22050 ||
    rate === 24000 ||
    rate === 44100 ||
    rate === 48000
  );
}

/**
 * the rate the worklet emits at, chosen so `contextRate / target` is an
 * integer: 48000 → 16000, 44100 → 22050, 24000 → 24000. Anything the
 * provider accepts as-is passes through; the last resort is 16000 on the
 * worklet's fractional fallback.
 */
export function pickTargetSampleRate(contextRate: number) {
  for (const rate of TARGET_RATES) {
    if (contextRate % rate === 0) return rate;
  }
  return isSampleRate(contextRate) ? contextRate : 16000;
}

export function pcmToBase64(pcm: ArrayBuffer) {
  const bytes = new Uint8Array(pcm);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Main-thread owner of one dictation's audio graph:
 * mic → AudioWorklet(pcm-capture) → muted gain → destination.
 *
 * Construct INSIDE the user gesture — the AudioContext is created and
 * resumed synchronously in the constructor so iOS treats it as activated.
 * `start()` may then await freely. Every terminal path goes through
 * `dispose()`, which releases the track, the nodes, the context, and
 * restores the audio session type it found.
 */
export class PcmCapture {
  public readonly targetSampleRate: STTTypes.SampleRate;
  private readonly ctx: AudioContext;
  private readonly priorSessionType: AudioSession["type"] | undefined;
  private readonly cleanups = Array.of<() => void>();
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private drained: PromiseWithResolvers<Worklet.WorkletToMain.Drained> | null =
    null;
  private disposed = false;

  constructor(private readonly callbacks: PcmCaptureCallbacks) {
    this.priorSessionType = navigator.audioSession?.type;
    if (navigator.audioSession) {
      navigator.audioSession.type = "play-and-record";
    }
    this.ctx = new AudioContext();
    void this.ctx.resume();
    this.targetSampleRate = pickTargetSampleRate(this.ctx.sampleRate);
  }

  public get contextSampleRate() {
    return this.ctx.sampleRate;
  }

  public get isDisposed() {
    return this.disposed;
  }

  /** resolves once frames are flowing; rejects on permission denial or teardown mid-start */
  public async start() {
    if (this.disposed) throw new Error("capture already disposed");
    await this.ctx.audioWorklet.addModule(WORKLET_URL);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    if (this.disposed) {
      for (const track of stream.getTracks()) track.stop();
      throw new Error("capture disposed during start");
    }
    this.stream = stream;
    const track = stream.getAudioTracks()[0];
    const inputSampleRate = track?.getSettings().sampleRate;

    const node = new AudioWorkletNode(this.ctx, PROCESSOR_NAME, {
      numberOfInputs: 1,
      // a node with no outputs isn't reliably pulled by every engine; the
      // worklet writes silence and a muted gain keeps the graph running
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
      processorOptions: {
        targetSampleRate: this.targetSampleRate,
        chunkMs: CHUNK_MS
      } satisfies Worklet.PCMCapture
    });
    node.port.onmessage = ({ data }: MessageEvent<Worklet.WorkletToMain>) => {
      switch (data.type) {
        case "chunk": {
          this.callbacks.onLevel?.(data.rms);
          this.callbacks.onChunk(data);
          return;
        }
        case "drained": {
          this.drained?.resolve(data);
          return;
        }
      }
    };

    const source = this.ctx.createMediaStreamSource(stream);
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    source.connect(node);
    node.connect(mute);
    mute.connect(this.ctx.destination);
    this.source = source;
    this.node = node;

    if (track) {
      const onEnded = () => this.callbacks.onInterrupted("track-ended");
      track.addEventListener("ended", onEnded);
      this.cleanups.push(() => track.removeEventListener("ended", onEnded));
    }
    const session = navigator.audioSession;
    if (session) {
      const onStateChange = () => {
        if (session.state === "interrupted") {
          this.callbacks.onInterrupted("audio-session");
        }
      };
      session.addEventListener("statechange", onStateChange);
      this.cleanups.push(() =>
        session.removeEventListener("statechange", onStateChange)
      );
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        this.callbacks.onInterrupted("hidden");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    this.cleanups.push(() =>
      document.removeEventListener("visibilitychange", onVisibility)
    );
    const onPageHide = () => this.callbacks.onInterrupted("pagehide");
    window.addEventListener("pagehide", onPageHide);
    this.cleanups.push(() =>
      window.removeEventListener("pagehide", onPageHide)
    );

    return { sampleRate: this.targetSampleRate, inputSampleRate };
  }

  /**
   * flush the worklet and wait for its `drained` ack — the tail chunk comes
   * through `onChunk` first, so the caller may send `stt_user_finish` the
   * moment this resolves. Always disposes.
   */
  public async stop() {
    const node = this.node;
    if (!node || this.disposed) {
      this.dispose();
      return { frames: 0, drained: false } as const;
    }
    this.drained ??= Promise.withResolvers<Worklet.WorkletToMain.Drained>();
    node.port.postMessage({ type: "stop" } satisfies Worklet.MainToWorklet);
    const timeout = Promise.withResolvers<null>();
    const timer = setTimeout(() => timeout.resolve(null), DRAIN_TIMEOUT_MS);
    const result = await Promise.race([this.drained.promise, timeout.promise]);
    clearTimeout(timer);
    this.dispose();
    return result
      ? ({ frames: result.frames, drained: true } as const)
      : ({ frames: 0, drained: false } as const);
  }

  /** immediate teardown; idempotent */
  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.port.close();
      this.node.disconnect();
      this.node = null;
    }
    this.source?.disconnect();
    this.source = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    void this.ctx.close().catch(() => undefined);
    if (navigator.audioSession && this.priorSessionType !== undefined) {
      navigator.audioSession.type = this.priorSessionType;
    }
  }
}

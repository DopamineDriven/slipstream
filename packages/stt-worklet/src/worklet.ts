// eslint-disable-next-line
/// <reference path="./types/audioworklet.d.ts" />
/**
 * AudioWorkletProcessor: mic Float32 → PCM16LE mono chunks at `targetSampleRate`.
 *
 * Runs on the audio rendering thread. No fetch / WebSocket / timers exist here;
 * the only job is capture → resample → int16 → chunk → post. Keep this file free
 * of runtime imports (type-only is fine) so `unbundle` emits one self-contained
 * file that can be copied into public/ on its own.
 */
import type { Worklet } from "@/types/index.ts";

const DEFAULTS = {
  targetSampleRate: 16_000,
  chunkMs: 100
} satisfies Worklet.PCMCapture;

class PCMCaptureProcessor extends AudioWorkletProcessor {
  private readonly opts: Worklet.PCMCapture;
  /** input samples per emitted sample: 3 for 48k→16k, 2 for 44.1k→22.05k, 1 at the target rate */
  private readonly step: number;
  /**
   * integer ratios decimate through a box filter (mean of `step` inputs) so
   * energy above the new Nyquist is attenuated instead of folded back into
   * the speech band; a fractional ratio falls back to a nearest-neighbour
   * read cursor — pick `targetSampleRate` on the main thread so this stays
   * integer
   */
  private readonly boxFilter: boolean;
  /** reused across chunks; the only per-chunk allocation is the exact-size slice in flush() */
  private readonly buf: Int16Array<ArrayBuffer>;
  /** this.port until an `attach` swaps in a Worker's port */
  private out: MessagePort;
  private offset = 0;
  /** box filter: running sum + count of inputs folded into the next output */
  private acc = 0;
  private accCount = 0;
  /** fractional fallback: read cursor carried across 128-sample render quanta */
  private phase = 0;
  private sumSq = 0;
  private frameOrdinal = 0;
  private running = true;

  constructor({
    processorOptions
  }: { processorOptions?: Partial<Worklet.PCMCapture> } = {}) {
    super();
    this.opts = { ...DEFAULTS, ...processorOptions };
    this.step = sampleRate / this.opts.targetSampleRate;
    this.boxFilter = Number.isInteger(this.step);
    this.buf = new Int16Array(
      Math.round((this.opts.targetSampleRate * this.opts.chunkMs) / 1000)
    );
    this.out = this.port;

    this.port.onmessage = ({ data }: MessageEvent<Worklet.MainToWorklet>) => {
      switch (data.type) {
        case "attach":
          this.out = data.port;
          break;
        case "stop":
          this.flush();
          this.running = false;
          this.out.postMessage({
            type: "drained",
            frames: this.frameOrdinal
          } satisfies Worklet.WorkletToMain);
          break;
      }
    };
  }

  process(inputs: Float32Array[][]) {
    if (!this.running) return false; // lets the node be collected after stop
    const ch = inputs[0]?.[0]; // mono; undefined during startup/teardown
    if (!ch) return true;

    if (this.boxFilter) {
      // eslint-disable-next-line
      for (let i = 0; i < ch.length; i++) {
        this.acc += Math.max(-1, Math.min(1, ch[i] ?? 0));
        if (++this.accCount === this.step) {
          this.push(this.acc / this.step);
          this.acc = 0;
          this.accCount = 0;
        }
      }
      return true;
    }

    let i = this.phase;
    for (; i < ch.length; i += this.step) {
      this.push(Math.max(-1, Math.min(1, ch[Math.floor(i)] ?? 0)));
    }
    this.phase = i - ch.length;
    return true;
  }

  /** one output sample: quantize, track energy, flush a full chunk */
  private push(s: number) {
    this.sumSq += s * s;
    this.buf[this.offset++] = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
    if (this.offset === this.buf.length) this.flush();
  }

  private flush() {
    if (this.offset === 0) return;
    const pcm = this.buf.slice(0, this.offset).buffer; // fresh, exact-size, transferable
    const rms = Math.sqrt(this.sumSq / this.offset);
    this.out.postMessage(
      {
        type: "chunk",
        frameOrdinal: this.frameOrdinal++,
        pcm,
        rms
      } satisfies Worklet.WorkletToMain,
      [pcm]
    );
    this.offset = 0;
    this.sumSq = 0;
  }
}

registerProcessor("pcm-capture", PCMCaptureProcessor);

/**
 * PCMStreamPlayer — gaplessly schedules 16-bit LE mono PCM chunks
 * via Web Audio API for true streaming playback.
 *
 * Must be constructed from a user gesture (click/tap) to satisfy
 * browser autoplay policy.
 */
export class PCMStreamPlayer {
  private ctx: AudioContext;
  private nextStartTime = 0;
  private sources = Array.of<AudioBufferSourceNode>();
  private readonly sampleRate: number;
  private _stopped = false;

  constructor(sampleRate = 24000, safariAudioSession = false) {
    this.sampleRate = sampleRate;
    if (safariAudioSession) {
      PCMStreamPlayer.enablePlaybackAudioSession();
    }
    this.ctx = new AudioContext({ sampleRate });
  }

  /**
   * Sets the audio session type to "playback" so iOS Safari
   * plays audio even when the hardware mute switch is on.
   * No-ops on non-Safari browsers. Zero latency.
   */
  static enablePlaybackAudioSession() {
    if (navigator.audioSession != null) {
      navigator.audioSession.type = "playback";
    }
  }

  /**
   * Decode a base64-encoded PCM chunk (16-bit signed LE, mono)
   * and schedule it for gapless playback.
   */
  pushChunk(base64: string) {
    if (this._stopped) return;

    // base64 → raw bytes
    const binary = atob(base64);
    const raw = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      raw[i] = binary.charCodeAt(i);
    }

    // Interpret as 16-bit signed LE
    const int16 = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);

    // Normalize to Float32 [-1, 1]
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      const sample = int16[i];
      if (sample !== undefined) {
        float32[i] = sample / 32768;
      }
    }

    // Create AudioBuffer and fill
    const buffer = this.ctx.createBuffer(1, float32.length, this.sampleRate);
    buffer.getChannelData(0).set(float32);

    // Create source node
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);

    // Schedule gaplessly
    const startTime = Math.max(this.ctx.currentTime, this.nextStartTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;

    this.sources.push(source);
  }

  /**
   * Returns a promise that resolves when all currently scheduled
   * audio has finished playing. Does NOT stop playback.
   */
  drain() {
    const remaining = this.nextStartTime - this.ctx.currentTime;
    if (remaining <= 0) return Promise.resolve();
    return new Promise<void>(resolve =>
      setTimeout(resolve, remaining * 1000)
    );
  }

  stop() {
    this._stopped = true;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // already stopped or not yet started — safe to ignore
      }
    }
    this.sources = Array.of<AudioBufferSourceNode>();
    this.nextStartTime = 0;
  }

  async close() {
    this.stop();
    if (this.ctx.state !== "closed") {
      await this.ctx.close();
    }
  }

  get isActive() {
    return this.ctx.state === "running" && !this._stopped;
  }
}

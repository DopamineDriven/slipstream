//#region src/worklet.ts
const DEFAULTS = {
	targetSampleRate: 16e3,
	chunkMs: 100
};
var PCMCaptureProcessor = class extends AudioWorkletProcessor {
	opts;
	/** input samples per emitted sample: 3 for 48k→16k, 2 for 44.1k→22.05k, 1 at the target rate */
	step;
	/**
	* integer ratios decimate through a box filter (mean of `step` inputs) so
	* energy above the new Nyquist is attenuated instead of folded back into
	* the speech band; a fractional ratio falls back to a nearest-neighbour
	* read cursor — pick `targetSampleRate` on the main thread so this stays
	* integer
	*/
	boxFilter;
	/** reused across chunks; the only per-chunk allocation is the exact-size slice in flush() */
	buf;
	/** this.port until an `attach` swaps in a Worker's port */
	out;
	offset = 0;
	/** box filter: running sum + count of inputs folded into the next output */
	acc = 0;
	accCount = 0;
	/** fractional fallback: read cursor carried across 128-sample render quanta */
	phase = 0;
	sumSq = 0;
	frameOrdinal = 0;
	running = true;
	constructor({ processorOptions } = {}) {
		super();
		this.opts = {
			...DEFAULTS,
			...processorOptions
		};
		this.step = sampleRate / this.opts.targetSampleRate;
		this.boxFilter = Number.isInteger(this.step);
		this.buf = new Int16Array(Math.round(this.opts.targetSampleRate * this.opts.chunkMs / 1e3));
		this.out = this.port;
		this.port.onmessage = ({ data }) => {
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
					});
			}
		};
	}
	process(inputs) {
		if (!this.running) return false;
		const ch = inputs[0]?.[0];
		if (!ch) return true;
		if (this.boxFilter) {
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
		for (; i < ch.length; i += this.step) this.push(Math.max(-1, Math.min(1, ch[Math.floor(i)] ?? 0)));
		this.phase = i - ch.length;
		return true;
	}
	/** one output sample: quantize, track energy, flush a full chunk */
	push(s) {
		this.sumSq += s * s;
		this.buf[this.offset++] = Math.round(s < 0 ? s * 32768 : s * 32767);
		if (this.offset === this.buf.length) this.flush();
	}
	flush() {
		if (this.offset === 0) return;
		const pcm = this.buf.slice(0, this.offset).buffer;
		const rms = Math.sqrt(this.sumSq / this.offset);
		this.out.postMessage({
			type: "chunk",
			frameOrdinal: this.frameOrdinal++,
			pcm,
			rms
		}, [pcm]);
		this.offset = 0;
		this.sumSq = 0;
	}
};
registerProcessor("pcm-capture", PCMCaptureProcessor);
//#endregion
export {};

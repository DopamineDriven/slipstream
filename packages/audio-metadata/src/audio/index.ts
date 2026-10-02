import { AudioMp3 } from "@/audio/mp3/index.ts";

/**
 * Browser:
 *
 * ```ts
 * import { AudioService } from "@slipstream/audio-metadata";
 *
 * const audioMeta = new AudioService();
 *
 * const u8 = new Uint8Array(
 *   await file.arrayBuffer()
 * );
 *
 * const meta = audioMeta.parseAudio(u8);
 * ```
 *
 * ---
 *
 * Node:
 *
 * ```ts
 * import { AudioService } from "@slipstream/audio-metadata";
 * import { Fs } from "@d0paminedriven/fs";
 *
 * const audioMeta = new AudioService();
 *
 * const fs = new Fs(process.cwd());
 *
 * const u8 = new Uint8Array(
 *   await fs.fileToBufferAsync("track.mp3")
 * );
 *
 * const meta = audioMeta.parseAudio(u8);
 * ```
 */

export class AudioService extends AudioMp3 {
  public parseAudio(u8: Uint8Array) {
    const kind = this.sniffAudio(u8);
    if (kind === "wav") {
      return this.parseWav(u8);
    } else if (kind === "mp3") {
      return this.parseMp3(u8);
    } else {
      throw new Error("unrecognized audio magic");
    }
  }
}

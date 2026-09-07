import { Fs } from "@d0paminedriven/fs";
import type { $Enums } from "@slipstream/db/node/generated/client";

export class ExtractService extends Fs {
  constructor() {
    super(process.cwd());
  }

  private isValidUrl(ss: string) {
    return /(https?|s3|collection)/g.test(ss) && URL.canParse(ss);
  }
  /**
   * MP3 signature + frame walk — the audio twin of the image/doc sniffers.
   * Skips a leading ID3v2 tag (lyria fronts one carrying Google's C2PA
   * manifest in a GEOB frame), then hops frame-to-frame on header
   * arithmetic alone — no decoding — so duration is exact for CBR and VBR
   * alike (probe-validated against lyria output: 4389 contiguous frames,
   * zero resyncs, 114.651s vs the lyrics' final [110.4:] cue).
   * Returns undefined when the buffer contains no parseable MPEG frames.
   * bitrate is reported in bps, matching the TTS persist's de-facto
   * convention for AudioMetadata.bitrate (the column comment says kbps;
   * the stored data has always been bps).
   */
  public mp3Specs(buf: Buffer) {
    let offset = 0;
    let id3TagBytes = 0;
    if (
      buf.length >= 10 &&
      buf[0] === 0x49 &&
      buf[1] === 0x44 &&
      buf[2] === 0x33
    ) {
      const tagSize =
        (((buf[6] ?? 0) & 0x7f) << 21) |
        (((buf[7] ?? 0) & 0x7f) << 14) |
        (((buf[8] ?? 0) & 0x7f) << 7) |
        ((buf[9] ?? 0) & 0x7f);
      const footer = (((buf[5] ?? 0) & 0x10) !== 0 ? 10 : 0) as 10 | 0;
      id3TagBytes = 10 + tagSize + footer;
      offset = id3TagBytes;
    }

    let frames = 0,
      samples = 0,
      sampleRate = 0,
      bytesWalked = 0,
      channels = 2;
    const bitrateVariants = new Set<number>();

    while (offset + 4 <= buf.length) {
      if (buf[offset] !== 0xff || ((buf[offset + 1] ?? 0) & 0xe0) !== 0xe0) {
        offset++;
        continue;
      }
      const b1 = buf[offset + 1] ?? 0,
        b2 = buf[offset + 2] ?? 0,
        b3 = buf[offset + 3] ?? 0;
      // 0=MPEG2.5, 1=reserved, 2=MPEG2, 3=MPEG1
      const verBits = (b1 >> 3) & 0x3;
      // 1=Layer III, 2=Layer II, 3=Layer I
      const layerBits = (b1 >> 1) & 0x3;
      if (verBits === 1 || layerBits === 0) {
        offset++;
        continue;
      }
      const brIdx = (b2 >> 4) & 0xf,
        srIdx = (b2 >> 2) & 0x3,
        pad = (b2 >> 1) & 0x1;
      if (brIdx === 0 || brIdx === 15 || srIdx === 3) {
        offset++;
        continue;
      }
      const srTable =
        verBits === 3
          ? ([44100, 48000, 32000] as const)
          : verBits === 2
            ? ([22050, 24000, 16000] as const)
            : ([11025, 12000, 8000] as const);
      const rate = srTable[srIdx] ?? 0;
      const brTable =
        verBits === 3
          ? layerBits === 1
            ? ([
                0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320
              ] as const)
            : layerBits === 2
              ? ([
                  0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
                  384
                ] as const)
              : ([
                  0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384,
                  416, 448
                ] as const)
          : layerBits === 3
            ? ([
                0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224,
                256
              ] as const)
            : ([
                0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160
              ] as const);
      const kbps = brTable[brIdx] ?? 0;
      if (rate === 0 || kbps === 0) {
        offset++;
        continue;
      }
      const samplesPerFrame =
        layerBits === 3
          ? 384
          : layerBits === 2
            ? 1152
            : verBits === 3
              ? 1152
              : 576;
      const frameLength =
        layerBits === 3
          ? (Math.floor((12 * kbps * 1000) / rate) + pad) * 4
          : Math.floor(((samplesPerFrame / 8) * kbps * 1000) / rate) + pad;
      if (frameLength < 4) {
        offset++;
        continue;
      }
      frames++;
      samples += samplesPerFrame;
      sampleRate = rate;
      bytesWalked += frameLength;
      bitrateVariants.add(kbps);
      channels = ((b3 >> 6) & 0x3) === 3 ? 1 : 2;
      offset += frameLength;
    }

    if (frames === 0 || sampleRate === 0) return undefined;

    const durationMs = Math.round((samples / sampleRate) * 1000);
    const bitrate =
      durationMs > 0 ? Math.round((bytesWalked * 8 * 1000) / durationMs) : 0;

    return {
      mime: "audio/mpeg",
      ext: "mp3",
      codec: "mp3",
      size: buf.byteLength,
      durationMs,
      /** bps — average across walked frames; equals the nominal rate for CBR */
      bitrate,
      cbr: bitrateVariants.size === 1,
      sampleRate,
      channels,
      frames,
      id3TagBytes
    } as const;
  }

  public handleCompatStatus(assetType: $Enums.AssetType, ext: string | null) {
    switch (assetType) {
      case "DOCUMENT": {
        if (ext === "pdf") {
          return "ALIASED" as const satisfies $Enums.CompatStatus;
        } else {
          return "PENDING" as const satisfies $Enums.CompatStatus;
        }
      }
      case "IMAGE": {
        if (
          ext === "jpg" ||
          ext === "jpeg" ||
          ext === "png" ||
          ext === "webp"
        ) {
          return "ALIASED" as const satisfies $Enums.CompatStatus;
        } else return "PENDING" as const satisfies $Enums.CompatStatus;
      }
      case "AUDIO": {
        if (ext === "mp3") {
          return "ALIASED" as const satisfies $Enums.CompatStatus;
        } else return "PENDING" as const satisfies $Enums.CompatStatus;
      }
      case "VIDEO": {
        if (ext === "mp4") {
          return "ALIASED" as const satisfies $Enums.CompatStatus;
        } else return "PENDING" as const satisfies $Enums.CompatStatus;
      }
    }
  }
}

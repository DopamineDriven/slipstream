import type {
  KnownWavFormat,
  WavContainer,
  WavFormat,
  WavMeta,
  WavTags
} from "@/types/index.ts";
import { AudioBase } from "@/audio/base/index.ts";

export class AudioWav extends AudioBase {
  private WAV_FORMAT = {
    0x0001: "pcm",
    0x0003: "ieee-float",
    0x0006: "alaw",
    0x0007: "mulaw",
    0xfffe: "extensible"
  } as const satisfies Readonly<Record<number, KnownWavFormat>>;

  private INFO_MAP = {
    INAM: "title",
    IART: "artist",
    IPRD: "album",
    ICMT: "comment",
    ICRD: "date",
    IGNR: "genre",
    ITRK: "track",
    ISFT: "software",
    ICOP: "copyright",
    IENG: "engineer",
    ISBJ: "subject"
  } as const satisfies Readonly<Record<string, keyof WavTags>>;

  private resolveWavFormat(formatTag: number) {
    if (this.hasOwn(this.WAV_FORMAT, formatTag)) {
      return this.WAV_FORMAT[formatTag] satisfies WavFormat;
    }

    return `tag:${formatTag}` satisfies WavFormat;
  }

  public parseWav(u8: Uint8Array) {
    if (this.sniffAudio(u8) !== "wav") {
      throw new Error("not a WAVE buffer");
    }

    const view = this.dv(u8);

    const container = (
      this.eq(u8, 0, "RF64") ? "RF64" : "RIFF"
    ) satisfies WavContainer;

    const riffSize = view.getUint32(4, true);

    const end = Math.min(u8.length, 8 + riffSize);

    let meta: WavMeta = {
      kind: "wav",
      container,
      formatTag: 0,
      format: "unknown",
      channels: 0,
      sampleRate: 0,
      byteRate: 0,
      blockAlign: 0,
      bitsPerSample: 0,
      dataOffset: null,
      dataSize: null,
      durationSec: null,
      tags: {}
    } satisfies WavMeta;

    let sampleCount: number | null = null;
    let offset = 12;

    while (offset + 8 <= end) {
      const id = this.fourCC(u8, offset);

      if (id === null) {
        break;
      }

      const declaredSize = view.getUint32(offset + 4, true);

      const body = offset + 8;

      const availableSize = Math.max(0, end - body);

      const size = Math.min(declaredSize, availableSize);

      if (id === "fmt " && size >= 16) {
        const formatTag = view.getUint16(body, true);

        meta.formatTag = formatTag;
        meta.format = this.resolveWavFormat(formatTag);

        meta.channels = view.getUint16(body + 2, true);

        meta.sampleRate = view.getUint32(body + 4, true);

        meta.byteRate = view.getUint32(body + 8, true);

        meta.blockAlign = view.getUint16(body + 12, true);

        meta.bitsPerSample = view.getUint16(body + 14, true);
      } else if (id === "data") {
        meta.dataOffset = body;
        meta.dataSize = size;
      } else if (id === "fact" && size >= 4) {
        sampleCount = view.getUint32(body, true);
      } else if (id === "LIST" && size >= 4 && this.eq(u8, body, "INFO")) {
        let listOffset = body + 4;

        const listEnd = body + size;

        while (listOffset + 8 <= listEnd) {
          const key = this.fourCC(u8, listOffset);

          if (key === null) {
            break;
          }

          const declaredInfoSize = view.getUint32(listOffset + 4, true);

          const infoBody = listOffset + 8;

          const infoSize = Math.min(
            declaredInfoSize,
            Math.max(0, listEnd - infoBody)
          );

          if (this.hasOwn(this.INFO_MAP, key)) {
            meta.tags[this.INFO_MAP[key]] = this.latin1(u8, infoBody, infoSize);
          }

          const next = infoBody + declaredInfoSize + (declaredInfoSize & 1);

          if (next <= listOffset || next > listEnd) {
            break;
          }

          listOffset = next;
        }
      }

      const next = body + declaredSize + (declaredSize & 1);

      if (next <= offset || next > end) {
        break;
      }

      offset = next;
    }

    if (sampleCount !== null && meta.sampleRate > 0) {
      meta.durationSec = sampleCount / meta.sampleRate;
    } else if (meta.dataSize !== null && meta.byteRate > 0) {
      meta.durationSec = meta.dataSize / meta.byteRate;
    }

    return meta;
  }
}

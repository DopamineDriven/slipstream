import type {
  BitrateTable,
  Mp3Meta,
  Mp3Tags,
  MpegChannelMode,
  MpegFrame,
  MpegLayer,
  MpegSamplesPerFrame,
  MpegVersion,
  ParsedId3v2,
  SampleRateTable,
  XingHeader
} from "@/types/index.ts";
import { AudioWav } from "@/audio/wav/index.ts";

export class AudioMp3 extends AudioWav {
  private MPEG_VERSION_BY_BITS = {
    0: "2.5",
    2: "2",
    3: "1"
  } as const satisfies Readonly<Record<0 | 2 | 3, MpegVersion>>;

  private MPEG_LAYER_BY_BITS = {
    1: "III",
    2: "II",
    3: "I"
  } as const satisfies Readonly<Record<1 | 2 | 3, MpegLayer>>;

  private CHANNEL_MODE_BY_BITS = {
    0: "stereo",
    1: "joint-stereo",
    2: "dual-channel",
    3: "mono"
  } as const satisfies Readonly<Record<0 | 1 | 2 | 3, MpegChannelMode>>;

  private MPEG_1_BITRATE_KBPS = {
    I: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],

    II: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],

    III: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
  } as const satisfies Readonly<Record<MpegLayer, BitrateTable>>;

  private MPEG_2_BITRATE_KBPS = {
    I: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],

    II: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],

    III: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
  } as const satisfies Readonly<Record<MpegLayer, BitrateTable>>;

  private BITRATE_KBPS = {
    "1": this.MPEG_1_BITRATE_KBPS,
    "2": this.MPEG_2_BITRATE_KBPS,
    "2.5": this.MPEG_2_BITRATE_KBPS
  } as const satisfies Readonly<
    Record<MpegVersion, Readonly<Record<MpegLayer, BitrateTable>>>
  >;

  private SAMPLE_RATE = {
    "1": [44100, 48000, 32000],

    "2": [22050, 24000, 16000],

    "2.5": [11025, 12000, 8000]
  } as const satisfies Readonly<Record<MpegVersion, SampleRateTable>>;

  private ID3_TEXT_FRAME_TO_TAG = {
    TIT2: "title",
    TT2: "title",

    TPE1: "artist",
    TP1: "artist",

    TALB: "album",
    TAL: "album",

    TRCK: "track",
    TRK: "track",

    TYER: "year",
    TYE: "year",
    TDRC: "year",

    TCON: "genre",
    TCO: "genre"
  } as const satisfies Readonly<Record<string, keyof Mp3Tags>>;

  /**
   *  n >= 1, n <= 14
   */
  private isBitrateIndex(n: number) {
    return (
      n === 1 ||
      n === 2 ||
      n === 3 ||
      n === 4 ||
      n === 5 ||
      n === 6 ||
      n === 7 ||
      n === 8 ||
      n === 9 ||
      n === 10 ||
      n === 11 ||
      n === 12 ||
      n === 13 ||
      n === 14
    );
  }
  /**
   *  n >= 0, n <= 2
   */
  private isSampleRateIndex(n: number) {
    return n === 0 || n === 1 || n === 2;
  }

  /**
   *  n >= 2, n <= 4
   */
  private isId3MajorVersion(n: number) {
    return n === 2 || n === 3 || n === 4;
  }

  private synchsafe(u8: Uint8Array, offset: number) {
    return (
      ((this.readByte(u8, offset) & 0x7f) << 21) |
      ((this.readByte(u8, offset + 1) & 0x7f) << 14) |
      ((this.readByte(u8, offset + 2) & 0x7f) << 7) |
      (this.readByte(u8, offset + 3) & 0x7f)
    );
  }

  private be24(u8: Uint8Array, offset: number) {
    return (
      (this.readByte(u8, offset) << 16) |
      (this.readByte(u8, offset + 1) << 8) |
      this.readByte(u8, offset + 2)
    );
  }

  private decodeId3Text(u8: Uint8Array, offset: number, length: number) {
    if (length <= 0 || offset >= u8.length) {
      return "";
    }

    const encoding = this.readByte(u8, offset);

    const slice = u8.subarray(offset + 1, Math.min(offset + length, u8.length));

    try {
      if (encoding === 0) {
        return new TextDecoder("latin1")
          .decode(slice)
          .replace(/\0+$/, "")
          .trim();
      }
      if (encoding === 1) {
        return new TextDecoder("utf-16")
          .decode(slice)
          .replace(/\0+$/, "")
          .trim();
      }
      if (encoding === 2) {
        return new TextDecoder("utf-16be")
          .decode(slice)
          .replace(/\0+$/, "")
          .trim();
      }
      if (encoding === 3) {
        return new TextDecoder("utf-8")
          .decode(slice)
          .replace(/\0+$/, "")
          .trim();
      }
    } catch {
      // Fall through to byte-preserving Latin-1.
    }

    return this.latin1(slice, 0, slice.length);
  }

  private parseId3v2(u8: Uint8Array) {
    if (!this.eq(u8, 0, "ID3") || u8.length < 10) {
      return null;
    }

    const major = this.readByte(u8, 3);

    const revision = this.readByte(u8, 4);

    const flags = this.readByte(u8, 5);

    if (!this.isId3MajorVersion(major)) {
      return null;
    }

    const payload = this.synchsafe(u8, 6);
    const tagEnd = Math.min(u8.length, 10 + payload);
    let tags: Mp3Tags = {};
    let offset = 10;

    /**
     * Extended header:
     * v2.2 does not use the same extended-header layout.
     */
    if ((flags & 0x40) !== 0 && major !== 2) {
      if (offset + 4 > tagEnd) {
        return null;
      }
      const extSize =
        major === 3
          ? this.dv(u8).getUint32(offset, false)
          : this.synchsafe(u8, offset);
      if (extSize < 6) {
        return null;
      }
      const nextOffset = major === 3 ? offset + 4 + extSize : offset + extSize;

      if (nextOffset > tagEnd) {
        return null;
      }
      offset = nextOffset;
    }
    while (offset + 6 <= tagEnd) {
      // ID3 padding.
      if (this.readByte(u8, offset) === 0) {
        break;
      }
      let id: string | null;
      let size: number;
      let headerSize: 6 | 10;
      if (major === 2) {
        if (offset + 6 > tagEnd) {
          break;
        }
        id = String.fromCharCode(
          this.readByte(u8, offset),
          this.readByte(u8, offset + 1),
          this.readByte(u8, offset + 2)
        );
        size = this.be24(u8, offset + 3);
        headerSize = 6;
      } else {
        if (offset + 10 > tagEnd) {
          break;
        }
        id = this.fourCC(u8, offset);
        if (id === null) {
          break;
        }
        size =
          major === 4
            ? this.synchsafe(u8, offset + 4)
            : this.dv(u8).getUint32(offset + 4, false);
        headerSize = 10;
      }
      const body = offset + headerSize;
      if (body + size > tagEnd) {
        break;
      }
      if (this.hasOwn(this.ID3_TEXT_FRAME_TO_TAG, id)) {
        const field = this.ID3_TEXT_FRAME_TO_TAG[id];
        tags[field] = this.decodeId3Text(u8, body, size);
      } else if (id === "COMM" || id === "COM") {
        const raw = this.decodeId3Text(u8, body, size);
        tags.comment ??= raw.replace(/^[a-z]{3}/i, "").trim();
      }
      offset = body + size;
    }
    const footer = major === 4 && (flags & 0x10) !== 0 ? 10 : 0;
    return {
      size: 10 + payload + footer,
      version: `2.${major}.${revision}`,
      tags
    } satisfies ParsedId3v2;
  }

  private parseId3v1(u8: Uint8Array) {
    if (u8.length < 128 || !this.eq(u8, u8.length - 128, "TAG")) {
      return null;
    }

    const offset = u8.length - 128;

    const cut = (relativeOffset: number, length: number) =>
      this.latin1(u8, offset + relativeOffset, length);
    let tags: Mp3Tags = {};
    const title = cut(3, 30);
    const artist = cut(33, 30);
    const album = cut(63, 30);
    const year = cut(93, 4);
    const comment = cut(97, 28);

    if (title) {
      tags.title = title;
    }
    if (artist) {
      tags.artist = artist;
    }
    if (album) {
      tags.album = album;
    }
    if (year) {
      tags.year = year;
    }
    if (comment) {
      tags.comment = comment;
    }
    const trackMarker = this.readByte(u8, offset + 125);
    const trackNumber = this.readByte(u8, offset + 126);
    if (trackMarker === 0 && trackNumber !== 0) {
      tags.track = String(trackNumber);
    }
    return tags satisfies Mp3Tags;
  }

  private parseMpegFrame(u8: Uint8Array, offset: number) {
    if (offset < 0 || offset + 4 > u8.length) {
      return null;
    }

    const b0 = this.readByte(u8, offset);

    const b1 = this.readByte(u8, offset + 1);

    const b2 = this.readByte(u8, offset + 2);

    const b3 = this.readByte(u8, offset + 3);

    if (!this.isMpegFrameSync(b0, b1)) {
      return null;
    }

    const versionBits = (b1 >> 3) & 0x03;

    const layerBits = (b1 >> 1) & 0x03;

    const bitrateIndex = (b2 >> 4) & 0x0f;

    const sampleRateIndex = (b2 >> 2) & 0x03;

    const padding = ((b2 >> 1) & 1) === 1;

    const modeBits = (b3 >> 6) & 0x03;

    /**
     * Protection bit:
     *
     * 0 = CRC follows header
     * 1 = no CRC
     */
    const hasCrc = (b1 & 0x01) === 0;

    if (
      !this.hasOwn(this.MPEG_VERSION_BY_BITS, versionBits) ||
      !this.hasOwn(this.MPEG_LAYER_BY_BITS, layerBits) ||
      !this.hasOwn(this.CHANNEL_MODE_BY_BITS, modeBits) ||
      !this.isBitrateIndex(bitrateIndex) ||
      !this.isSampleRateIndex(sampleRateIndex)
    ) {
      return null;
    }

    const version = this.MPEG_VERSION_BY_BITS[versionBits];

    const layer = this.MPEG_LAYER_BY_BITS[layerBits];

    const channelMode = this.CHANNEL_MODE_BY_BITS[modeBits];

    const bitrateKbps = this.BITRATE_KBPS[version][layer][bitrateIndex];

    const sampleRate = this.SAMPLE_RATE[version][sampleRateIndex];

    const bitrate = bitrateKbps * 1000;

    const samplesPerFrame = (
      layer === "I" ? 384 : layer === "II" ? 1152 : version === "1" ? 1152 : 576
    ) satisfies MpegSamplesPerFrame;

    let frameSize: number;

    // Layer I:
    // ((12 * bitrate / sampleRate) + padding) * 4
    if (layer === "I") {
      frameSize = Math.floor((12 * bitrate) / sampleRate + Number(padding)) * 4;
    }

    // MPEG-2 / MPEG-2.5 Layer III:
    // (72 * bitrate / sampleRate) + padding
    else if (layer === "III" && version !== "1") {
      frameSize = Math.floor((72 * bitrate) / sampleRate) + Number(padding);
    }

    // MPEG-1 Layer II/III and MPEG-2 Layer II:
    // (144 * bitrate / sampleRate) + padding
    else {
      frameSize = Math.floor((144 * bitrate) / sampleRate) + Number(padding);
    }

    return {
      offset,
      version,
      layer,
      bitrateKbps,
      sampleRate,
      channels: channelMode === "mono" ? 1 : 2,
      channelMode,
      padding,
      hasCrc,
      samplesPerFrame,
      frameSize
    } satisfies MpegFrame;
  }

  /**
   * Xing / Info lives after:
   *
   *   MPEG header
   *   + optional CRC
   *   + Layer III side-info
   */
  private parseXing(u8: Uint8Array, frame: MpegFrame) {
    if (frame.layer !== "III") {
      return null;
    }

    const sideInfoSize =
      frame.version === "1"
        ? frame.channels === 1
          ? 17
          : 32
        : frame.channels === 1
          ? 9
          : 17;

    const offset = frame.offset + 4 + (frame.hasCrc ? 2 : 0) + sideInfoSize;

    if (offset + 8 > u8.length) {
      return null;
    }

    const kind = this.eq(u8, offset, "Xing")
      ? "Xing"
      : this.eq(u8, offset, "Info")
        ? "Info"
        : null;

    if (kind === null) {
      return null;
    }

    const view = this.dv(u8);

    const flags = view.getUint32(offset + 4, false);

    let cursor = offset + 8;

    let frames: number | null = null;

    let bytes: number | null = null;

    if ((flags & 0x01) !== 0) {
      if (cursor + 4 > u8.length) {
        return null;
      }

      frames = view.getUint32(cursor, false);

      cursor += 4;
    }

    if ((flags & 0x02) !== 0) {
      if (cursor + 4 > u8.length) {
        return null;
      }

      bytes = view.getUint32(cursor, false);
    }

    return {
      kind,
      frames,
      bytes
    } satisfies XingHeader;
  }

  private findMpegFrame(
    u8: Uint8Array,
    start: number,
    limit = start + 64 * 1024
  ) {
    const last = Math.min(u8.length - 4, limit);

    for (let offset = Math.max(0, start); offset <= last; offset++) {
      if (this.readByte(u8, offset) !== 0xff) {
        continue;
      }

      const frame = this.parseMpegFrame(u8, offset);

      if (frame === null) {
        continue;
      }

      const nextOffset = offset + frame.frameSize;

      /**
       * If this valid frame runs to EOF, accept it.
       *
       * Otherwise validate the next complete MPEG header too.
       * This cheaply rejects false sync words in arbitrary bytes.
       */
      if (nextOffset + 4 > u8.length) {
        return frame satisfies MpegFrame;
      }

      if (this.parseMpegFrame(u8, nextOffset) !== null) {
        return frame satisfies MpegFrame;
      }
    }

    return null;
  }

  public parseMp3(u8: Uint8Array) {
    if (this.sniffAudio(u8) !== "mp3") {
      throw new Error("not an MP3 buffer");
    }

    const id3 = this.parseId3v2(u8);

    const id3v1 = this.parseId3v1(u8);

    /**
     * ID3v2 wins over ID3v1 when both provide the same field.
     */
    const tags: Mp3Tags = {
      ...(id3v1 ?? {}),
      ...(id3?.tags ?? {})
    };

    const audioOffset = id3?.size ?? 0;

    const frame = this.findMpegFrame(u8, audioOffset);

    let durationSec: number | null = null;

    let vbr = false;

    if (frame !== null) {
      const xing = this.parseXing(u8, frame);

      if (xing?.frames !== null && xing?.frames !== undefined) {
        /**
         * "Xing" conventionally indicates VBR.
         * "Info" uses the same structure but conventionally indicates CBR.
         */
        vbr = xing.kind === "Xing";

        durationSec = (xing.frames * frame.samplesPerFrame) / frame.sampleRate;
      } else if (frame.bitrateKbps > 0) {
        const id3v1Size = id3v1 === null ? 0 : 128;

        const audioBytes = Math.max(0, u8.length - audioOffset - id3v1Size);

        durationSec = (audioBytes * 8) / (frame.bitrateKbps * 1000);
      }
    }
    const mp3MetaCore = {
      kind: "mp3",
      tags,
      frame,
      vbr,
      durationSec,
      audioOffset
    } satisfies Mp3Meta;

    let meta: Mp3Meta;

    /**
     * Assign rather than:
     *
     *   id3v2: id3 ? {...} : undefined
     *
     * so this remains happy under exactOptionalPropertyTypes.
     */
    if (id3 !== null) {
      meta = {
        ...mp3MetaCore,
        id3v2: {
          version: id3.version,
          size: id3.size
        }
      };
    } else {
      meta = { ...mp3MetaCore };
    }
    return meta;
  }
}

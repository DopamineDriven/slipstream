import { resolve } from "node:path";
import { Fs } from "@d0paminedriven/fs";
import type { UTR } from "@slipstream/types";

function dv(u8: Uint8Array) {
  return new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
}

function readByte(u8: Uint8Array, offset: number) {
  const value = u8[offset];

  if (value === undefined) {
    throw new RangeError(
      `byte offset ${offset} is outside a ${u8.length}-byte buffer`
    );
  }

  return value;
}

function fourCC(u8: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > u8.length) return null;

  return String.fromCharCode(
    readByte(u8, offset),
    readByte(u8, offset + 1),
    readByte(u8, offset + 2),
    readByte(u8, offset + 3)
  );
}

function eq(u8: Uint8Array, offset: number, value: string) {
  if (offset < 0 || offset + value.length > u8.length) {
    return false;
  }

  for (let i = 0; i < value.length; i++) {
    if (readByte(u8, offset + i) !== value.charCodeAt(i)) {
      return false;
    }
  }

  return true;
}

function hasOwn<T extends object, K extends PropertyKey>(
  object: T,
  key: K
): key is K & keyof T {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export type AudioKind = "wav" | "mp3";

/**
 * True MPEG audio sync.
 *
 * MPEG audio uses an 11-bit sync word. AAC ADTS has a 12-bit sync,
 * so the MPEG version/layer checks keep obvious ADTS headers out.
 */
function isMpegFrameSync(b0: number, b1: number) {
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) {
    return false;
  }

  // MPEG version 01 = reserved.
  if ((b1 & 0x18) === 0x08) {
    return false;
  }

  // MPEG layer 00 = reserved.
  if ((b1 & 0x06) === 0x00) {
    return false;
  }

  return true;
}

function id3v2Size(u8: Uint8Array, offset = 0) {
  if (!eq(u8, offset, "ID3") || offset + 10 > u8.length) {
    return null;
  }

  const synch =
    ((readByte(u8, offset + 6) & 0x7f) << 21) |
    ((readByte(u8, offset + 7) & 0x7f) << 14) |
    ((readByte(u8, offset + 8) & 0x7f) << 7) |
    (readByte(u8, offset + 9) & 0x7f);

  const footer = (readByte(u8, offset + 5) & 0x10) !== 0 ? 10 : 0;

  return 10 + synch + footer;
}

export function sniffAudio(u8: Uint8Array) {
  if (u8.length < 2) {
    return null;
  }

  // RIFF / RF64 WAVE needs the full 12-byte signature.
  if (
    u8.length >= 12 &&
    (eq(u8, 0, "RIFF") || eq(u8, 0, "RF64")) &&
    eq(u8, 8, "WAVE")
  ) {
    return "wav";
  }

  /**
   * ID3v2 prefix.
   *
   * A short probe may contain only the ID3 tag, so ID3 itself is
   * sufficient to classify the input as MP3 for this parser.
   */
  if (id3v2Size(u8, 0) !== null) {
    return "mp3";
  }

  if (isMpegFrameSync(readByte(u8, 0), readByte(u8, 1))) {
    return "mp3";
  }

  // ID3v1-only files are rare but valid.
  if (u8.length >= 128 && eq(u8, u8.length - 128, "TAG")) {
    return "mp3";
  }

  return null;
}

export type WavTags = {
  title?: string;
  artist?: string;
  album?: string;
  comment?: string;
  date?: string;
  genre?: string;
  track?: string;
  software?: string;
  copyright?: string;
  engineer?: string;
  subject?: string;
};

export type KnownWavFormat =
  "pcm" | "ieee-float" | "alaw" | "mulaw" | "extensible";

export type WavFormat = KnownWavFormat | `tag:${number}` | "unknown";

export type WavContainer = "RIFF" | "RF64";

const WAV_FORMAT = {
  0x0001: "pcm",
  0x0003: "ieee-float",
  0x0006: "alaw",
  0x0007: "mulaw",
  0xfffe: "extensible"
} as const satisfies Readonly<Record<number, KnownWavFormat>>;

const INFO_MAP = {
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

function resolveWavFormat(formatTag: number) {
  if (hasOwn(WAV_FORMAT, formatTag)) {
    return WAV_FORMAT[formatTag] satisfies WavFormat;
  }

  return `tag:${formatTag}` satisfies WavFormat;
}

export type WavMeta = {
  kind: "wav";
  container: WavContainer;
  formatTag: number;
  format: WavFormat;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  dataOffset: number | null;
  dataSize: number | null;
  durationSec: number | null;
  tags: WavTags;
};

function latin1(u8: Uint8Array, offset: number, length: number) {
  let value = "";

  const end = Math.min(offset + length, u8.length);

  for (let i = offset; i < end; i++) {
    const code = readByte(u8, i);

    if (code === 0) {
      break;
    }

    value += String.fromCharCode(code);
  }

  return value.trim();
}

export function parseWav(u8: Uint8Array) {
  if (sniffAudio(u8) !== "wav") {
    throw new Error("not a WAVE buffer");
  }

  const view = dv(u8);

  const container = (
    eq(u8, 0, "RF64") ? "RF64" : "RIFF"
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
    const id = fourCC(u8, offset);

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
      meta.format = resolveWavFormat(formatTag);

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
    } else if (id === "LIST" && size >= 4 && eq(u8, body, "INFO")) {
      let listOffset = body + 4;

      const listEnd = body + size;

      while (listOffset + 8 <= listEnd) {
        const key = fourCC(u8, listOffset);

        if (key === null) {
          break;
        }

        const declaredInfoSize = view.getUint32(listOffset + 4, true);

        const infoBody = listOffset + 8;

        const infoSize = Math.min(
          declaredInfoSize,
          Math.max(0, listEnd - infoBody)
        );

        if (hasOwn(INFO_MAP, key)) {
          meta.tags[INFO_MAP[key]] = latin1(u8, infoBody, infoSize);
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

export type Mp3Tags = {
  title?: string;
  artist?: string;
  album?: string;
  track?: string;
  year?: string;
  genre?: string;
  comment?: string;
};

export type MpegVersion = "1" | "2" | "2.5";

export type MpegLayer = "I" | "II" | "III";

export type MpegChannelMode =
  "stereo" | "joint-stereo" | "dual-channel" | "mono";

export type MpegSamplesPerFrame = 384 | 576 | 1152;

export type MpegFrame = {
  offset: number;
  version: MpegVersion;
  layer: MpegLayer;
  bitrateKbps: number;
  sampleRate: number;
  channels: 1 | 2;
  channelMode: MpegChannelMode;
  padding: boolean;
  hasCrc: boolean;
  samplesPerFrame: MpegSamplesPerFrame;
  frameSize: number;
};

type BitrateIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

type SampleRateIndex = 0 | 1 | 2;

type Id3MajorVersion = 2 | 3 | 4;

export type Id3v2Version = `2.${Id3MajorVersion}.${number}`;

type BitrateTable = readonly [
  0,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

type SampleRateTable = readonly [number, number, number];

const MPEG_VERSION_BY_BITS = {
  0: "2.5",
  2: "2",
  3: "1"
} as const satisfies Readonly<Record<0 | 2 | 3, MpegVersion>>;

const MPEG_LAYER_BY_BITS = {
  1: "III",
  2: "II",
  3: "I"
} as const satisfies Readonly<Record<1 | 2 | 3, MpegLayer>>;

const CHANNEL_MODE_BY_BITS = {
  0: "stereo",
  1: "joint-stereo",
  2: "dual-channel",
  3: "mono"
} as const satisfies Readonly<Record<0 | 1 | 2 | 3, MpegChannelMode>>;

const MPEG_1_BITRATE_KBPS = {
  I: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],

  II: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],

  III: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
} as const satisfies Readonly<Record<MpegLayer, BitrateTable>>;

const MPEG_2_BITRATE_KBPS = {
  I: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],

  II: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],

  III: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
} as const satisfies Readonly<Record<MpegLayer, BitrateTable>>;

const BITRATE_KBPS = {
  "1": MPEG_1_BITRATE_KBPS,
  "2": MPEG_2_BITRATE_KBPS,
  "2.5": MPEG_2_BITRATE_KBPS
} as const satisfies Readonly<
  Record<MpegVersion, Readonly<Record<MpegLayer, BitrateTable>>>
>;

const SAMPLE_RATE = {
  "1": [44100, 48000, 32000],

  "2": [22050, 24000, 16000],

  "2.5": [11025, 12000, 8000]
} as const satisfies Readonly<Record<MpegVersion, SampleRateTable>>;

const ID3_TEXT_FRAME_TO_TAG = {
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

function isBitrateIndex(value: number): value is BitrateIndex {
  return value >= 1 && value <= 14;
}

function isSampleRateIndex(value: number): value is SampleRateIndex {
  return value >= 0 && value <= 2;
}

function isId3MajorVersion(value: number): value is Id3MajorVersion {
  return value === 2 || value === 3 || value === 4;
}

function synchsafe(u8: Uint8Array, offset: number) {
  return (
    ((readByte(u8, offset) & 0x7f) << 21) |
    ((readByte(u8, offset + 1) & 0x7f) << 14) |
    ((readByte(u8, offset + 2) & 0x7f) << 7) |
    (readByte(u8, offset + 3) & 0x7f)
  );
}

function be24(u8: Uint8Array, offset: number) {
  return (
    (readByte(u8, offset) << 16) |
    (readByte(u8, offset + 1) << 8) |
    readByte(u8, offset + 2)
  );
}

function decodeId3Text(u8: Uint8Array, offset: number, length: number) {
  if (length <= 0 || offset >= u8.length) {
    return "";
  }

  const encoding = readByte(u8, offset);

  const slice = u8.subarray(offset + 1, Math.min(offset + length, u8.length));

  try {
    if (encoding === 0) {
      return new TextDecoder("latin1").decode(slice).replace(/\0+$/, "").trim();
    }

    if (encoding === 1) {
      return new TextDecoder("utf-16").decode(slice).replace(/\0+$/, "").trim();
    }

    if (encoding === 2) {
      return new TextDecoder("utf-16be")
        .decode(slice)
        .replace(/\0+$/, "")
        .trim();
    }

    if (encoding === 3) {
      return new TextDecoder("utf-8").decode(slice).replace(/\0+$/, "").trim();
    }
  } catch {
    // Fall through to byte-preserving Latin-1.
  }

  return latin1(slice, 0, slice.length);
}

type ParsedId3v2 = {
  size: number;
  version: Id3v2Version;
  tags: Mp3Tags;
};

function parseId3v2(u8: Uint8Array) {
  if (!eq(u8, 0, "ID3") || u8.length < 10) {
    return null;
  }

  const major = readByte(u8, 3);

  const revision = readByte(u8, 4);

  const flags = readByte(u8, 5);

  if (!isId3MajorVersion(major)) {
    return null;
  }

  const payload = synchsafe(u8, 6);
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
    if (major === 3) {
      offset += dv(u8).getUint32(offset, false);
    } else {
      offset += synchsafe(u8, offset) + 4;
    }
    if (offset > tagEnd) {
      return null;
    }
  }
  while (offset + 6 <= tagEnd) {
    // ID3 padding.
    if (readByte(u8, offset) === 0) {
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
        readByte(u8, offset),
        readByte(u8, offset + 1),
        readByte(u8, offset + 2)
      );
      size = be24(u8, offset + 3);
      headerSize = 6;
    } else {
      if (offset + 10 > tagEnd) {
        break;
      }
      id = fourCC(u8, offset);
      if (id === null) {
        break;
      }
      size =
        major === 4
          ? synchsafe(u8, offset + 4)
          : dv(u8).getUint32(offset + 4, false);
      headerSize = 10;
    }
    const body = offset + headerSize;
    if (body + size > tagEnd) {
      break;
    }
    if (hasOwn(ID3_TEXT_FRAME_TO_TAG, id)) {
      const field = ID3_TEXT_FRAME_TO_TAG[id];
      tags[field] = decodeId3Text(u8, body, size);
    } else if (id === "COMM" || id === "COM") {
      const raw = decodeId3Text(u8, body, size);
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

function parseId3v1(u8: Uint8Array) {
  if (u8.length < 128 || !eq(u8, u8.length - 128, "TAG")) {
    return null;
  }

  const offset = u8.length - 128;

  const cut = (relativeOffset: number, length: number) =>
    latin1(u8, offset + relativeOffset, length);
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
  const trackMarker = readByte(u8, offset + 125);
  const trackNumber = readByte(u8, offset + 126);
  if (trackMarker === 0 && trackNumber !== 0) {
    tags.track = String(trackNumber);
  }
  return tags satisfies Mp3Tags;
}

function parseMpegFrame(u8: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > u8.length) {
    return null;
  }

  const b0 = readByte(u8, offset);

  const b1 = readByte(u8, offset + 1);

  const b2 = readByte(u8, offset + 2);

  const b3 = readByte(u8, offset + 3);

  if (!isMpegFrameSync(b0, b1)) {
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
    !hasOwn(MPEG_VERSION_BY_BITS, versionBits) ||
    !hasOwn(MPEG_LAYER_BY_BITS, layerBits) ||
    !hasOwn(CHANNEL_MODE_BY_BITS, modeBits) ||
    !isBitrateIndex(bitrateIndex) ||
    !isSampleRateIndex(sampleRateIndex)
  ) {
    return null;
  }

  const version = MPEG_VERSION_BY_BITS[versionBits];

  const layer = MPEG_LAYER_BY_BITS[layerBits];

  const channelMode = CHANNEL_MODE_BY_BITS[modeBits];

  const bitrateKbps = BITRATE_KBPS[version][layer][bitrateIndex];

  const sampleRate = SAMPLE_RATE[version][sampleRateIndex];

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

type XingHeader = {
  kind: "Xing" | "Info";
  frames: number | null;
  bytes: number | null;
};

/**
 * Xing / Info lives after:
 *
 *   MPEG header
 *   + optional CRC
 *   + Layer III side-info
 */
function parseXing(u8: Uint8Array, frame: MpegFrame) {
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

  const kind = eq(u8, offset, "Xing")
    ? "Xing"
    : eq(u8, offset, "Info")
      ? "Info"
      : null;

  if (kind === null) {
    return null;
  }

  const view = dv(u8);

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

function findMpegFrame(
  u8: Uint8Array,
  start: number,
  limit = start + 64 * 1024
) {
  const last = Math.min(u8.length - 4, limit);

  for (let offset = Math.max(0, start); offset <= last; offset++) {
    if (readByte(u8, offset) !== 0xff) {
      continue;
    }

    const frame = parseMpegFrame(u8, offset);

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

    if (parseMpegFrame(u8, nextOffset) !== null) {
      return frame satisfies MpegFrame;
    }
  }

  return null;
}

export type Mp3Meta = {
  kind: "mp3";

  id3v2?: {
    version: Id3v2Version;
    size: number;
  };

  tags: Mp3Tags;
  frame: MpegFrame | null;
  vbr: boolean;
  durationSec: number | null;
  audioOffset: number;
};

export function parseMp3(u8: Uint8Array) {
  if (sniffAudio(u8) !== "mp3") {
    throw new Error("not an MP3 buffer");
  }

  const id3 = parseId3v2(u8);

  const id3v1 = parseId3v1(u8);

  /**
   * ID3v2 wins over ID3v1 when both provide the same field.
   */
  const tags: Mp3Tags = {
    ...(id3v1 ?? {}),
    ...(id3?.tags ?? {})
  };

  const audioOffset = id3?.size ?? 0;

  const frame = findMpegFrame(u8, audioOffset);

  let durationSec: number | null = null;

  let vbr = false;

  if (frame !== null) {
    const xing = parseXing(u8, frame);

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

export type AudioMeta = WavMeta | Mp3Meta;

export type AudioMetaRecord = UTR<AudioMeta, "kind">;

export function parseAudio(u8: Uint8Array) {
  const kind = sniffAudio(u8);

  if (kind === "wav") {
    return parseWav(u8);
  }

  if (kind === "mp3") {
    return parseMp3(u8);
  }

  throw new Error("unrecognized audio magic");
}

const fs = new Fs(process.cwd());
async function audioMeta(path: string) {
  return parseAudio(new Uint8Array(await fs.fileToBufferAsync(resolve(path))));
}
const absPath =
  "/home/dopaminedriven/cloneathon/t3-chat-clone/apps/ws-server/src/test/google/interactions/lyria/lyria-3-pop-punk.mp3";

audioMeta(absPath).then(t => {
  fs.withWs(
    "src/utils/__out__/audio/lyria-3-pop-punkssss.mp3.json",
    JSON.stringify(t, null, 2)
  );
});
/**
 * Browser:
 *
 * const u8 = new Uint8Array(
 *   await file.arrayBuffer()
 * );
 *
 * const meta = parseAudio(u8);
 *
 *
 * Node:
 *
 * import { readFile } from "node:fs/promises";
 *
 * const u8 = new Uint8Array(
 *   await readFile("track.mp3")
 * );
 *
 * const meta = parseAudio(u8);
 */


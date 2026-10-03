export type Rm<T, P extends keyof T = keyof T> = {
  [S in keyof T as Exclude<S, P>]: T[S];
};

export type UTR<
  TUnion extends Record<TKey, string>,
  TKey extends string = "kind",
  TExclude extends `strip-${TKey}` | boolean = false
> = {
  [K in TUnion[TKey]]: TExclude extends false
    ? Extract<TUnion, Record<TKey, K>>
    : Rm<Extract<TUnion, Record<TKey, K>>, TKey>;
};

export type XingHeader = {
  kind: "Xing" | "Info";
  frames: number | null;
  bytes: number | null;
};

export type BitrateIndex =
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export type SampleRateIndex = 0 | 1 | 2;

export type Id3MajorVersion = 2 | 3 | 4;

export type Id3v2Version = `2.${Id3MajorVersion}.${number}`;

export type BitrateTable = readonly [
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

export type SampleRateTable = readonly [number, number, number];

export type ParsedId3v2 = {
  size: number;
  version: Id3v2Version;
  tags: Mp3Tags;
};

export interface BaseTags {
  title?: string;
  artist?: string;
  album?: string;
  track?: string;
  genre?: string;
  comment?: string;
}

/**
 * MP3 types
 */

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

export interface Mp3Tags extends BaseTags {
  year?: string;
}

export type Id3v2Entity = {
  version: Id3v2Version;
  size: number;
};

export type Mp3Meta = {
  kind: "mp3";
  id3v2?: Id3v2Entity;
  tags: Mp3Tags;
  frame: MpegFrame | null;
  vbr: boolean;
  durationSec: number | null;
  audioOffset: number;
};

/**
 * WAV types
 */

export interface WavTags extends BaseTags {
  date?: string;
  software?: string;
  copyright?: string;
  engineer?: string;
  subject?: string;
}

export type KnownWavFormat =
  "pcm" | "ieee-float" | "alaw" | "mulaw" | "extensible";

export type WavFormat = KnownWavFormat | `tag:${number}` | "unknown";

export type WavContainer = "RIFF" | "RF64";

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

/**
 * Audio types
 */

export type AudioMetaUnion = Mp3Meta | WavMeta;

export type AudioMetaRecord = UTR<AudioMetaUnion, "kind">;

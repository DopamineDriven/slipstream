export { AudioService } from "@/audio/index.ts";
export { AudioMp3 } from "@/audio/mp3/index.ts";
export { AudioWav } from "@/audio/wav/index.ts";
export { AudioBase } from "@/audio/base/index.ts";
export type {
  AudioMetaRecord,
  AudioMetaUnion,
  BaseTags,
  BitrateIndex,
  BitrateTable,
  Id3MajorVersion,
  Id3v2Entity,
  Id3v2Version,
  KnownWavFormat,
  Mp3Meta,
  Mp3Tags,
  MpegChannelMode,
  MpegFrame,
  MpegLayer,
  MpegSamplesPerFrame,
  MpegVersion,
  ParsedId3v2,
  Rm,
  SampleRateIndex,
  SampleRateTable,
  UTR,
  WavContainer,
  WavFormat,
  WavMeta,
  WavTags,
  XingHeader
} from "@/types/index.ts";

declare global {
  interface JSON {
    parse<T = unknown>(
      text: string,
      reviver?: (this: any, key: string, value: any) => any
    ): T;
  }
  interface Body {
    json<T = unknown>(): Promise<T>;
  }
  interface ObjectConstructor {
    keys<T = object>(
      o: T
    ): (keyof T extends infer K
      ? K extends string
        ? K
        : K extends number
          ? `${K}`
          : never
      : never)[];
  }
}

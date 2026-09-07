import type { AudioGenOutputSingleton, AudioSingleton } from "@/types.ts";
import type { Rm } from "@/utils.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";

export type OpenAICodecTTS = "wav" | "mp3" | "pcm" | "aac" | "opus" | "flac";

export type GeminiCodecTTS = "wav" | "mp3";

/**
 * Grok Types
 */

export type GrokAudioCodecTTS = "wav" | "mp3" | "pcm" | "mulaw" | "alaw";

export type TTSCodec = GrokAudioCodecTTS | OpenAICodecTTS | GeminiCodecTTS;

export type GrokVoiceTTS = "eve" | "ara" | "rex" | "sal" | "leo" | "una";

export type GrokVoiceDisplayNameTTS =
  "Eve" | "Ara" | "Sal" | "Rex" | "Leo" | "Una";

export const grokVoiceIdsTTS = [
  "eve",
  "ara",
  "rex",
  "sal",
  "leo",
  "una"
] as const;

export const grokVoiceDisplayNamesTTS = [
  "Eve",
  "Ara",
  "Rex",
  "Sal",
  "Leo",
  "Una"
] as const;

export const grokVoices = {
  voices: [
    { voice_id: "ara", name: "Ara", language: "multilingual" },
    { voice_id: "eve", name: "Eve", language: "multilingual" },
    { voice_id: "leo", name: "Leo", language: "multilingual" },
    { voice_id: "rex", name: "Rex", language: "multilingual" },
    { voice_id: "sal", name: "Sal", language: "multilingual" },
    { voice_id: "una", name: "Una", language: "multilingual" }
  ]
} as const;

export const grokVoiceIdToDisplayNameTTS = {
  eve: "Eve",
  ara: "Ara",
  rex: "Rex",
  sal: "Sal",
  leo: "Leo",
  una: "Una"
} as const;

export const grokVoiceDisplayNameToIdTTS = {
  Eve: "eve",
  Ara: "ara",
  Rex: "rex",
  Sal: "sal",
  Leo: "leo",
  Una: "una"
} as const;

export type GrokLanguageTTS =
  | "auto"
  | "en"
  | "ar-EG"
  | "ar-SA"
  | "ar-AE"
  | "bn"
  | "zh"
  | "fr"
  | "de"
  | "hi"
  | "id"
  | "it"
  | "ja"
  | "ko"
  | "pt-BR"
  | "pt-PT"
  | "ru"
  | "es-MX"
  | "es-ES"
  | "tr"
  | "vi";

/**
 * Sample rate in Hz
 */
export type GrokSampleRateTTS = 8000 | 16000 | 22050 | 24000 | 44100 | 48000;
export type GrokBitRateTTS = 32000 | 64000 | 96000 | 128000 | 192000;

export type GrokOutputFormatTTS = {
  codec: GrokAudioCodecTTS;
  sample_rate?: GrokSampleRateTTS | null;
  bit_rate?: GrokBitRateTTS | null;
};

export interface GrokTTSReqShape {
  text: string;
  voice_id?: GrokVoiceTTS;
  /**
   * BCP-47 language code or `auto`
   */

  language?: GrokLanguageTTS;
  /**
   * when omitted default is MP3 at 24 kHz / 128 kbps
   */
  output_format?: GrokOutputFormatTTS;
}

export type AIChatResponseAudioGenSubFields = {
  itemId?: string;
  draftId: string | null;
  batchId: string | null;
  s3ObjectId: string | null;
  userId: string;
  origin: "GENERATED";
  status: $Enums.AudioGenStage;
  size: number | null;
  compatKey: string | null;
  compatStatus: $Enums.CompatStatus | null;
  compatCdnUrl: string | null;
  compatReadyAt: Date | null;
  compatVersionId: string | null;
  compatS3ObjectId: string | null;
  compatMime: string | null;
  compatExt: string | null;
  uploadDuration: number | null;
  cdnUrl: string | null;
  publicUrl: string | null;
  sourceUrl: string | null;
  thumbnailKey: string | null;
  bucket: string;
  key: string;
  versionId: string | null;
  region: string;
  cacheControl: string | null;
  contentDisposition: string | null;
  contentEncoding: string | null;
  expiresAt: Date | null;
  filename: string | null;
  ext: string | null;
  mime: string | null;
  etag: string | null;
  checksumAlgo: $Enums.ChecksumAlgo;
  checksumSha256: string | null;
  storageClass: string | null;
  sseAlgorithm: string | null;
  sseKmsKeyId: string | null;
  s3LastModified: Date | null;
  deletedAt: Date | null;
  audio: Rm<AudioSingleton, "attachmentId" | "createdAt" | "updatedAt"> | null;
  audioGenOutput: Rm<
    AudioGenOutputSingleton,
    "id" | "attachmentId" | "createdAt" | "updatedAt"
  > | null;
  generationGroupId: string;
  requestMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
  jobId: string;
};

export type AIChatResponseAudioGenFields = {
  outputMime?: string; // "audio/mpeg" — delivered truth
  duration?: number; // generation wall-clock, imgGen parity
  size?: number;
  audio?: AIChatResponseAudioGenSubFields; // n=1: a single slot — no images[]/partialImages[]/activeImage triad
};

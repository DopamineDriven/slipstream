import type { TTSTypes } from "@/tts.ts";
import type { AudioGenOutputSingleton, AudioSingleton } from "@/types.ts";
import type { Rm } from "@/utils.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";

export const WAVEFORM_PEAK_COUNT=1024 as const;

export const WAVEFORM_PEAK_SCALE = 100 as const;

export type OpenAICodecTTS = "wav" | "mp3" | "pcm" | "aac" | "opus" | "flac";

export type GeminiCodecTTS = "wav" | "mp3";

/**
 * Grok Types
 */

export type GrokAudioCodecTTS = TTSTypes.Codec;

export type TTSCodec = GrokAudioCodecTTS | OpenAICodecTTS | GeminiCodecTTS;

export type GrokVoiceTTS = TTSTypes.Voice;

export type GrokVoiceDisplayNameTTS = TTSTypes.VoiceDisplayName;

export const grokVoiceIdsTTS = [
  "eve",
  "ara",
  "rex",
  "sal",
  "leo",
  "una",
  "liora",
  "aurora",
  "atlas",
  "nakash",
  "castor",
  "lumen",
  "sirius",
  "ursa",
  "celeste",
  "cosmo",
  "zigel",
  "kepler",
  "lux",
  "helios",
  "perseus",
  "zenith",
  "altair",
  "iris",
  "luna",
  "orion",
  "helix",
  "zagan",
  "carina"
] as const;

export const grokVoiceDisplayNamesTTS = [
  "Eve",
  "Ara",
  "Rex",
  "Sal",
  "Leo",
  "Una",
  "Liora",
  "Aurora",
  "Atlas",
  "Nakash",
  "Castor",
  "Lumen",
  "Sirius",
  "Ursa",
  "Celeste",
  "Cosmo",
  "Zigel",
  "Kepler",
  "Lux",
  "Helios",
  "Perseus",
  "Zenith",
  "Altair",
  "Iris",
  "Luna",
  "Orion",
  "Helix",
  "Zagan",
  "Carina"
] as const;

export const grokVoices = {
  voices: [
    {
      voice_id: "altair",
      name: "Altair",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "ara",
      name: "Ara",
      language: "multilingual",
      gender: "female"
    },
    {
      voice_id: "atlas",
      name: "Atlas",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "aurora",
      name: "Aurora",
      language: "multilingual",
      gender: "female"
    },
    {
      voice_id: "carina",
      name: "Carina",
      language: "multilingual",
      gender: "female"
    },
    {
      voice_id: "castor",
      name: "Castor",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "celeste",
      name: "Celeste",
      language: "multilingual",
      gender: "female"
    },
    {
      voice_id: "cosmo",
      name: "Cosmo",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "eve",
      name: "Eve",
      language: "multilingual",
      gender: "female"
    },
    {
      voice_id: "helios",
      name: "Helios",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "helix",
      name: "Helix",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "iris",
      name: "Iris",
      language: "multilingual",
      gender: "female"
    },
    {
      voice_id: "kepler",
      name: "Kepler",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "leo",
      name: "Leo",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "liora",
      name: "Liora",
      language: "multilingual",
      gender: "female"
    },
    {
      voice_id: "lumen",
      name: "Lumen",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "luna",
      name: "Luna",
      language: "multilingual",
      gender: "female"
    },
    {
      voice_id: "lux",
      name: "Lux",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "naksh",
      name: "Naksh",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "orion",
      name: "Orion",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "perseus",
      name: "Perseus",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "rex",
      name: "Rex",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "rigel",
      name: "Rigel",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "sal",
      name: "Sal",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "sirius",
      name: "Sirius",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "ursa",
      name: "Ursa",
      language: "multilingual",
      gender: "female"
    },
    {
      voice_id: "zagan",
      name: "Zagan",
      language: "multilingual",
      gender: "male"
    },
    {
      voice_id: "zenith",
      name: "Zenith",
      language: "multilingual",
      gender: "male"
    }
  ]
} as const;

export const grokVoiceIdToDisplayNameTTS = {
  eve: "Eve",
  ara: "Ara",
  rex: "Rex",
  sal: "Sal",
  leo: "Leo",
  una: "Una",
  liora: "Liora",
  aurora: "Aurora",
  atlas: "Atlas",
  nakash: "Nakash",
  castor: "Castor",
  lumen: "Lumen",
  sirius: "Sirius",
  ursa: "Ursa",
  celeste: "Celeste",
  cosmo: "Cosmo",
  zigel: "Zigel",
  kepler: "Kepler",
  lux: "Lux",
  helios: "Helios",
  perseus: "Perseus",
  zenith: "Zenith",
  altair: "Altair",
  iris: "Iris",
  luna: "Luna",
  orion: "Orion",
  helix: "Helix",
  zagan: "Zagan",
  carina: "Carina"
} as const;

export const grokVoiceDisplayNameToIdTTS = {
  Eve: "eve",
  Ara: "ara",
  Rex: "rex",
  Sal: "sal",
  Leo: "leo",
  Una: "una",
  Liora: "liora",
  Aurora: "aurora",
  Atlas: "atlas",
  Nakash: "nakash",
  Castor: "castor",
  Lumen: "lumen",
  Sirius: "sirius",
  Ursa: "ursa",
  Celeste: "celeste",
  Cosmo: "cosmo",
  Zigel: "zigel",
  Kepler: "kepler",
  Lux: "lux",
  Helios: "helios",
  Perseus: "perseus",
  Zenith: "zenith",
  Altair: "altair",
  Iris: "iris",
  Luna: "luna",
  Orion: "orion",
  Helix: "helix",
  Zagan: "zagan",
  Carina: "carina"
} as const;

export type GrokLanguageTTS = TTSTypes.Language;

/**
 * Sample rate in Hz
 */
export type GrokSampleRateTTS = TTSTypes.SampleRate;
export type GrokBitRateTTS = TTSTypes.BitRate;

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

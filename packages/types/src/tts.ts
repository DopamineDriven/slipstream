import type { UTR } from "@/utils.ts";

export namespace TTSTypes {
  export type Language =
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

  export type Voice = "eve" | "ara" | "rex" | "sal" | "leo" | "una";

  export type Codec = "wav" | "mp3" | "pcm" | "mulaw" | "alaw";

  export type BitRate = 32000 | 64000 | 96000 | 128000 | 192000;

  export type SampleRate = 8000 | 16000 | 22050 | 24000 | 44100 | 48000;

  export type VoiceDisplayName = Capitalize<Voice>;

  export namespace Text {
    export interface Delta {
      type: "text.delta";
      delta: string;
    }
    export interface Done {
      type: "text.done";
    }
  }
  export type Outbound = Text.Delta | Text.Done;
  export type OutboundRecord = UTR<Outbound, "type">;
  export namespace Audio {
    export interface Delta {
      type: "audio.delta";
      delta: string;
    }
    export interface Done {
      type: "audio.done";
      trace_id: string;
    }

    export interface Error {
      type: "error";
      message: string;
    }
  }

  export type Inbound = Audio.Delta | Audio.Done | Audio.Error;
  export type InboundRecord = UTR<Inbound, "type">;

  export type IORecord = UTR<IOUnion, "type">;
  export type IOUnion = Inbound | Outbound;

  export type CreateTTSJob = {
    conversationId: string;
    sourceMessageId: string;
    userId: string;
    provider: string;
    voice: string;
    language: string;
    codec: string;
    sampleRate: number;
    bitrate: number;
    charCount: number;
  };

  export type UpdateTTSJob = {
    durationMs?: number;
    generationMs?: number;
    sizeBytes?: bigint;
    error?: string;
    cdnUrl?: string;
    attachmentId?: string;
  };
}

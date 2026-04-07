import type { UnionToRecord } from "@slipstream/types";

export namespace TTSTypes {
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
  export type OutboundRecord = UnionToRecord<Outbound>;
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
  export type InboundRecord = UnionToRecord<Inbound>;

  export type IORecord = UnionToRecord<Inbound | Outbound>;
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

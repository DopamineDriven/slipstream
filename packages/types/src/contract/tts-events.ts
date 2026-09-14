import type { TTSTypes } from "@/index.ts";
import type { UTR } from "@/utils.ts";

export type UserTTSRequest = {
  type: "user_tts_request";
  conversationId: string;
  messageId: string;
  /**
   * defaults to `"auto"`
   */
  language?: TTSTypes.Language;
  /**
   * defaults to mp3
   */
  codec?: TTSTypes.Codec;
  /**
   * defaults to eve
   */
  voice?: TTSTypes.Voice;
  /**
   * defaults to 128000 (bps)
   */
  bitRate?: number;
  /**
   * defaults to 24000 (Hz)
   */
  sampleRate?: number;
};

export type UserTTSChunk = {
  type: "user_tts_chunk";
  ttsJobId: string;
  conversationId: string;
  messageId: string;
  audioChunk: string;
  generationMs: number;
};

export type UserTTSError = {
  type: "user_tts_error";
  status: number;
  statusText: string;
  ttsJobId?: string;
  conversationId: string;
  messageId: string;
};

export type UserTTSResponse = {
  type: "user_tts_response";
  ttsJobId: string;
  attachmentId: string;
  conversationId: string;
  messageId: string;
  durationMs: number;
  generationMs: number;
  size: number;
  cdnUrl: string;
  codec: TTSTypes.Codec;
};

export type UserTTSResponsePreexisting = {
  type: "user_tts_response_preexisting";
  ttsJobId: string;
  attachmentId: string;
  conversationId: string;
  messageId: string;
  durationMs: number;
  generationMs: number;
  size: number;
  cdnUrl: string;
  codec: TTSTypes.Codec;
};

export type UserTTSEventUnion =
  | UserTTSChunk
  | UserTTSRequest
  | UserTTSError
  | UserTTSResponse
  | UserTTSResponsePreexisting;

export type UserTTSEventRecord<T extends boolean = false>  = UTR<UserTTSEventUnion, "type", T>;

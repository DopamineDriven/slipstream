import type { LocalToolCapabilities } from "@/contract/local-tool-events.ts";
import type { AIChatResponseAudioGenFields } from "@/events-audio.ts";
import type {
  AIChatRequestImgGenFields,
  AIChatResponseImgGenFieldsFinal
} from "@/events-images.ts";
import type { AIChatEventTypeUnion, UserMetadata } from "@/events-workup.ts";
import type { AllModelsUnion, Provider } from "@/models.ts";
import type { ConversationSingleton } from "@/types.ts";
import type { CTR, DX, Rm, UTR } from "@/utils.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";

export type ChatChunkAndResMsgBlock = {
  type: $Enums.MessageBlockType;
  content: string;
  ordinal: number;
  conversationId: string;
  durationMs: number;
};

export interface AIChatResEntity<T extends `ai_chat_${AIChatEventTypeUnion}`> {
  type: T;
  conversationId: string;
  userMsgId: string;
  userId: string;
  chunk?: string;
  done: T extends "ai_chat_error" ? true : boolean;
  data?: string;
  provider?: Provider;
  title?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  aiMsgId?: string;
  messageBlocks?: T extends "ai_chat_response"
    ? ChatChunkAndResMsgBlock[]
    : ChatChunkAndResMsgBlock;
  imgGenAttachmentId?: string;
  imgGenEnabled?: boolean;
  imgGenFields?: AIChatResponseImgGenFieldsFinal;
  audioGenEnabled?: boolean;
  audioGenFields?: AIChatResponseAudioGenFields;
}

export type AIChatRequest = {
  type: "ai_chat_request";
  conversationId: string;
  prompt: string;
  provider: Provider;
  model?: AllModelsUnion;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  hasProviderConfigured?: boolean;
  isDefaultProvider?: boolean;
  metadata?: UserMetadata;
  batchId?: string;
  // TODO
  // enableVideoGen?: boolean
  imgGenEnabled?: boolean;
  audioGenEnabled?: boolean;
  imgGenFields?: AIChatRequestImgGenFields;
  localTools?: LocalToolCapabilities;
};

export type AIChatInlineData = DX<
  CTR<AIChatResEntity<"ai_chat_inline_data">, "data">
>;

export type AIChatChunk = DX<
  AIChatResEntity<"ai_chat_chunk"> & {
    isThinking?: boolean;
    thinkingDuration?: number;
    thinkingText?: string;
  }
>;

export type AIChatResponse = DX<
  CTR<AIChatResEntity<"ai_chat_response">, "chunk"> & {
    /**
     * only contains a single message within, the most recent one (the ai model's response)
     */
    convo: ConversationSingleton<true>;
    usage?: number;
    thinkingDuration?: number;
    thinkingText?: string;
  }
>;

export type AIChatResponseDb = DX<
  Rm<CTR<AIChatResEntity<"ai_chat_response">, "chunk">, "imgGenFields"> & {
    usage?: number;
    thinkingDuration?: number;
    thinkingText?: string;
    responseOutput?: string;
    imgGenFields?: AIChatResponseImgGenFieldsFinal;
    audioGenFields?: AIChatResponseAudioGenFields;
  }
>;

export type AIChatError = DX<
  Rm<AIChatResEntity<"ai_chat_error">, "chunk" | "data"> & {
    usage?: number;
    stopReason?: unknown;
    message: string;
  }
>;

export type AIChatEventUnion =
  AIChatChunk | AIChatError | AIChatInlineData | AIChatRequest | AIChatResponse;

export type AIChatEventRecord = UTR<AIChatEventUnion, "type">;

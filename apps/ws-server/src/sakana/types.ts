import type { ProviderChatRequestEntity } from "@/types/index.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  AttachmentSingleton,
  SakanaModelIdUnion,
  UTR
} from "@slipstream/types";
import type {OpenAI} from "openai";
export interface ReasoningProps {
  effort: "high" | "xhigh";
}

export interface SakanaUserLocation {
  readonly type: "approximate";
  readonly city?: string;
  readonly region?: string;
  readonly country?: string;
  readonly timezone?: string;
  readonly tz?: string;
}

export interface SakanaAttachmentRef {
  readonly attachment: AttachmentSingleton<true>;
  readonly filename: string;
  readonly mime: string;
  readonly url: string;
}

export interface SakanaFreshAssetSelection {
  readonly inlineAttachmentKeys: ReadonlySet<string>;
}

export interface SakanaRouteRequestEntity extends ProviderChatRequestEntity {
  user_location?: SakanaUserLocation;
}

export interface SakanaProviderChatRequestEntity extends ProviderChatRequestEntity {
  model: SakanaModelIdUnion;
  user_location?: SakanaUserLocation;
}

export interface SakanaActiveMessageBlock {
  content: string;
  startedAt: number;
  type: "THINKING" | "ENCRYPTED_THINKING" | "TEXT";
  /** rs_-prefixed reasoning item id — the matching output_item.done closes the clock */
  itemId?: string;
}

export interface SakanaFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

export type StreamEvents = UTR<OpenAI.Responses.ResponseStreamEvent, "type">;

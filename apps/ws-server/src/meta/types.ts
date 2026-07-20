import type { ProviderChatRequestEntity } from "@/types/index.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { AttachmentSingleton, MetaModelIdUnion, UTR } from "@slipstream/types";
import { OpenAI } from "openai";

export interface MetaReasoningEffort {
  effort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
}

export interface MetaUserLocation {
  readonly type: "approximate";
  readonly city?: string;
  readonly region?: string;
  readonly country?: string;
  readonly timezone?: string;
  readonly tz?: string;
}

export interface MetaProviderChatRequestEntity extends ProviderChatRequestEntity {
  model: MetaModelIdUnion;
  user_location?: MetaUserLocation;
}

export interface MetaActiveMessageBlock {
  content: string;
  startedAt: number;
  type: "THINKING" | "ENCRYPTED_THINKING" | "TEXT";
}

export interface MetaFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

export interface MetaAttachmentRef {
  readonly attachment: AttachmentSingleton<true>;
  readonly filename: string;
  readonly mime: string;
  readonly url: string;
}

export interface MetaFreshAssetSelection {
  readonly inlineAttachmentKeys: ReadonlySet<string>;
}

export interface MetaRouteRequestEntity extends ProviderChatRequestEntity {
  user_location?: MetaUserLocation;
}

export type MetaStreamEvents = UTR<OpenAI.Responses.ResponseStreamEvent, "type">;


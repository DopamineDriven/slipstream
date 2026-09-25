import type { ProviderChatRequestEntity } from "@/types/index.ts";
import { OpenAI } from "openai";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  AttachmentSingleton,
  MetaModelIdUnion,
  ToolEnablementProps,
  UTR
} from "@slipstream/types";

export interface MetaReasoningEffort {
  effort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
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
  /** rs_-prefixed reasoning item id — the matching output_item.done closes the clock */
  itemId?: string;
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

/**
 * muse-image-1.0's only tool. The SDK's image_generation shape plus what Meta
 * documents flat on the tool: the planner switches and `reasoning_strength`
 */
export type MetaImageGenerationTool = Pick<
  OpenAI.Responses.Tool.ImageGeneration,
  "type" | "size" | "output_format" | "moderation"
> &
  ToolEnablementProps & {
    reasoning_strength?: "low" | "high";
  };



export interface PersistMetaImageParams {
  b64: string;
  /** 0..n-1 across the images one response returned */
  index: number;
  userId: string;
  conversationId: string;
  /** Meta's `resp_` id */
  generationGroupId: string;
  requestMessageId?: string;
  jobId?: string;
}

export type MetaStreamEvents = UTR<
  OpenAI.Responses.ResponseStreamEvent,
  "type"
>;

export type MetaStreamEventTypeUnion = keyof MetaStreamEvents;

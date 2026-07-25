import type { ProviderChatRequestEntity } from "@/types/index.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  AttachmentSingleton,
  SakanaModelIdUnion
} from "@slipstream/types";

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
}

export interface SakanaFinalizedMessageBlock {
  content: string;
  durationMs: number;
  ordinal: number;
  type: $Enums.MessageBlockType;
}

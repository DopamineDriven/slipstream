import { Message } from "@prisma/client";
import { Providers, RTC } from "@t3-chat-clone/types";

export type ProviderCountsProps = {
  openai: number;
  grok: number;
  gemini: number;
  anthropic: number;
};

export type RecordCountsProps = {
  isSet: ProviderCountsProps;
  isDefault: ProviderCountsProps;
};

export type ClientWorkupProps = {
  isSet: Record<Providers, boolean>;
  isDefault: Record<Providers, boolean>;
};
export type UIMessage = RTC<Message, "conversationId">

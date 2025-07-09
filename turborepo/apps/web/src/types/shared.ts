import { Providers } from "@/types/chat-ws";

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

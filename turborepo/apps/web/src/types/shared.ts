import { Message as MessagePrisma } from "@prisma/client";
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
export type UIMessage = RTC<MessagePrisma, "conversationId">;
export interface MessageClient
  extends Omit<MessagePrisma, "createdAt" | "updatedAt" | "provider"> {
  provider: "grok" | "openai" | "gemini" | "anthropic";
  createdAt: string;
  updatedAt: string;
  text: string | React.ReactNode;

  originalText?: string;

  timestamp: string;

  avatar?: string;

  isEditing?: boolean;
}

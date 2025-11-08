import type { ProviderChatRequestEntity, UserData } from "@/types/index.ts";
import type {
  AIChatRequestImgGenFields,
  MessageSingleton
} from "@slipstream/types";

export interface ProviderGeminiChatRequestEntity
  extends ProviderChatRequestEntity {
  userData?: UserData;
}

export type GenerateContentResponseProps = {
  isNewChat: boolean;
  msgs: MessageSingleton<true>[];
  model: string;
  keyId: string | null;
  apiKey?: string;
  latlng?: string;
  topP?: number;
  temperature?: number;
  max_tokens?: number;
  systemPrompt?: string;
  imgGenFields?: AIChatRequestImgGenFields;
};

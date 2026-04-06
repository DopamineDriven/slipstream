import type { ApiKeyData } from "@/ui/api-key-settings/types";
import {
  AnthropicIcon,
  CohereIconCurrentColor,
  DeepSeek,
  GeminiIcon,
  Kimi,
  MetaIcon,
  MistralIcon,
  OpenAiIcon,
  VercelIcon as v0Icon,
  XAiIcon,
  Zai
} from "@slipstream/ui";

export const providerObj = [
  {
    provider: "anthropic",
    text: "Anthropic",
    icon: AnthropicIcon,
    value: "sk-ant-*******************************************",
    isSet: false,
    isDefault: false
  },
  {
    provider: "gemini",
    text: "Gemini",
    icon: GeminiIcon,
    value: "AIza********************",
    isSet: false,
    isDefault: false
  },
  {
    provider: "grok",
    text: "Grok",
    icon: XAiIcon,
    value: "xai-*******************************************",
    isSet: false,
    isDefault: false
  },
  {
    provider: "openai",
    text: "OpenAI",
    icon: OpenAiIcon,
    value: "sk-************************************************",
    isSet: false,
    isDefault: false
  },
  {
    provider: "meta",
    text: "Llama",
    icon: MetaIcon,
    value: "LLM|******************|*******************",
    isSet: false,
    isDefault: false
  },
  {
    provider: "vercel",
    text: "v0",
    icon: v0Icon,
    value: "vck_********************************",
    isDefault: false,
    isSet: false
  },
  {
    provider: "mistral",
    text: "Mistral",
    icon: MistralIcon,
    value: `SwM*****************************`,
    isDefault: false,
    isSet: false
  },
  {
    provider: "cohere",
    text: "Cohere",
    icon: CohereIconCurrentColor,
    value: "QlQ*************************************",
    isSet: false,
    isDefault: false
  },
  {
    provider: "deepseek",
    text: "DeepSeek",
    icon: DeepSeek,
    value: "vck_********************************",
    isSet: false,
    isDefault: false
  },
  {
    provider: "moonshotai",
    text: "Moonshot AI",
    icon: Kimi,
    value: "vck_********************************",
    isSet: false,
    isDefault: false
  },
  {
    provider: "zai",
    text: "Z.ai",
    icon: Zai,
    value: "vck_********************************",
    isSet: false,
    isDefault: false
  }
] as ApiKeyData[];

export const CARD_HEADER_TEXT =
  "Bring your own API keys for expanded model support. This allows for substantially higher usage limits and access to premium models.";
export const CARD_FOOTER_TEXT =
  "API keys are encrypted at rest and are only used to communicate with respective model providers in secure server contexts.";

export const API_KEY_SETTINGS_TEXT_CONSTS = {
  CARD_HEADER_TEXT,
  CARD_FOOTER_TEXT
};

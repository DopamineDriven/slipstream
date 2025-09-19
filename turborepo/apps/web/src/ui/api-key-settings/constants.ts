import type { ApiKeyData } from "@/ui/api-key-settings/types";
import {
  AnthropicIcon,
  GeminiIcon,
  MetaIcon,
  OpenAiIcon,
  VercelIcon as v0Icon,
  XAiIcon
} from "@slipstream/ui";

export const providerObj = [
  {
    provider: "anthropic",
    text: "Anthropic",
    icon: AnthropicIcon,
    value: "sk-ant-*******************************************",
    isSet: true,
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
    isSet: true,
    isDefault: false
  },
  {
    provider: "openai",
    text: "OpenAI",
    icon: OpenAiIcon,
    value: "sk-************************************************",
    isSet: true,
    isDefault: true
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
    value: "v0:team_******************:**************",
    isDefault: false,
    isSet: false
  }
] satisfies ApiKeyData[];

export const CARD_HEADER_TEXT =
  "Bring your own API keys for expanded model support. This allows for substantially higher usage limits and access to premium models.";
export const CARD_FOOTER_TEXT =
  "API keys are encrypted at rest and are only used to communicate with respective model providers in secure server contexts.";

export const API_KEY_SETTINGS_TEXT_CONSTS = {
  CARD_HEADER_TEXT,
  CARD_FOOTER_TEXT
} as const;

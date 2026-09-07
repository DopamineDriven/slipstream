import type { ProviderRosterEntry } from "@/ui/api-key-settings/types";
import {
  AnthropicIcon,
  CohereIconCurrentColor,
  DeepSeek,
  GeminiIcon,
  Kimi,
  MetaIcon,
  MinimaxIcon,
  MistralIcon,
  OpenAiIcon,
  QwenIcon,
  SakanaIcon,
  VercelIcon as v0Icon,
  XAiIcon,
  Zai
} from "@slipstream/ui";

/** display order is roster order — both the configured list and the add grid follow it */
export const providerRoster = [
  {
    provider: "anthropic",
    text: "Anthropic",
    icon: AnthropicIcon,
    placeholder: "sk-ant-*******************************************"
  },
  {
    provider: "gemini",
    text: "Gemini",
    icon: GeminiIcon,
    placeholder: "AIza********************"
  },
  {
    provider: "grok",
    text: "Grok",
    icon: XAiIcon,
    placeholder: "xai-*******************************************"
  },
  {
    provider: "openai",
    text: "OpenAI",
    icon: OpenAiIcon,
    placeholder: "sk-************************************************"
  },
  {
    provider: "meta",
    text: "Meta",
    icon: MetaIcon,
    placeholder: "LLM_*************************************"
  },
  {
    provider: "vercel",
    text: "v0",
    icon: v0Icon,
    placeholder: "vck_********************************"
  },
  {
    provider: "mistral",
    text: "Mistral",
    icon: MistralIcon,
    placeholder: "SwM*****************************"
  },
  {
    provider: "cohere",
    text: "Cohere",
    icon: CohereIconCurrentColor,
    placeholder: "QlQ*************************************"
  },
  {
    provider: "deepseek",
    text: "DeepSeek",
    icon: DeepSeek,
    placeholder: "vck_********************************"
  },
  {
    provider: "moonshotai",
    text: "Moonshot AI",
    icon: Kimi,
    placeholder: "vck_********************************"
  },
  {
    provider: "zai",
    text: "Z.ai",
    icon: Zai,
    placeholder: "vck_********************************"
  },
  {
    provider: "alibaba",
    text: "Alibaba",
    icon: QwenIcon,
    placeholder: "vck_********************************"
  },
  {
    provider: "minimax",
    text: "MiniMax",
    icon: MinimaxIcon,
    placeholder: "vck_********************************"
  },
  {
    provider: "sakana",
    text: "Sakana",
    icon: SakanaIcon,
    placeholder: "fish_********************************"
  }
] as const satisfies readonly ProviderRosterEntry[];

export const CARD_HEADER_TEXT =
  "Bring your own API keys for expanded model support. This allows for substantially higher usage limits and access to premium models.";
export const CARD_FOOTER_TEXT =
  "API keys are encrypted at rest and are only used to communicate with respective model providers in secure server contexts.";

export const API_KEY_SETTINGS_TEXT_CONSTS = {
  CARD_HEADER_TEXT,
  CARD_FOOTER_TEXT
} as const;

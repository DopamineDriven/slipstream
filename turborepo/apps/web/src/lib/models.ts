import { AnthropicIcon, GeminiIcon, OpenAiIcon, XAiIcon } from "@/ui/icons";
import type {
  AllModelsUnion,
  AnthropicDisplayNameUnion,
  AnthropicModelIdUnion,
  GeminiDisplayNameUnion,
  GeminiModelIdUnion,
  GrokDisplayNameUnion,
  GrokModelIdUnion,
  OpenAiDisplayNameUnion,
  OpenAiModelIdUnion
} from "@t3-chat-clone/types";
import {
  displayNameToModelId,
  getDisplayNameByModelId,
  getModelIdByDisplayName
} from "@t3-chat-clone/types";

export type Provider = keyof typeof displayNameToModelId;

export const providerMetadata = {
  openai: {
    name: "OpenAI",
    icon: OpenAiIcon,
    color: "#10a37f",
    description: "Advanced language models from OpenAI"
  },
  gemini: {
    name: "Google Gemini",
    icon: GeminiIcon,
    color: "#4285f4",
    description: "Google's multimodal AI models"
  },
  grok: {
    name: "xAI Grok",
    icon: XAiIcon,
    color: "#000000",
    description: "xAI's conversational AI models"
  },
  anthropic: {
    name: "Anthropic Claude",
    icon: AnthropicIcon,
    color: "#d97706",
    description: "Anthropic's helpful, harmless, and honest AI"
  }
} as const;

export type DisplayNameWorkup<T extends Provider> = T extends "openai"
  ? ReturnType<typeof getDisplayNameByModelId<T, OpenAiModelIdUnion>>
  : T extends "anthropic"
    ? ReturnType<typeof getDisplayNameByModelId<T, AnthropicModelIdUnion>>
    : T extends "grok"
      ? ReturnType<typeof getDisplayNameByModelId<T, GrokModelIdUnion>>
      : T extends "gemini"
        ? ReturnType<typeof getDisplayNameByModelId<T, GeminiModelIdUnion>>
        : never;

export type ModelIdWorkup<T extends Provider> = T extends "openai"
  ? ReturnType<typeof getModelIdByDisplayName<T, OpenAiDisplayNameUnion>>
  : T extends "anthropic"
    ? ReturnType<typeof getModelIdByDisplayName<T, AnthropicDisplayNameUnion>>
    : T extends "grok"
      ? ReturnType<typeof getModelIdByDisplayName<T, GrokDisplayNameUnion>>
      : T extends "gemini"
        ? ReturnType<typeof getModelIdByDisplayName<T, GeminiDisplayNameUnion>>
        : never;
/**
 * use this in client components where the select options are
 * the display names (the keys of the object) which, on select, outputs the
 * respective model id (the value for the model expected by the ws-server for ai_chat_request arguments)
 */
export type ModelSelection = {
  provider: Provider;
  displayName: string;
  modelId: string;
};

export type ModelSelectionAlt<T extends Provider> = {
  provider: T;
  displayName: DisplayNameWorkup<T>;
  modelId: ModelIdWorkup<T>;
};

export const defaultModelByProvider = {
  openai: "GPT 4.1 Nano" as OpenAiDisplayNameUnion,
  gemini: "Gemini 2.5 Flash" as GeminiDisplayNameUnion,
  grok: "Grok 4" as GrokDisplayNameUnion,
  anthropic: "Claude Sonnet 4" as AnthropicDisplayNameUnion
} as const;

export const defaultModelIdByProvider = {
  openai: "gpt-4.1-nano" as OpenAiModelIdUnion,
  gemini: "gemini-2.5-flash" as GeminiModelIdUnion,
  grok: "grok-4-0709" as GrokModelIdUnion,
  anthropic: "claude-sonnet-4-20250514" as AnthropicModelIdUnion
};

export let defaultProvider: "openai" | "gemini" | "grok" | "anthropic";
export const defaultModelSelection: ModelSelection = {
  provider: (defaultProvider = "anthropic"),
  displayName: defaultModelByProvider[defaultProvider],
  modelId:
    defaultProvider === "anthropic"
      ? getModelIdByDisplayName(
          (defaultProvider = "anthropic"),
          defaultModelByProvider[defaultProvider]
        )
      : defaultProvider === "gemini"
        ? getModelIdByDisplayName(
            (defaultProvider = "gemini"),
            defaultModelByProvider[defaultProvider]
          )
        : defaultProvider === "grok"
          ? getModelIdByDisplayName(
              (defaultProvider = "grok"),
              defaultModelByProvider[defaultProvider]
            )
          : getModelIdByDisplayName(
              (defaultProvider = "openai"),
              defaultModelByProvider[defaultProvider]
            )
};
export function getModelDisplayName(
  toProvider: Provider,
  modelId: string | null
) {
  const model = (modelId ??
    defaultModelIdByProvider[toProvider]) as AllModelsUnion;

  return toProvider === "anthropic"
    ? getDisplayNameByModelId(toProvider, model as AnthropicModelIdUnion)
    : toProvider === "gemini"
      ? getDisplayNameByModelId(toProvider, model as GeminiModelIdUnion)
      : toProvider === "grok"
        ? getDisplayNameByModelId(toProvider, model as GrokModelIdUnion)
        : getDisplayNameByModelId(toProvider, model as OpenAiModelIdUnion);
}

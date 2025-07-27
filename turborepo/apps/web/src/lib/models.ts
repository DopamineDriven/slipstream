import { AnthropicIcon, GeminiIcon, OpenAiIcon, XAiIcon } from "@/ui/icons";
import type {
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
  openai: "GPT 4o Mini" as OpenAiDisplayNameUnion,
  gemini: "Gemini 2.5 Flash-Lite Preview 06-17" as GeminiDisplayNameUnion,
  grok: "Grok 3" as GrokDisplayNameUnion,
  anthropic: "Claude Sonnet 3.5 (New)" as AnthropicDisplayNameUnion
} as const;

export const defaultModelIdByProvider = {
  openai: "gpt-4o-mini" as OpenAiModelIdUnion,
  gemini: "gemini-2.5-flash-lite-preview-06-17" as GeminiModelIdUnion,
  grok: "grok-3" as GrokModelIdUnion,
  anthropic: "claude-3-5-sonnet-20241022" as AnthropicModelIdUnion
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

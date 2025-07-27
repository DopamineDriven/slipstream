// src/lib/models.ts
import type { ProviderIconProps } from "@/ui/icons";
import type { JSX } from "react";
import { AnthropicIcon, GeminiIcon, OpenAiIcon, XAiIcon } from "@/ui/icons";
import type {
  GetDisplayNamesForProviderRT,
  GetModelsForProviderRT,
  ModelDisplayNameToModelId,
  ModelIdToModelDisplayName,
  Provider
} from "@t3-chat-clone/types";
import {
  defaultModelDisplayNameByProvider,
  defaultModelIdByProvider,
  getDisplayNamesForProvider,
  getModelsForProvider
} from "@t3-chat-clone/types";

// Re-export the strong typed ModelSelection interface
export interface ModelSelection<T extends Provider = Provider> {
  provider: T;
  displayName: ModelDisplayNameToModelId<T>;
  modelId: ModelIdToModelDisplayName<T>;
}

// Provider metadata with icons
export const providerMetadata: Record<
  Provider,
  {
    name: string;
    icon({ ...svg }: ProviderIconProps): JSX.Element;
    color: string;
    description: string;
  }
> = {
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
};

// Type-safe default model selection
export const defaultModelSelection = {
  provider: "openai",
  displayName: defaultModelDisplayNameByProvider.openai,
  modelId: defaultModelIdByProvider.openai
};

// Re-export the strongly typed defaults
export const defaultModelByProvider = defaultModelDisplayNameByProvider;

// Type-safe helper to get models for a provider
export function getModelsForProviderTyped<T extends Provider>(
  provider: T
): GetModelsForProviderRT<T>[] {
  return getModelsForProvider(provider);
}

// Type-safe helper to get display names for a provider
export function getDisplayNamesForProviderTyped<T extends Provider>(
  provider: T
): GetDisplayNamesForProviderRT<T>[] {
  return getDisplayNamesForProvider(provider);
}

// Helper to create a type-safe model selection
export function createModelSelection<T extends Provider>(
  provider: T,
  displayName: ModelDisplayNameToModelId<T>,
  modelId: ModelIdToModelDisplayName<T>
): ModelSelection<T> {
  return {
    provider,
    displayName,
    modelId
  };
}

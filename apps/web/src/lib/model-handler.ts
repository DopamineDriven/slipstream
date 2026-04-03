// src/lib/models.ts
import type {
  GetDisplayNamesForProviderRT,
  GetModelsForProviderRT,
  ModelDisplayNameToModelId,
  ModelIdToModelDisplayName,
  Provider
} from "@slipstream/types";
import {
  defaultModelDisplayNameByProvider,
  defaultModelIdByProvider,
  getDisplayNamesForProvider,
  getModelsForProvider
} from "@slipstream/types";

// Re-export the strong typed ModelSelection interface
export interface ModelSelection<T extends Provider = Provider> {
  provider: T;
  displayName: ModelDisplayNameToModelId<T>;
  modelId: ModelIdToModelDisplayName<T>;
}

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

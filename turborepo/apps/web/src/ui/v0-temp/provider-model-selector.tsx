"use client";

import type { ModelSelection } from "@/lib/models";
import { defaultModelByProvider, providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import type {
  AnthropicDisplayNameUnion,
  GeminiDisplayNameUnion,
  GrokDisplayNameUnion,
  OpenAiDisplayNameUnion,
  Provider
} from "@t3-chat-clone/types";
import { getModelIdByDisplayName } from "@t3-chat-clone/types";
import { Button, ChevronDown } from "@t3-chat-clone/ui";

interface ProviderModelSelectorProps {
  selectedModel?: ModelSelection;
  onModelChange?: (model: ModelSelection) => void;
  onClick?: () => void;
  className?: string;
}

export function ProviderModelSelector({
  selectedModel,
  onModelChange,
  onClick,
  className
}: ProviderModelSelectorProps) {
  const _handleProviderChange = (newProvider: Provider) => {
    const defaultModel = defaultModelByProvider[newProvider];
    const newModelSelection: ModelSelection = {
      provider: newProvider,
      displayName: defaultModel,
      modelId:
        newProvider === "anthropic"
          ? getModelIdByDisplayName(
              newProvider,
              (defaultModel as AnthropicDisplayNameUnion) ?? undefined
            )
          : newProvider === "gemini"
            ? getModelIdByDisplayName(
                newProvider,
                (defaultModel as GeminiDisplayNameUnion) ?? undefined
              )
            : newProvider === "grok"
              ? getModelIdByDisplayName(
                  newProvider,
                  (defaultModel as GrokDisplayNameUnion) ?? undefined
                )
              : getModelIdByDisplayName(
                  newProvider,
                  (defaultModel as OpenAiDisplayNameUnion) ?? undefined
                )
    };
    onModelChange?.(newModelSelection);
  };

  const currentProviderMeta =
    providerMetadata[selectedModel?.provider ?? "openai"];
  const CurrentProviderIcon = currentProviderMeta.icon;

  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={cn(
        "text-brand-text hover:bg-brand-component px-3 text-sm sm:text-base",
        className
      )}>
      <CurrentProviderIcon className="mr-2 h-4 w-4 flex-shrink-0" />
      {selectedModel?.displayName}
      <ChevronDown className="ml-1 h-4 w-4" />
    </Button>
  );
}

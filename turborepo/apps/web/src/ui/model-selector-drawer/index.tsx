"use client";

import React from "react";
import {
  defaultModelByProvider,
  getModelsForProvider,
  providerMetadata
} from "@/lib/models";
import { cn } from "@/lib/utils";
import {
  ModelIdToModelDisplayName as AvailableModelsByProvider,
  getDisplayNameByModelId,
  getModelIdByDisplayName,
  GrokDisplayNameUnion,
  OpenAiDisplayNameUnion,
  Provider
} from "@t3-chat-clone/types";
import {
  Button,
  ChevronDown,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@t3-chat-clone/ui";

import type { AnthropicModelDisplayNames, GeminiModelDispayNames } from "@/ui/mobile-model-select";
import { User } from "next-auth";

interface ModelSelection {
  provider: Provider
  displayName: string
  modelId: string
}
interface ProviderModelSelectorProps {
  selectedModel: ModelSelection
  onModelChangeAction: (model: ModelSelection) => void
  onClick?: () => void
  className?: string
  variant?: "button" | "compact";
  user?: User
}

export function ProviderModelSelector({
  selectedModel,
  onModelChangeAction,
  onClick,
  className,
  variant = "button",
  user: _user
}: ProviderModelSelectorProps) {


  const handleProviderChange = (newProvider: Provider) => {
    const defaultModel = defaultModelByProvider[newProvider];
    const newModelSelection = {
      provider: newProvider,
      displayName: defaultModel,
      modelId:
        newProvider === "anthropic"
          ? getModelIdByDisplayName(newProvider, (defaultModel as AnthropicModelDisplayNames) ?? undefined)
          : newProvider === "gemini"
            ? getModelIdByDisplayName(newProvider, (defaultModel as GeminiModelDispayNames) ?? undefined)
            : newProvider === "grok"
              ? getModelIdByDisplayName(newProvider, (defaultModel as GrokDisplayNameUnion) ?? undefined)
              : getModelIdByDisplayName(newProvider, (defaultModel as OpenAiDisplayNameUnion) ?? undefined),
    }
    onModelChangeAction(newModelSelection)
  }

  const handleModelChange = (displayName: string) => {
    const newModelSelection: ModelSelection = {
      provider: selectedModel.provider,
      displayName,
      modelId: getDisplayNameByModelId(
        selectedModel.provider,
        displayName as AvailableModelsByProvider<typeof selectedModel.provider>,
      ),
    }
    onModelChangeAction(newModelSelection)
  }

  const availableModels = getModelsForProvider(selectedModel.provider)
  const currentProviderMeta = providerMetadata[selectedModel.provider]

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center space-x-2", className)}>
        <Select value={selectedModel.provider} onValueChange={handleProviderChange}>
          <SelectTrigger className="w-[140px] bg-brand-component border-brand-border">
            <div className="flex items-center">
              {React.createElement(currentProviderMeta.icon, {
                className: "mr-2 w-4 h-4",
              })}
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-brand-component border-brand-border">
            {(["grok", "openai", "gemini", "anthropic"] as const).map((provider) => {
              const Icon = providerMetadata[provider].icon;
              return(
              <SelectItem key={provider} value={provider}>
                <div className="flex items-center">
                  <Icon className="mr-2 w-4 h-4" />
                  {providerMetadata[provider].name}
                </div>
              </SelectItem>
            )})}
          </SelectContent>
        </Select>

        <Select value={selectedModel.displayName} onValueChange={handleModelChange}>
          <SelectTrigger className="w-[180px] bg-brand-component border-brand-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-brand-component border-brand-border">
            {availableModels.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={cn("text-brand-text hover:bg-brand-component px-3 text-sm sm:text-base", className)}
    >
     <currentProviderMeta.icon className="mr-2 w-4 h-4 flex-shrink-0" />
      {selectedModel.displayName}
      <ChevronDown className="ml-1 h-4 w-4" />
    </Button>
  )
}

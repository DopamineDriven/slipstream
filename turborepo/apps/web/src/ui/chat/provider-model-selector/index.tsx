// src/ui/provider-model-selector.tsx
"use client";

import React from "react";
import { useModelSelection } from "@/context/model-selection-context";
import { defaultModelByProvider, providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import type {
  AnthropicDisplayNameUnion,
  GeminiDisplayNameUnion,
  GrokDisplayNameUnion,
  MetaDisplayNameUnion,
  OpenAiDisplayNameUnion,
  Provider,
  VercelDisplayNameUnion
} from "@slipstream/types";
import {
  getModelIdByDisplayName,
  getModelsForProvider
} from "@slipstream/types";
import {
  Button,
  ChevronDown,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@slipstream/ui";

interface ProviderModelSelectorProps {
  className?: string;
  variant?: "button" | "compact";
}

export function ProviderModelSelector({
  className,
  variant = "button"
}: ProviderModelSelectorProps) {
  const { selectedModel, updateProvider, updateModel, providers, openDrawer } =
    useModelSelection();

  const availableModels = getModelsForProvider(selectedModel.provider);
  const currentMeta = providerMetadata[selectedModel.provider];

  const handleProviderChange = (prov: Provider) => {
    switch (prov) {
      case "anthropic": {
        const displayName = defaultModelByProvider.anthropic;
        updateProvider("anthropic");
        updateModel(
          displayName,
          getModelIdByDisplayName("anthropic", displayName)
        );
        break;
      }
      case "meta": {
        const displayName = defaultModelByProvider.meta;
        updateProvider("meta");
        updateModel(displayName, getModelIdByDisplayName("meta", displayName));
        break;
      }
      case "vercel": {
        const displayName = defaultModelByProvider.vercel;
        updateProvider("vercel");
        updateModel(
          displayName,
          getModelIdByDisplayName("vercel", displayName)
        );
        break;
      }
      case "gemini": {
        const displayName = defaultModelByProvider.gemini;
        updateProvider("gemini");
        updateModel(
          displayName,
          getModelIdByDisplayName("gemini", displayName)
        );
        break;
      }
      case "grok": {
        const displayName = defaultModelByProvider.grok;
        updateProvider("grok");
        updateModel(displayName, getModelIdByDisplayName("grok", displayName));
        break;
      }
      case "openai":
      default: {
        const displayName = defaultModelByProvider.openai;
        updateProvider("openai");
        updateModel(
          displayName,
          getModelIdByDisplayName("openai", displayName)
        );
        break;
      }
    }
  };

  const handleModelChange = (name: string) => {
    const prov = selectedModel.provider;
    switch (prov) {
      case "anthropic": {
        const dn = name as AnthropicDisplayNameUnion;
        updateModel(dn, getModelIdByDisplayName("anthropic", dn));
        break;
      }
      case "gemini": {
        const dn = name as GeminiDisplayNameUnion;
        updateModel(dn, getModelIdByDisplayName("gemini", dn));
        break;
      }
      case "vercel": {
        const dn = name as VercelDisplayNameUnion;
        updateModel(dn, getModelIdByDisplayName("vercel", dn));
        break;
      }
      case "meta": {
        const dn = name as MetaDisplayNameUnion;
        updateModel(dn, getModelIdByDisplayName("meta", dn));
        break;
      }
      case "grok": {
        const dn = name as GrokDisplayNameUnion;
        updateModel(dn, getModelIdByDisplayName("grok", dn));
        break;
      }
      case "openai":
      default: {
        const dn = name as OpenAiDisplayNameUnion;
        updateModel(dn, getModelIdByDisplayName("openai", dn));
        break;
      }
    }
  };

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center space-x-2", className)}>
        <Select
          value={selectedModel.provider}
          onValueChange={v => handleProviderChange(v as Provider)}>
          <SelectTrigger className="bg-brand-component border-brand-border w-[140px]">
            <div className="flex items-center">
              {React.createElement(currentMeta.icon, {
                className: "mr-2 size-4"
              })}
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-brand-component border-brand-border">
            {providers.map(prov => {
              const Icon = providerMetadata[prov].icon;
              return (
                <SelectItem key={prov} value={prov}>
                  <div className="flex items-center">
                    <Icon className="mr-2 size-4" />
                    {providerMetadata[prov].name}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <Select
          value={selectedModel.displayName}
          onValueChange={handleModelChange}>
          <SelectTrigger className="bg-brand-component border-brand-border w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-brand-component border-brand-border">
            {availableModels.map(model => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      onClick={openDrawer}
      className={cn(
        "text-brand-text hover:bg-brand-component px-3 text-sm sm:text-base",
        className
      )}>
      <currentMeta.icon className="mr-2 size-4 flex-shrink-0" />
      <span className="max-w-[15ch] truncate">{selectedModel.displayName}</span>
      <ChevronDown className="ml-1 size-4" />
    </Button>
  );
}

"use client";

import React, { useEffect, useMemo } from "react";
import { useModelSelection } from "@/context/model-selection-context";
import { defaultModelByProvider, providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import type {
  AlibabaDisplayNameUnion,
  AnthropicDisplayNameUnion,
  CohereDisplayNameUnion,
  DeepSeekDisplayNameUnion,
  GeminiDisplayNameUnion,
  GrokDisplayNameUnion,
  KimiDisplayNameUnion,
  MetaDisplayNameUnion,
  MiniMaxDisplayNameUnion,
  MistralDisplayNameUnion,
  OpenAiDisplayNameUnion,
  Provider,
  SakanaDisplayNameUnion,
  ZaiDisplayNameUnion
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

  const visibleProviders = useMemo(
    () =>
      providers.filter(
        (provider): provider is Exclude<Provider, "vercel"> =>
          provider !== "vercel"
      ),
    [providers]
  );

  useEffect(() => {
    if (selectedModel.provider !== "vercel") {
      return;
    }

    const displayName = defaultModelByProvider.mistral;
    updateProvider("mistral");
    updateModel(displayName, getModelIdByDisplayName("mistral", displayName));
  }, [selectedModel.provider, updateModel, updateProvider]);

  const activeProvider =
    selectedModel.provider === "vercel" ? "mistral" : selectedModel.provider;
  const activeDisplayName =
    selectedModel.provider === "vercel"
      ? defaultModelByProvider.mistral
      : selectedModel.displayName;

  const availableModels = getModelsForProvider(activeProvider).filter(
    model => model !== "fugu-cyber"
  );
  const currentMeta = providerMetadata[activeProvider];

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
      case "cohere": {
        const displayName = defaultModelByProvider.cohere;
        updateProvider("cohere");
        updateModel(
          displayName,
          getModelIdByDisplayName("cohere", displayName)
        );
        break;
      }
      case "sakana": {
        const displayName = defaultModelByProvider.sakana;
        updateProvider("sakana");
        updateModel(
          displayName,
          getModelIdByDisplayName("sakana", displayName)
        );
        break;
      }
      case "alibaba": {
        const displayName = defaultModelByProvider.alibaba;
        updateProvider("alibaba");
        updateModel(
          displayName,
          getModelIdByDisplayName("alibaba", displayName)
        );
        break;
      }
      case "minimax": {
        const displayName = defaultModelByProvider.minimax;
        updateProvider("minimax");
        updateModel(
          displayName,
          getModelIdByDisplayName("minimax", displayName)
        );
        break;
      }
      case "mistral": {
        const displayName = defaultModelByProvider.mistral;
        updateProvider("mistral");
        updateModel(
          displayName,
          getModelIdByDisplayName("mistral", displayName)
        );
        break;
      }
      case "meta": {
        const displayName = defaultModelByProvider.meta;
        updateProvider("meta");
        updateModel(displayName, getModelIdByDisplayName("meta", displayName));
        break;
      }
      case "deepseek": {
        const displayName = defaultModelByProvider.deepseek;
        updateProvider("deepseek");
        updateModel(
          displayName,
          getModelIdByDisplayName("deepseek", displayName)
        );
        break;
      }
      case "moonshotai": {
        const displayName = defaultModelByProvider.moonshotai;
        updateProvider("moonshotai");
        updateModel(
          displayName,
          getModelIdByDisplayName("moonshotai", displayName)
        );
        break;
      }
      case "zai": {
        const displayName = defaultModelByProvider.zai;
        updateProvider("zai");
        updateModel(displayName, getModelIdByDisplayName("zai", displayName));
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
    const prov = activeProvider;
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
      case "mistral": {
        const dn = name as MistralDisplayNameUnion;
        updateModel(dn, getModelIdByDisplayName("mistral", dn));
        break;
      }
      case "meta": {
        const dn = name as MetaDisplayNameUnion;
        updateModel(dn, getModelIdByDisplayName("meta", dn));
        break;
      }
      case "cohere": {
        const dn = name as CohereDisplayNameUnion;
        updateModel(dn, getModelIdByDisplayName("cohere", dn));
        break;
      }
      case "alibaba": {
        const dn = name as AlibabaDisplayNameUnion;
        updateModel(dn, getModelIdByDisplayName("alibaba", dn));
        break;
      }
      case "minimax": {
        const dn = name as MiniMaxDisplayNameUnion;
        updateModel(dn, getModelIdByDisplayName("minimax", dn));
        break;
      }
      case "moonshotai": {
        const dn = name as KimiDisplayNameUnion;
        updateModel(dn, getModelIdByDisplayName("moonshotai", dn));
        break;
      }
      case "deepseek": {
        const dn = name as DeepSeekDisplayNameUnion;
        updateModel(dn, getModelIdByDisplayName("deepseek", dn));
        break;
      }
      case "sakana": {
        const dn = name as SakanaDisplayNameUnion;
        updateModel(dn, getModelIdByDisplayName("sakana", dn));
        break;
      }
      case "zai": {
        const dn = name as ZaiDisplayNameUnion;
        updateModel(dn, getModelIdByDisplayName("zai", dn));
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
          value={activeProvider}
          onValueChange={v => handleProviderChange(v as Provider)}>
          <SelectTrigger className="bg-brand-component border-brand-border w-35">
            <div className="flex items-center">
              {React.createElement(currentMeta.icon, {
                className: "mr-2 size-4"
              })}
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-brand-component border-brand-border">
            {visibleProviders.map(prov => {
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

        <Select value={activeDisplayName} onValueChange={handleModelChange}>
          <SelectTrigger className="bg-brand-component border-brand-border w-48">
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
        "text-brand-text hover:bg-brand-component max-w-full min-w-0 px-3 text-sm sm:text-base",
        className
      )}>
      <currentMeta.icon className="mr-2 size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 overflow-x-hidden">
        <span className="max-w-[10ch] truncate sm:max-w-[16ch] lg:max-w-[20ch]">
          {activeDisplayName}
        </span>
      </div>
      <ChevronDown className="ml-1 size-4" />
    </Button>
  );
}

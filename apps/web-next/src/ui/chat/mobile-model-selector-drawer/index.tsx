"use client";

import { useEffect, useMemo, useState } from "react";
import { useModelSelection } from "@/context/model-selection-context";
import { defaultModelByProvider, providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle
} from "@/ui/atoms/drawer";
import { ModelUI } from "@/ui/chat/mobile-model-selector-drawer/model-badges";
import type { Provider } from "@slipstream/types";
import {
  displayNameToModelId,
  getDisplayNamesForProvider
} from "@slipstream/types";
import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@slipstream/ui";

const cxStyles = {
  default: `focus:ring-brand-primary/50 h-auto w-full justify-between p-4 text-left transition-all focus:ring-2 focus:ring-offset-0 active:scale-[0.98]`,
  isSelected: "bg-brand-primary text-brand-primary-foreground shadow-md",
  isNotSelected:
    "bg-brand-sidebar border-brand-border hover:bg-brand-primary/10 hover:border-brand-primary/30 text-brand-text active:bg-brand-primary/20"
} as const;

export function MobileModelSelectorDrawer() {
  const {
    selectedModel,
    isDrawerOpen,
    providers,
    closeDrawer,
    handleModelSelect
  } = useModelSelection();

  // local draft state so we don’t overwrite context until commit
  const [draftProvider, setDraftProvider] = useState<Provider | null>(null);

  const visibleProviders = useMemo(
    () =>
      providers.filter(provider => provider !== "vercel") satisfies Exclude<
        Provider,
        "vercel"
      >[],
    [providers]
  );

  const activeSelectedProvider =
    selectedModel.provider === "vercel" ? "mistral" : selectedModel.provider;
  const activeSelectedDisplayName =
    selectedModel.provider === "vercel"
      ? defaultModelByProvider.mistral
      : selectedModel.displayName;
  const activeDraftProvider =
    draftProvider == null || draftProvider === "vercel"
      ? activeSelectedProvider
      : draftProvider;

  useEffect(() => {
    if (selectedModel.provider === "vercel") {
      handleModelSelect("mistral", defaultModelByProvider.mistral);
    }
  }, [handleModelSelect, selectedModel.provider]);

  return (
    <Drawer
      open={isDrawerOpen}
      onOpenChange={open => {
        if (!open) {
          setDraftProvider(null);
          closeDrawer();
        }
      }}>
      <DrawerContent className="bg-brand-component border-brand-border text-brand-text flex h-[85vh] flex-col">
        <div className="mx-auto flex h-full w-full max-w-2xl flex-col overflow-hidden">
          <DrawerHeader className="sr-only">
            <DrawerTitle className="text-brand-text-emphasis text-xl">
              Select AI Model
            </DrawerTitle>
            <DrawerDescription className="text-brand-text-muted text-sm">
              Choose your AI provider and model for this conversation.
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-hidden px-4">
            <Tabs
              value={activeDraftProvider}
              onValueChange={prov => setDraftProvider(prov as Provider)}
              className="flex h-full flex-col">
              <TabsList className="bg-brand-sidebar border-brand-border mb-3 grid h-auto w-full shrink-0 grid-cols-14 gap-y-0.5 border">
                {visibleProviders.map(provider => {
                  const Icon = providerMetadata[provider].icon;
                  return (
                    <TabsTrigger
                      key={provider}
                      value={provider}
                      className="data-[state=active]:bg-brand-primary data-[state=active]:text-brand-primary-foreground col-span-2 flex h-10 items-center justify-center gap-2 text-xs nth-8:col-start-2 sm:text-sm">
                      <Icon className="size-4 shrink-0" />
                      <span className="sr-only sm:not-sr-only sm:inline">
                        {providerMetadata[provider].name.split(" ")[0]}
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {visibleProviders.map(provider => {
                const {
                  description,
                  icon: Icon,
                  name
                } = providerMetadata[provider];
                return (
                  <TabsContent
                    key={name}
                    value={provider}
                    className="flex-1 overflow-x-hidden">
                    <div className="bg-brand-sidebar/50 border-brand-border/50 mb-6 rounded-lg border p-4">
                      <div className="mb-2 flex items-center gap-3">
                        <Icon className="size-6 shrink-0" />
                        <h3 className="text-brand-text-emphasis text-base font-semibold sm:text-lg">
                          {name}
                        </h3>
                      </div>
                      <p className="text-brand-text-muted text-sm leading-relaxed">
                        {description}
                      </p>
                    </div>
                    <div className="-mr-2 flex-1 overflow-y-auto pr-2">
                      <div className="space-y-3 pb-6">
                        {provider === "anthropic" ? (
                          getDisplayNamesForProvider(provider).map(model => {
                            const isSelected =
                              activeSelectedProvider === provider &&
                              activeSelectedDisplayName === model;
                            return (
                              <Button
                                key={displayNameToModelId[provider][model]}
                                variant={isSelected ? "default" : "outline"}
                                className={cn(
                                  cxStyles.default,
                                  isSelected
                                    ? cxStyles.isSelected
                                    : cxStyles.isNotSelected
                                )}
                                onClick={() => {
                                  setDraftProvider(provider);
                                  handleModelSelect(provider, model);
                                }}>
                                <ModelUI
                                  model={model}
                                  provider={provider}
                                  isSelected={isSelected}
                                />
                              </Button>
                            );
                          })
                        ) : provider === "meta" ? (
                          getDisplayNamesForProvider(provider).map(model => {
                            const isSelected =
                              activeSelectedProvider === provider &&
                              activeSelectedDisplayName === model;
                            return (
                              <Button
                                key={displayNameToModelId[provider][model]}
                                variant={isSelected ? "default" : "outline"}
                                className={cn(
                                  cxStyles.default,
                                  isSelected
                                    ? cxStyles.isSelected
                                    : cxStyles.isNotSelected
                                )}
                                onClick={() => {
                                  setDraftProvider(provider);
                                  handleModelSelect(provider, model);
                                }}>
                                <ModelUI
                                  model={model}
                                  provider={provider}
                                  isSelected={isSelected}
                                />
                              </Button>
                            );
                          })
                        ) : provider === "deepseek" ? (
                          getDisplayNamesForProvider(provider).map(model => {
                            const isSelected =
                              activeSelectedProvider === provider &&
                              activeSelectedDisplayName === model;
                            return (
                              <Button
                                key={displayNameToModelId[provider][model]}
                                variant={isSelected ? "default" : "outline"}
                                className={cn(
                                  cxStyles.default,
                                  isSelected
                                    ? cxStyles.isSelected
                                    : cxStyles.isNotSelected
                                )}
                                onClick={() => {
                                  setDraftProvider(provider);
                                  handleModelSelect(provider, model);
                                }}>
                                <ModelUI
                                  model={model}
                                  provider={provider}
                                  isSelected={isSelected}
                                />
                              </Button>
                            );
                          })
                        ) : provider === "sakana" ? (
                          getDisplayNamesForProvider(provider)
                            .filter(model => model !== "Fugu Cyber")
                            .map(model => {
                              const isSelected =
                                activeSelectedProvider === provider &&
                                activeSelectedDisplayName === model;
                              return (
                                <Button
                                  key={displayNameToModelId[provider][model]}
                                  variant={isSelected ? "default" : "outline"}
                                  className={cn(
                                    cxStyles.default,
                                    isSelected
                                      ? cxStyles.isSelected
                                      : cxStyles.isNotSelected
                                  )}
                                  onClick={() => {
                                    setDraftProvider(provider);
                                    handleModelSelect(provider, model);
                                  }}>
                                  <ModelUI
                                    model={model}
                                    provider={provider}
                                    isSelected={isSelected}
                                  />
                                </Button>
                              );
                            })
                        ) : provider === "alibaba" ? (
                          getDisplayNamesForProvider(provider).map(model => {
                            const isSelected =
                              activeSelectedProvider === provider &&
                              activeSelectedDisplayName === model;
                            return (
                              <Button
                                key={displayNameToModelId[provider][model]}
                                variant={isSelected ? "default" : "outline"}
                                className={cn(
                                  cxStyles.default,
                                  isSelected
                                    ? cxStyles.isSelected
                                    : cxStyles.isNotSelected
                                )}
                                onClick={() => {
                                  setDraftProvider(provider);
                                  handleModelSelect(provider, model);
                                }}>
                                <ModelUI
                                  model={model}
                                  provider={provider}
                                  isSelected={isSelected}
                                />
                              </Button>
                            );
                          })
                        ) : provider === "minimax" ? (
                          getDisplayNamesForProvider(provider).map(model => {
                            const isSelected =
                              activeSelectedProvider === provider &&
                              activeSelectedDisplayName === model;
                            return (
                              <Button
                                key={displayNameToModelId[provider][model]}
                                variant={isSelected ? "default" : "outline"}
                                className={cn(
                                  cxStyles.default,
                                  isSelected
                                    ? cxStyles.isSelected
                                    : cxStyles.isNotSelected
                                )}
                                onClick={() => {
                                  setDraftProvider(provider);
                                  handleModelSelect(provider, model);
                                }}>
                                <ModelUI
                                  model={model}
                                  provider={provider}
                                  isSelected={isSelected}
                                />
                              </Button>
                            );
                          })
                        ) : provider === "moonshotai" ? (
                          getDisplayNamesForProvider(provider).map(model => {
                            const isSelected =
                              activeSelectedProvider === provider &&
                              activeSelectedDisplayName === model;
                            return (
                              <Button
                                key={displayNameToModelId[provider][model]}
                                variant={isSelected ? "default" : "outline"}
                                className={cn(
                                  cxStyles.default,
                                  isSelected
                                    ? cxStyles.isSelected
                                    : cxStyles.isNotSelected
                                )}
                                onClick={() => {
                                  setDraftProvider(provider);
                                  handleModelSelect(provider, model);
                                }}>
                                <ModelUI
                                  model={model}
                                  provider={provider}
                                  isSelected={isSelected}
                                />
                              </Button>
                            );
                          })
                        ) : provider === "zai" ? (
                          getDisplayNamesForProvider(provider).map(model => {
                            const isSelected =
                              activeSelectedProvider === provider &&
                              activeSelectedDisplayName === model;
                            return (
                              <Button
                                key={displayNameToModelId[provider][model]}
                                variant={isSelected ? "default" : "outline"}
                                className={cn(
                                  cxStyles.default,
                                  isSelected
                                    ? cxStyles.isSelected
                                    : cxStyles.isNotSelected
                                )}
                                onClick={() => {
                                  setDraftProvider(provider);
                                  handleModelSelect(provider, model);
                                }}>
                                <ModelUI
                                  model={model}
                                  provider={provider}
                                  isSelected={isSelected}
                                />
                              </Button>
                            );
                          })
                        ) : provider === "mistral" ? (
                          getDisplayNamesForProvider(provider).map(model => {
                            const isSelected =
                              activeSelectedProvider === provider &&
                              activeSelectedDisplayName === model;
                            return (
                              <Button
                                key={displayNameToModelId[provider][model]}
                                variant={isSelected ? "default" : "outline"}
                                className={cn(
                                  cxStyles.default,
                                  isSelected
                                    ? cxStyles.isSelected
                                    : cxStyles.isNotSelected
                                )}
                                onClick={() => {
                                  setDraftProvider(provider);
                                  handleModelSelect(provider, model);
                                }}>
                                <ModelUI
                                  model={model}
                                  provider={provider}
                                  isSelected={isSelected}
                                />
                              </Button>
                            );
                          })
                        ) : provider === "cohere" ? (
                          getDisplayNamesForProvider(provider).map(model => {
                            const isSelected =
                              activeSelectedProvider === provider &&
                              activeSelectedDisplayName === model;
                            return (
                              <Button
                                key={displayNameToModelId[provider][model]}
                                variant={isSelected ? "default" : "outline"}
                                className={cn(
                                  cxStyles.default,
                                  isSelected
                                    ? cxStyles.isSelected
                                    : cxStyles.isNotSelected
                                )}
                                onClick={() => {
                                  setDraftProvider(provider);
                                  handleModelSelect(provider, model);
                                }}>
                                <ModelUI
                                  model={model}
                                  provider={provider}
                                  isSelected={isSelected}
                                />
                              </Button>
                            );
                          })
                        ) : provider === "gemini" ? (
                          getDisplayNamesForProvider(provider).map(model => {
                            const isSelected =
                              activeSelectedProvider === provider &&
                              activeSelectedDisplayName === model;
                            return (
                              <Button
                                key={displayNameToModelId[provider][model]}
                                variant={isSelected ? "default" : "outline"}
                                className={cn(
                                  cxStyles.default,
                                  isSelected
                                    ? cxStyles.isSelected
                                    : cxStyles.isNotSelected
                                )}
                                onClick={() => {
                                  setDraftProvider(provider);
                                  handleModelSelect(provider, model);
                                }}>
                                <ModelUI
                                  model={model}
                                  provider={provider}
                                  isSelected={isSelected}
                                />
                              </Button>
                            );
                          })
                        ) : provider === "grok" ? (
                          getDisplayNamesForProvider(provider).map(model => {
                            const isSelected =
                              activeSelectedProvider === provider &&
                              activeSelectedDisplayName === model;
                            return (
                              <Button
                                key={displayNameToModelId[provider][model]}
                                variant={isSelected ? "default" : "outline"}
                                className={cn(
                                  cxStyles.default,
                                  isSelected
                                    ? cxStyles.isSelected
                                    : cxStyles.isNotSelected
                                )}
                                onClick={() => {
                                  setDraftProvider(provider);
                                  handleModelSelect(provider, model);
                                }}>
                                <ModelUI
                                  model={model}
                                  provider={provider}
                                  isSelected={isSelected}
                                />
                              </Button>
                            );
                          })
                        ) : provider === "openai" ? (
                          getDisplayNamesForProvider(provider).map(model => {
                            const isSelected =
                              activeSelectedProvider === provider &&
                              activeSelectedDisplayName === model;
                            return (
                              <Button
                                key={displayNameToModelId[provider][model]}
                                variant={isSelected ? "default" : "outline"}
                                className={cn(
                                  cxStyles.default,
                                  isSelected
                                    ? cxStyles.isSelected
                                    : cxStyles.isNotSelected
                                )}
                                onClick={() => {
                                  setDraftProvider(provider);
                                  handleModelSelect(provider, model);
                                }}>
                                <ModelUI
                                  model={model}
                                  provider={provider}
                                  isSelected={isSelected}
                                />
                              </Button>
                            );
                          })
                        ) : (
                          <></>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>
          <DrawerFooter className="shrink-0 pt-4">
            <DrawerClose asChild>
              <Button
                variant="outline"
                className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text h-12">
                Cancel
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import useEmblaCarousel from "embla-carousel-react";
import type { Provider } from "@slipstream/types";
import {
  displayNameToModelId,
  getDisplayNamesForProvider
} from "@slipstream/types";
import { Button } from "@slipstream/ui";

const cxStyles = {
  default: `focus:ring-brand-primary/50 h-auto w-full justify-between p-4 text-left transition-all focus:ring-2 focus:ring-offset-0 active:scale-[0.98]`,
  isSelected: "bg-brand-primary text-brand-primary-foreground shadow-md",
  isNotSelected:
    "bg-brand-sidebar border-brand-border hover:bg-brand-primary/10 hover:border-brand-primary/30 text-brand-text active:bg-brand-primary/20"
} as const;

function isActiveProvider(p: string) {
  return (
    p === "gemini" ||
    p === "grok" ||
    p === "anthropic" ||
    p === "openai" ||
    p === "cohere" ||
    p === "mistral" ||
    p === "deepseek" ||
    p === "moonshotai" ||
    p === "zai"
  );
}

export function MobileModelSelectorDrawer() {
  const {
    selectedModel,
    isDrawerOpen,
    providers,
    closeDrawer,
    handleModelSelect
  } = useModelSelection();
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    containScroll: "trimSnaps",loop: true,
    dragFree: true
  });

  const [draftProvider, setDraftProvider] = useState<Provider | null>(null);

  const visibleProviders = useMemo(
    () =>
      providers.filter(
        provider => provider !== "vercel" && provider !== "meta"
      ) satisfies Exclude<Provider, "vercel" | "meta">[],
    [providers]
  );

  const activeSelectedProvider =
    selectedModel.provider === "vercel"
      ? "mistral"
      : selectedModel.provider === "meta"
        ? "mistral"
        : selectedModel.provider;
  const activeSelectedDisplayName =
    selectedModel.provider === "vercel" || selectedModel.provider === "meta"
      ? defaultModelByProvider.mistral
      : selectedModel.displayName;
  const activeDraftProvider =
    draftProvider == null ||
    draftProvider === "vercel" ||
    draftProvider === "meta"
      ? activeSelectedProvider
      : draftProvider;

  useEffect(() => {
    if (selectedModel.provider === "vercel") {
      handleModelSelect("mistral", defaultModelByProvider.mistral);
    }
  }, [handleModelSelect, selectedModel.provider]);

  const scrollToProvider = useCallback(
    (provider: Provider) => {
      if (emblaApi && isActiveProvider(provider)) {
        const index = visibleProviders.indexOf(provider);
        if (index !== -1) {
          emblaApi.scrollTo(index);
        }
      }
    },
    [emblaApi, visibleProviders]
  );

  // Scroll to active provider when drawer opens
  useEffect(() => {
    if (isDrawerOpen && emblaApi) {
      const index = visibleProviders.indexOf(activeDraftProvider);
      if (index !== -1) {
        // Small delay to ensure carousel is ready
        requestAnimationFrame(() => {
          emblaApi.scrollTo(index);
        });
      }
    }
  }, [isDrawerOpen, emblaApi, activeDraftProvider, visibleProviders]);

  const handleProviderChange = (provider: string) => {
    if (isActiveProvider(provider)) {
      setDraftProvider(provider);
      scrollToProvider(provider);
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      const updateFadeWidth = () => {
        const fadeWidth = window.innerWidth < 640 ? "5%" : "10%";
        container.style.setProperty("--fade-width", fadeWidth);
      };
      updateFadeWidth();
      window.addEventListener("resize", updateFadeWidth);
      return () => window.removeEventListener("resize", updateFadeWidth);
    }
  }, []);
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
          <DrawerHeader className="shrink-0 pb-4">
            <DrawerTitle className="text-brand-text-emphasis text-xl">
              Select AI Model
            </DrawerTitle>
            <DrawerDescription className="text-brand-text-muted text-sm">
              Choose your AI provider and model for this conversation.
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-hidden px-4">
            {/* Embla Carousel for Provider Icons */}
            <div className="relative mb-6 shrink-0" ref={containerRef}>
              {/* Fade indicators */}
              <div className="from-brand-component pointer-events-none absolute top-0 right-0 z-10 h-full w-8 bg-linear-to-l to-transparent" />
              <div className="from-brand-component pointer-events-none absolute top-0 left-0 z-10 h-full w-8 bg-linear-to-r to-transparent" />

              <div
                className="embla bg-brand-sidebar border-brand-border overflow-hidden rounded-lg border"
                ref={emblaRef}>
                <div className="embla__container flex h-12 items-center gap-1 px-2">
                  {visibleProviders.map(provider => {
                    const Icon = providerMetadata[provider].icon;
                    const isActive = activeDraftProvider === provider;
                    return (
                      <div key={provider} className="embla__slide min-w-0">
                        <button
                          type="button"
                          onClick={() => handleProviderChange(provider)}
                          className={cn(
                            "flex h-9 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-xs transition-all sm:px-4 sm:text-sm",
                            isActive
                              ? "bg-brand-primary text-brand-primary-foreground"
                              : "text-brand-text hover:bg-brand-primary/10"
                          )}>
                          <Icon className="size-4 shrink-0" />
                          <span className="sr-only sm:not-sr-only sm:inline">
                            {providerMetadata[provider].name.split(" ")[0]}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {visibleProviders.map(provider => {
              if (provider !== activeDraftProvider) return null;
              const {
                description,
                icon: Icon,
                name
              } = providerMetadata[provider];
              return (
                <div
                  key={name}
                  className="flex-1 overflow-x-hidden outline-none">
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
                </div>
              );
            })}
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

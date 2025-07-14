"use client";


import {
  getModelsForProvider,
  ModelSelection,
  providerMetadata
} from "@/lib/models";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle
} from "@/ui/atoms/drawer";
import {
  displayNameToModelId,
  getModelIdByDisplayName,
  Provider
} from "@t3-chat-clone/types/models";
import {
  Badge,
  Button,
  Check,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@t3-chat-clone/ui";

type AvailableModelsByProvider<
  T extends "grok" | "openai" | "gemini" | "anthropic"
> = keyof (typeof displayNameToModelId)[T];

export type GrokModels = AvailableModelsByProvider<"grok">;

export type OpenAiModels = AvailableModelsByProvider<"openai">;

export type GeminiModelDispayNames = AvailableModelsByProvider<"gemini">;

export type AnthropicModelDisplayNames = AvailableModelsByProvider<"anthropic">;

interface MobileModelSelectorDrawerProps {
  isOpen: boolean;
  onOpenChangeAction: (isOpen: boolean) => void;
  selectedModel: ModelSelection;
  onSelectModelAction: (model: ModelSelection) => void;
}


export function MobileModelSelectorDrawer({
  isOpen,
  onOpenChangeAction,
  selectedModel,
  onSelectModelAction
}: MobileModelSelectorDrawerProps) {
  const handleModelSelect = <const V extends Provider>(
    provider: V,
    displayName: keyof (typeof displayNameToModelId)[V]
  ) => {
    const newModelSelection = {
      provider,
      displayName,
      modelId: getModelIdByDisplayName(provider, displayName)
    };
    onSelectModelAction(newModelSelection as ModelSelection);
    onOpenChangeAction(false);
  };

  return (
    <Drawer open={isOpen} onOpenChange={onOpenChangeAction}>
      <DrawerContent className="bg-brand-component border-brand-border text-brand-text flex h-[85vh] flex-col">
        <div className="mx-auto flex h-full w-full max-w-lg flex-col overflow-hidden">
          <DrawerHeader className="flex-shrink-0 pb-4">
            <DrawerTitle className="text-brand-text-emphasis text-xl">
              Select AI Model
            </DrawerTitle>
            <DrawerDescription className="text-brand-text-muted text-sm">
              Choose your AI provider and model for this conversation.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 overflow-hidden px-4">
            <Tabs
              defaultValue={selectedModel.provider}
              className="flex h-full flex-col">
              {/* Provider Tabs - More spacious */}
              <TabsList className="bg-brand-sidebar border-brand-border mb-6 grid h-12 w-full flex-shrink-0 grid-cols-2 border sm:grid-cols-4">
                {(["anthropic", "gemini", "grok", "openai"] as const).map(
                  provider => {
                    const Icon = providerMetadata[provider].icon;
                    return (
                      <TabsTrigger
                        key={provider}
                        value={provider}
                        className="data-[state=active]:bg-brand-primary data-[state=active]:text-brand-primaryForeground flex h-full items-center justify-center gap-2 text-xs sm:text-sm">
                        <Icon className="size-4 shrink-0" />
                        <span className="sr-only sm:not-sr-only sm:inline">
                          {providerMetadata[provider].name.split(" ")[0]}
                        </span>
                      </TabsTrigger>
                    );
                  }
                )}
              </TabsList>

              {(["anthropic", "gemini", "grok", "openai"] as const).map(
                provider => {
                  const Icon = providerMetadata[provider].icon;
                  return (
                    <TabsContent
                      key={provider}
                      value={provider}
                      className="flex-1 overflow-x-hidden">
                      {/* Provider Info - Cleaner layout */}
                      <div className="bg-brand-sidebar/50 border-brand-border/50 mb-6 rounded-lg border p-4">
                        <div className="mb-2 flex items-center gap-3">
                          <Icon className="size-6 shrink-0" />
                          <h3 className="text-brand-text-emphasis text-lg font-semibold">
                            {providerMetadata[provider].name}
                          </h3>
                        </div>
                        <p className="text-brand-text-muted text-sm leading-relaxed">
                          {providerMetadata[provider].description}
                        </p>
                      </div>

                      {/* Models List - Full height scrolling */}
                      <div className="-mr-2 flex-1 overflow-y-auto pr-2">
                        <div className="space-y-3 pb-6">
                          {provider === "anthropic" ? (
                            getModelsForProvider(provider).map(model => {
                              const isSelected =
                                selectedModel.provider === provider &&
                                selectedModel.displayName === model;
                              return (
                                <Button
                                  key={model}
                                  variant={isSelected ? "default" : "outline"}
                                  className={`focus:ring-brand-primary/50 h-auto w-full justify-between px-4 py-4 text-left transition-all focus:ring-2 focus:ring-offset-0 active:scale-[0.98] ${
                                    isSelected
                                      ? "bg-brand-primary text-brand-primaryForeground shadow-md"
                                      : "bg-brand-sidebar border-brand-border hover:bg-brand-primary/10 hover:border-brand-primary/30 text-brand-text active:bg-brand-primary/20"
                                  }`}
                                  onClick={() =>
                                    handleModelSelect(
                                      provider,
                                      model as AnthropicModelDisplayNames
                                    )
                                  }>
                                  <div className="flex w-full items-center justify-between">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-base font-medium">
                                        {model}
                                      </span>
                                      {/* Inline badges */}
                                      {model.includes("Preview") && (
                                        <Badge
                                          variant="secondary"
                                          className="h-5 px-1.5 py-0.5 text-xs">
                                          Preview
                                        </Badge>
                                      )}
                                      {model.includes("Mini") && (
                                        <Badge
                                          variant="outline"
                                          className="h-5 px-1.5 py-0.5 text-xs">
                                          Compact
                                        </Badge>
                                      )}
                                      {model.includes("Vision") && (
                                        <Badge
                                          variant="outline"
                                          className="h-5 px-1.5 py-0.5 text-xs">
                                          Vision
                                        </Badge>
                                      )}
                                    </div>
                                    {isSelected && (
                                      <Check className="text-brand-primaryForeground ml-3 h-5 w-5 flex-shrink-0" />
                                    )}
                                  </div>
                                </Button>
                              );
                            })
                          ) : provider === "gemini" ? (
                            getModelsForProvider(provider).map(model => {
                              const isSelected =
                                selectedModel.provider === provider &&
                                selectedModel.displayName === model;
                              return (
                                <Button
                                  key={model}
                                  variant={isSelected ? "default" : "outline"}
                                  className={`focus:ring-brand-primary/50 h-auto w-full justify-between px-4 py-4 text-left transition-all focus:ring-2 focus:ring-offset-0 active:scale-[0.98] ${
                                    isSelected
                                      ? "bg-brand-primary text-brand-primaryForeground shadow-md"
                                      : "bg-brand-sidebar border-brand-border hover:bg-brand-primary/10 hover:border-brand-primary/30 text-brand-text active:bg-brand-primary/20"
                                  }`}
                                  onClick={() =>
                                    handleModelSelect(
                                      provider,
                                      model as GeminiModelDispayNames
                                    )
                                  }>
                                  <div className="flex w-full items-center justify-between">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-base font-medium">
                                        {model}
                                      </span>
                                      {/* Inline badges */}
                                      {model.includes("Preview") && (
                                        <Badge
                                          variant="secondary"
                                          className="h-5 px-1.5 py-0.5 text-xs">
                                          Preview
                                        </Badge>
                                      )}
                                      {model.includes("Mini") && (
                                        <Badge
                                          variant="outline"
                                          className="h-5 px-1.5 py-0.5 text-xs">
                                          Compact
                                        </Badge>
                                      )}
                                      {model.includes("Vision") && (
                                        <Badge
                                          variant="outline"
                                          className="h-5 px-1.5 py-0.5 text-xs">
                                          Vision
                                        </Badge>
                                      )}
                                    </div>
                                    {isSelected && (
                                      <Check className="text-brand-primaryForeground ml-3 h-5 w-5 flex-shrink-0" />
                                    )}
                                  </div>
                                </Button>
                              );
                            })
                          ) : provider === "grok" ? (
                            getModelsForProvider(provider).map(model => {
                              const isSelected =
                                selectedModel.provider === provider &&
                                selectedModel.displayName === model;
                              return (
                                <Button
                                  key={model}
                                  variant={isSelected ? "default" : "outline"}
                                  className={`focus:ring-brand-primary/50 h-auto w-full justify-between px-4 py-4 text-left transition-all focus:ring-2 focus:ring-offset-0 active:scale-[0.98] ${
                                    isSelected
                                      ? "bg-brand-primary text-brand-primaryForeground shadow-md"
                                      : "bg-brand-sidebar border-brand-border hover:bg-brand-primary/10 hover:border-brand-primary/30 text-brand-text active:bg-brand-primary/20"
                                  }`}
                                  onClick={() =>
                                    handleModelSelect(
                                      provider,
                                      model as GrokModels
                                    )
                                  }>
                                  <div className="flex w-full items-center justify-between">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-base font-medium">
                                        {model}
                                      </span>
                                      {/* Inline badges */}
                                      {model.includes("Preview") && (
                                        <Badge
                                          variant="secondary"
                                          className="h-5 px-1.5 py-0.5 text-xs">
                                          Preview
                                        </Badge>
                                      )}
                                      {model.includes("Mini") && (
                                        <Badge
                                          variant="outline"
                                          className="h-5 px-1.5 py-0.5 text-xs">
                                          Compact
                                        </Badge>
                                      )}
                                      {model.includes("Vision") && (
                                        <Badge
                                          variant="outline"
                                          className="h-5 px-1.5 py-0.5 text-xs">
                                          Vision
                                        </Badge>
                                      )}
                                    </div>
                                    {isSelected && (
                                      <Check className="text-brand-primaryForeground ml-3 h-5 w-5 flex-shrink-0" />
                                    )}
                                  </div>
                                </Button>
                              );
                            })
                          ) : provider === "openai" ? (
                            getModelsForProvider(provider).map(model => {
                              const isSelected =
                                selectedModel.provider === provider &&
                                selectedModel.displayName === model;
                              return (
                                <Button
                                  key={model}
                                  variant={isSelected ? "default" : "outline"}
                                  className={`focus:ring-brand-primary/50 h-auto w-full justify-between px-4 py-4 text-left transition-all focus:ring-2 focus:ring-offset-0 active:scale-[0.98] ${
                                    isSelected
                                      ? "bg-brand-primary text-brand-primaryForeground shadow-md"
                                      : "bg-brand-sidebar border-brand-border hover:bg-brand-primary/10 hover:border-brand-primary/30 text-brand-text active:bg-brand-primary/20"
                                  }`}
                                  onClick={() =>
                                    handleModelSelect(
                                      provider,
                                      model as OpenAiModels
                                    )
                                  }>
                                  <div className="flex w-full items-center justify-between">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-base font-medium">
                                        {model}
                                      </span>
                                      {/* Inline badges */}
                                      {model.includes("Preview") && (
                                        <Badge
                                          variant="secondary"
                                          className="h-5 px-1.5 py-0.5 text-xs">
                                          Preview
                                        </Badge>
                                      )}
                                      {model.includes("Mini") && (
                                        <Badge
                                          variant="outline"
                                          className="h-5 px-1.5 py-0.5 text-xs">
                                          Compact
                                        </Badge>
                                      )}
                                      {model.includes("Vision") && (
                                        <Badge
                                          variant="outline"
                                          className="h-5 px-1.5 py-0.5 text-xs">
                                          Vision
                                        </Badge>
                                      )}
                                    </div>
                                    {isSelected && (
                                      <Check className="text-brand-primaryForeground ml-3 h-5 w-5 flex-shrink-0" />
                                    )}
                                  </div>
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
                }
              )}
            </Tabs>
          </div>
          <DrawerFooter className="flex-shrink-0 pt-4">
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

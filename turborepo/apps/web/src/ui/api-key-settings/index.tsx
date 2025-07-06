"use client";

import type { Providers as Provider } from "@/types/chat-ws";
import type {
  ComponentPropsWithRef,
  JSX,
  FormEvent as ReactFormEvent
} from "react";
import { useState } from "react";
import { getDecryptedApiKeyOnEdit, upsertApiKey } from "@/app/actions/api-key";
import { cn } from "@/lib/utils";
import { BreakoutWrapper } from "@/ui/atoms/breakout-wrapper";
import { AnthropicIcon } from "@/ui/icons/anthropic";
import { GeminiIcon } from "@/ui/icons/gemini";
import { OpenAiIcon } from "@/ui/icons/openai";
import { XAiIcon } from "@/ui/icons/x-ai";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CirclePlus,
  Eye,
  EyeOff,
  Input,
  Label,
  LoaderPinwheel,
  Save,
  SquarePen,
  Switch,
  Trash,
  X
} from "@t3-chat-clone/ui";

interface ApiKeysTabProps {
  className?: string;
}

interface ApiKeyData {
  provider: Provider;
  text: string;
  icon: ({
    ...svg
  }: Omit<
    ComponentPropsWithRef<"svg">,
    "viewBox" | "fill" | "xmlns" | "role"
  >) => JSX.Element;
  value?: string;
  isSet?: boolean;
  isDefault?: boolean;
}

const providerObj = [
  {
    provider: "anthropic",
    text: "Anthropic",
    icon: AnthropicIcon,
    value: "sk-ant-*******************************************",
    isSet: true,
    isDefault: false
  },
  {
    provider: "gemini",
    text: "Gemini",
    icon: GeminiIcon,
    value: "AIza********************",
    isSet: false,
    isDefault: false
  },
  {
    provider: "grok",
    text: "Grok",
    icon: XAiIcon,
    value: "xai-*******************************************",
    isSet: true,
    isDefault: false
  },
  {
    provider: "openai",
    text: "OpenAI",
    icon: OpenAiIcon,
    value: "sk-************************************************",
    isSet: true,
    isDefault: true
  }
] satisfies ApiKeyData[];

const CARD_HEADER_TEXT =
  "Bring your own API keys for expanded model support. This allows for substantially higher usage limits and access to premium models.";
const CARD_FOOTER_TEXT =
  "API keys are encrypted at rest and are only used to communicate with respective model providers in secure server contexts.";

export function ApiKeysTab({ className = "" }: ApiKeysTabProps) {
  // State for managing API keys
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([]);
  const [editingKey, setEditingKey] = useState<Provider | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<Provider>>(new Set());
  const [tempValues, setTempValues] = useState<Record<Provider, string>>({
    anthropic: "",
    gemini: "",
    grok: "",
    openai: ""
  });
  const [tempDefaults, setTempDefaults] = useState<Record<Provider, boolean>>({
    anthropic: false,
    gemini: false,
    grok: false,
    openai: false
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<Provider | null>(null);
  const [decryptingKey, setDecryptingKey] = useState<Provider | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittingKey, setSubmittingKey] = useState<Provider | null>(null);

  const toggleVisibility = (provider: Provider) => {
    const newVisible = new Set(visibleKeys);
    if (newVisible.has(provider)) {
      newVisible.delete(provider);
    } else {
      newVisible.add(provider);
    }
    setVisibleKeys(newVisible);
  };

  const startEditing = async (provider: Provider) => {
    const currentKey = apiKeys.find(key => key.provider === provider);

    setDecryptingKey(provider);
    let decryptedValue = "";

    try {
      if (currentKey?.isSet) {
        decryptedValue = await getDecryptedApiKeyOnEdit(provider);
      }
      setTempValues(prev => ({
        ...prev,
        [provider]: decryptedValue
      }));
      setTempDefaults(prev => ({
        ...prev,
        [provider]: currentKey?.isDefault ?? false
      }));
      setEditingKey(provider);
      // Hide the key by default when editing starts
      setVisibleKeys(prev => {
        const newVisible = new Set(prev);
        newVisible.delete(provider);
        return newVisible;
      });
    } catch (err) {
      console.error(`failed to decrypt ${provider} api key: `, err);
    } finally {
      setDecryptingKey(null);
    }
  };

  const cancelEditing = (provider: Provider) => {
    const currentKey = apiKeys.find(key => key.provider === provider);

    // If the provider has no key set (was just added), remove it entirely
    if (!currentKey?.isSet) {
      setApiKeys(prev => prev.filter(key => key.provider !== provider));
    }

    setEditingKey(null);
    setTempValues(prev => {
      const newTemp = { ...prev };
      delete newTemp[provider];
      return newTemp;
    });
    setTempDefaults(prev => {
      const newTemp = { ...prev };
      delete newTemp[provider];
      return newTemp;
    });
    // Hide the key when canceling edit
    setVisibleKeys(prev => {
      const newVisible = new Set(prev);
      newVisible.delete(provider);
      return newVisible;
    });
  };

  const handleFormSubmit = async (event: ReactFormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const provider = formData.get("provider") as Provider;

    setSubmittingKey(provider);
    setSubmitError(null);
    try {
      const getResult = await upsertApiKey(formData);
      if (getResult.success) {
        const apiKey = formData.get("apiKey") as string;
        const asDefault = formData.get("asDefault") === "true";

        console.log("Form Data Captured:", {
          apiKey,
          provider,
          asDefault,
          id: getResult.id
        });

        // update api keys state
        setApiKeys(prev =>
          prev.map(key => {
            if (key.provider === provider) {
              return {
                ...key,
                value: apiKey,
                isSet: apiKey.length > 0,
                isDefault: asDefault
              };
            }
            // If this key is being set as default, unset all others
            if (asDefault && key.isDefault) {
              return { ...key, isDefault: false };
            }
            return key;
          })
        );

        // Clean up editing state
        setEditingKey(null);
        setTempValues(prev => {
          const newTemp = { ...prev };
          delete newTemp[provider];
          return newTemp;
        });
        setTempDefaults(prev => {
          const newTemp = { ...prev };
          delete newTemp[provider];
          return newTemp;
        });
        // Hide the key after saving
        setVisibleKeys(prev => {
          const newVisible = new Set(prev);
          newVisible.delete(provider);
          return newVisible;
        });
      } else {
        setSubmitError("Failed to save API key. Please try again.");
      }
    } catch (error) {
      console.error("Error saving API key:", error);
      setSubmitError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmittingKey(null);
    }
  };

  const updateTempValue = (provider: Provider, value: string) => {
    setTempValues(prev => ({
      ...prev,
      [provider]: value
    }));
  };

  const updateTempDefault = (provider: Provider, isDefault: boolean) => {
    setTempDefaults(prev => ({
      ...prev,
      [provider]: isDefault
    }));
  };

  const confirmDelete = (provider: Provider) => {
    setKeyToDelete(provider);
    setDeleteConfirmOpen(true);
  };

  const deleteKey = () => {
    if (keyToDelete) {
      // Remove the provider entirely from the array
      setApiKeys(prev => prev.filter(key => key.provider !== keyToDelete));

      // Clean up any editing state for this key
      if (editingKey === keyToDelete) {
        setEditingKey(null);
      }
      setVisibleKeys(prev => {
        const newVisible = new Set(prev);
        newVisible.delete(keyToDelete);
        return newVisible;
      });
      setTempValues(prev => {
        const newTemp = { ...prev };
        delete newTemp[keyToDelete];
        return newTemp;
      });
      setTempDefaults(prev => {
        const newTemp = { ...prev };
        delete newTemp[keyToDelete];
        return newTemp;
      });
    }
    setDeleteConfirmOpen(false);
    setKeyToDelete(null);
  };

  const getDisplayValue = (keyData: ApiKeyData) => {
    if (editingKey === keyData.provider) {
      const tempValue = tempValues[keyData.provider] || "";
      // In edit mode, show actual value only if visibility is toggled ON
      if (visibleKeys.has(keyData.provider)) {
        return tempValue; // Show raw value when eye is OPEN
      } else {
        // Show masked version when eye is CLOSED
        return tempValue ? getPlaceholder(keyData.provider) : "";
      }
    }

    if (!keyData.isSet || !keyData.value) {
      return "";
    }

    // Always show masked version when not editing
    return getPlaceholder(keyData.provider);
  };

  const getPlaceholder = (provider: Provider) => {
    switch (provider) {
      case "anthropic":
        return "sk-ant-*******************************************";
      case "grok":
        return "xai-*******************************************";
      case "openai":
        return "sk-************************************************";
      default:
        return "AIza********************";
    }
  };

  const getCurrentDefault = (provider: Provider) => {
    if (editingKey === provider) {
      return tempDefaults[provider] || false;
    }
    const keyData = apiKeys.find(key => key.provider === provider);
    return keyData?.isDefault ?? false;
  };

  const getAvailableProviders = () => {
    const currentProviders = new Set(apiKeys.map(key => key.provider));
    return providerObj.filter(
      provider => !currentProviders.has(provider.provider)
    );
  };

  const addProvider = (provider: Provider) => {
    const providerData = providerObj.find(p => p.provider === provider);
    if (providerData) {
      setApiKeys(prev => [
        ...prev,
        { ...providerData, isSet: false, value: "", isDefault: false }
      ]);
      // Automatically start editing the newly added provider
      setTimeout(() => {
        startEditing(provider);
      }, 100);
    }
  };

  return (
    <BreakoutWrapper>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={cn("w-full", className)}>
        <Card className="bg-brand-component border-brand-border text-brand-text mx-auto w-full max-w-full overflow-hidden sm:mx-0">
          <CardHeader>
            <CardTitle className="text-brand-text-emphasis">BYOK</CardTitle>
            <CardDescription className="text-brand-text-muted text-xs tracking-tight sm:text-sm">
              {CARD_HEADER_TEXT}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <AnimatePresence mode="popLayout">
              {apiKeys.map(keyData => (
                <motion.div
                  key={keyData.provider}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <keyData.icon
                      aria-description={keyData.provider + ` icon`}
                      className="mr-3 size-6 flex-shrink-0"
                    />
                    <label
                      htmlFor={`${keyData.provider}-key`}
                      className="text-brand-text-muted text-sm font-medium">
                      {keyData.text}
                    </label>
                    {keyData.isSet && (
                      <div className="h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />
                    )}
                    {keyData.isDefault && (
                      <span className="flex-shrink-0 rounded-full bg-blue-500 px-2 py-1 text-xs text-white">
                        Default
                      </span>
                    )}
                  </div>

                  {editingKey === keyData.provider ? (
                    <form onSubmit={handleFormSubmit} className="space-y-4">
                      <input
                        type="hidden"
                        name="provider"
                        value={keyData.provider}
                      />
                      <input
                        type="hidden"
                        name="asDefault"
                        value={getCurrentDefault(keyData.provider).toString()}
                      />

                      <div className="flex flex-col space-y-3 lg:flex-row lg:space-y-0 lg:space-x-3">
                        <div className="relative flex-1">
                          <Input
                            name="apiKey"
                            id={`${keyData.provider}-key`}
                            type={
                              !visibleKeys.has(keyData.provider)
                                ? "password"
                                : "text"
                            }
                            inputMode="text"
                            placeholder={getPlaceholder(keyData.provider)}
                            value={getDisplayValue(keyData)}
                            onChange={e =>
                              updateTempValue(keyData.provider, e.target.value)
                            }
                            className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text pr-12"
                            required
                          />

                          <div className="absolute top-1/2 right-2 -translate-y-1/2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleVisibility(keyData.provider)}
                              className="hover:bg-brand-primary/20 h-8 w-8 p-0">
                              {visibleKeys.has(keyData.provider) ? (
                                <Eye className="h-4 w-4" />
                              ) : (
                                <EyeOff className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-3 lg:flex-col lg:space-y-3 lg:space-x-0 xl:flex-row xl:space-y-0 xl:space-x-3">
                          <Button
                            type="submit"
                            variant="outline"
                            disabled={submittingKey === keyData.provider}
                            className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text min-h-[44px] flex-1 sm:flex-none lg:flex-1 xl:flex-none">
                            {submittingKey === keyData.provider ? (
                              <LoaderPinwheel className="size-4 animate-spin rounded-full" />
                            ) : (
                              <Save className="mr-2 size-4" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => cancelEditing(keyData.provider)}
                            className="bg-brand-sidebar border-brand-border text-brand-text min-h-[44px] flex-1 hover:bg-red-500/20 sm:flex-none lg:flex-1 xl:flex-none">
                            <X className="mr-2 h-4 w-4" />
                            Cancel
                          </Button>
                        </div>
                      </div>

                      {/* Default provider toggle */}
                      <div className="flex items-center space-x-3 pl-7">
                        <Switch
                          id={`default-${keyData.provider}`}
                          checked={getCurrentDefault(keyData.provider)}
                          onCheckedChange={checked =>
                            updateTempDefault(keyData.provider, checked)
                          }
                        />
                        <Label
                          htmlFor={`default-${keyData.provider}`}
                          className="text-brand-text-muted text-sm">
                          Set as default provider
                        </Label>
                      </div>
                      {/* Error display */}
                      {submitError && editingKey === keyData.provider && (
                        <div className="pl-7 text-sm text-red-500">
                          {submitError}
                        </div>
                      )}
                    </form>
                  ) : (
                    <div className="flex flex-col space-y-3 lg:flex-row lg:space-y-0 lg:space-x-3">
                      <div className="relative flex-1">
                        <Input
                          id={`${keyData.provider}-key`}
                          type="password"
                          inputMode="text"
                          placeholder={getPlaceholder(keyData.provider)}
                          value={getDisplayValue(keyData)}
                          disabled={true}
                          className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text pr-20"
                        />

                        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center space-x-1">
                          {/* Edit button - only show when not editing and key is set */}
                          {keyData.isSet && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={decryptingKey === keyData.provider}
                              onClick={() => startEditing(keyData.provider)}
                              className="hover:bg-brand-primary/20 h-8 w-8 p-0">
                              {decryptingKey === keyData.provider ? (
                                <LoaderPinwheel className="size-4 animate-spin rounded-full" />
                              ) : (
                                <SquarePen className="size-4" />
                              )}
                            </Button>
                          )}

                          {/* Delete button - always show */}
                          <AlertDialog
                            open={
                              deleteConfirmOpen &&
                              keyToDelete === keyData.provider
                            }
                            onOpenChange={open => {
                              if (!open) {
                                setDeleteConfirmOpen(false);
                                setKeyToDelete(null);
                              }
                            }}>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => confirmDelete(keyData.provider)}
                                className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/20">
                                <Trash className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-brand-component border-brand-border mx-4 sm:mx-0">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-brand-text-emphasis">
                                  {keyData.isSet
                                    ? "Delete API Key"
                                    : "Remove Provider"}
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-brand-text-muted">
                                  {keyData.isSet
                                    ? `Are you sure you want to delete your ${keyData.text}? This action cannot be undone and you'll need to re-enter your API key to use this provider again.`
                                    : `Are you sure you want to remove ${keyData.text} from your list? You can add it back later if needed.`}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="bg-brand-sidebar border-brand-border text-brand-text hover:bg-brand-primary/20">
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={deleteKey}
                                  className="bg-red-600 text-white hover:bg-red-700">
                                  {keyData.isSet
                                    ? "Delete Key"
                                    : "Remove Provider"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      {!keyData.isSet && (
                        <div className="flex lg:flex-col lg:justify-center">
                          <Button
                            variant="outline"
                            onClick={() => startEditing(keyData.provider)}
                            disabled={decryptingKey === keyData.provider}
                            className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text min-h-[44px] w-full lg:w-auto lg:min-w-[100px]">
                            {decryptingKey === keyData.provider ? (
                              <>
                                <LoaderPinwheel className="mr-2 h-4 w-4 animate-spin rounded-full border-t-transparent" />
                              </>
                            ) : (
                              "Add Key"
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Show default status when not editing */}
                  {editingKey !== keyData.provider && keyData.isSet && (
                    <div className="flex items-center space-x-2 pl-7">
                      <div className="text-brand-text-muted text-sm">
                        {keyData.isDefault
                          ? "✓ Default provider"
                          : "Available provider"}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {getAvailableProviders().length > 0 ? (
              <div className="space-y-4">
                <div className="text-brand-text-muted text-sm font-medium">
                  Add Provider:
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
                  {getAvailableProviders().map(provider => (
                    <Button
                      key={provider.provider}
                      variant="outline"
                      onClick={() => addProvider(provider.provider)}
                      className="bg-brand-sidebar space-x-1.5 border-brand-border hover:bg-brand-primary/20 text-brand-text h-auto min-h-[56px] justify-start">
                      <provider.icon
                        aria-description={provider.provider + ` icon`}
                        className="size-6 flex-shrink-0"
                      />
                      <span className="text-left text-sm">
                        {provider.text}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text min-h-[44px] w-full"
                disabled={true}>
                <CirclePlus className="mr-2 h-4 w-4" />
                All supported providers added
              </Button>
            )}
          </CardContent>

          <CardFooter className="text-brand-text-muted text-xs tracking-tight">
            {CARD_FOOTER_TEXT}
          </CardFooter>
        </Card>
      </motion.div>
    </BreakoutWrapper>
  );
}

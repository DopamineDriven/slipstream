"use client";

import type { Providers as Provider } from "@t3-chat-clone/types";
import type { ClientWorkupProps } from "@/types/shared";
import type { ApiKeyData } from "@/ui/api-key-settings/types";
import type { ApiKeySubmissionState } from "@/ui/atoms/multi-state-submission-badge";
import { useCallback, useEffect, useRef, useState } from "react";
import { getDecryptedApiKeyOnEdit, upsertApiKey } from "@/app/actions/api-key";
import { cn } from "@/lib/utils";
import {
  API_KEY_SETTINGS_TEXT_CONSTS,
  providerObj
} from "@/ui/api-key-settings/constants";
import { BreakoutWrapper } from "@/ui/atoms/breakout-wrapper";
import { MultiStateApiKeySubmissionBadge } from "@/ui/atoms/multi-state-submission-badge";
import { AnimatePresence, motion } from "motion/react";
import type { User } from "next-auth";
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
  Eye,
  EyeOff,
  Input,
  Label,
  SquarePen,
  Switch,
  Trash,
  X
} from "@t3-chat-clone/ui";

interface ApiKeysTabProps {
  className?: string;
  initialData?: ClientWorkupProps;
  user?: User;
}

const { CARD_HEADER_TEXT, CARD_FOOTER_TEXT } = API_KEY_SETTINGS_TEXT_CONSTS;

export function ApiKeysTab({
  className = "",
  initialData,
  user: _user
}: ApiKeysTabProps) {
  const [_isLoading, setIsLoading] = useState(false);

  // State for managing API keys
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([]);
  const [editingKey, setEditingKey] = useState<Provider | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<Provider>>(new Set());
  const tempValuesRef = useRef<Map<Provider, string>>(new Map());
  const [_tempValueTrigger, setTempValueTrigger] = useState(0);
  const [originalValues, setOriginalValues] = useState<
    Partial<Record<Provider, { value: string; isDefault: boolean }>>
  >({});
  const [tempDefaults, setTempDefaults] = useState<
    Partial<Record<Provider, boolean>>
  >({});

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<Provider | null>(null);
  const [decryptingKey, setDecryptingKey] = useState<Provider | null>(null);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [submissionStates, setSubmissionStates] = useState<
    Partial<Record<Provider, ApiKeySubmissionState>>
  >({});

  // Add ref for auto-focusing new key inputs
  const inputRefs = useRef(new Map<Provider, HTMLInputElement | null>());

  const getInputRef = useCallback((provider: Provider) => {
    return inputRefs.current.get(provider) ?? null;
  }, []);

  const setInputRef = useCallback(
    (provider: Provider, element: HTMLInputElement | null) => {
      inputRefs.current.set(provider, element);
    },
    []
  );

  const getTempDefault = useCallback(
    (provider: Provider) => {
      return tempDefaults[provider] ?? false;
    },
    [tempDefaults]
  );

  const getSubmissionState = useCallback(
    (provider: Provider) => {
      return submissionStates[provider] ?? "idle";
    },
    [submissionStates]
  );

  const getOriginalValue = useCallback(
    (provider: Provider) => {
      return originalValues[provider];
    },
    [originalValues]
  );

  useEffect(() => {
    if (initialData) {
      const initialKeys = providerObj
        .filter(provider => initialData.isSet[provider.provider])
        .map(provider => ({
          ...provider,
          isSet: true,
          isDefault: initialData.isDefault[provider.provider]
        }));

      setApiKeys(initialKeys);
    }
    setIsLoading(false);
  }, [initialData]);

  const toggleVisibility = async (provider: Provider) => {
    const newVisible = new Set(visibleKeys);
    const keyData = apiKeys.find(key => key.provider === provider);

    if (newVisible.has(provider)) {
      newVisible.delete(provider);
    } else {
      if (keyData?.isSet && editingKey !== provider) {
        setDecryptingKey(provider);
        try {
          if (!tempValuesRef.current.has(provider)) {
            const decryptedValue = await getDecryptedApiKeyOnEdit(provider);
            tempValuesRef.current.set(provider, decryptedValue);
            setTempValueTrigger(prev => prev + 1);
          }
          newVisible.add(provider);
        } catch (error) {
          console.error("Failed to decrypt API key:", error);
        } finally {
          setDecryptingKey(null);
        }
      } else {
        newVisible.add(provider);
      }
    }
    setVisibleKeys(newVisible);
  };

  const startEditing = async (provider: Provider) => {
    const currentKey = apiKeys.find(key => key.provider === provider);

    if (currentKey?.isSet) {

      setDecryptingKey(provider);

      try {
        const decryptedValue = await getDecryptedApiKeyOnEdit(provider);

        setOriginalValues(prev => ({
          ...prev,
          [provider]: {
            value: decryptedValue,
            isDefault: currentKey?.isDefault ?? false
          }
        }));

        tempValuesRef.current.set(provider, decryptedValue);
        setTempValueTrigger(prev => prev + 1);

        setTempDefaults(prev => ({
          ...prev,
          [provider]: currentKey?.isDefault ?? false
        }));
        setEditingKey(provider);

        setVisibleKeys(prev => {
          const newVisible = new Set(prev);
          newVisible.delete(provider);
          return newVisible;
        });
      } catch (error) {
        console.error("Failed to decrypt API key:", error);
      } finally {
        setDecryptingKey(null);
      }
    } else {

      setEditingKey(provider);
      setTempDefaults(prev => ({
        ...prev,
        [provider]: false
      }));

      setVisibleKeys(prev => {
        const newVisible = new Set(prev);
        newVisible.add(provider);
        return newVisible;
      });

      setTimeout(() => {
        const input = getInputRef(provider);
        if (input) {
          input.focus();
        }
      }, 100);
    }
  };

  const hasChanges = useCallback(
    (provider: Provider) => {
      const original = getOriginalValue(provider);
      const current = {
        value: tempValuesRef.current.get(provider) ?? "",
        isDefault: getTempDefault(provider)
      };

      if (!original) return true;

      return (
        original.value !== current.value ||
        original.isDefault !== current.isDefault
      );
    },
    [getOriginalValue, getTempDefault]
  );

  const cancelEditing = (provider: Provider) => {
    const currentKey = apiKeys.find(key => key.provider === provider);

    if (!currentKey?.isSet) {
      setApiKeys(prev => prev.filter(key => key.provider !== provider));
    }

    setEditingKey(null);
    tempValuesRef.current.delete(provider);
    setTempValueTrigger(prev => prev + 1);

    setTempDefaults(prev => {
      const newTemp = { ...prev };
      delete newTemp[provider];
      return newTemp;
    });
    setOriginalValues(prev => {
      const newTemp = { ...prev };
      delete newTemp[provider];
      return newTemp;
    });

    setVisibleKeys(prev => {
      const newVisible = new Set(prev);
      newVisible.delete(provider);
      return newVisible;
    });
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const provider = formData.get("provider") as Provider;

    setSubmissionStates(prev => ({ ...prev, [provider]: "processing" }));
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

        setSubmissionStates(prev => ({ ...prev, [provider]: "success" }));

        setTimeout(() => {
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
              if (asDefault && key.isDefault) {
                return { ...key, isDefault: false };
              }
              return key;
            })
          );

          setEditingKey(null);
          tempValuesRef.current.delete(provider);
          setTempValueTrigger(prev => prev + 1);
          setTempDefaults(prev => {
            const newTemp = { ...prev };
            delete newTemp[provider];
            return newTemp;
          });
          setVisibleKeys(prev => {
            const newVisible = new Set(prev);
            newVisible.delete(provider);
            return newVisible;
          });
          setOriginalValues(prev => {
            const newOriginal = { ...prev };
            delete newOriginal[provider];
            return newOriginal;
          });

          setSubmissionStates(prev => {
            const newStates = { ...prev };
            delete newStates[provider];
            return newStates;
          });
        }, 1500);
      } else {
        setSubmissionStates(prev => ({ ...prev, [provider]: "error" }));
        setSubmitError("Failed to save API key. Please try again.");
      }
    } catch (error) {
      console.error("Error saving API key:", error);
      setSubmissionStates(prev => ({ ...prev, [provider]: "error" }));
      setSubmitError("An unexpected error occurred. Please try again.");
    }
  };

  const updateTempValue = (provider: Provider, value: string) => {
    tempValuesRef.current.set(provider, value);
    setTempValueTrigger(prev => prev + 1);
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
      setApiKeys(prev => prev.filter(key => key.provider !== keyToDelete));

      if (editingKey === keyToDelete) {
        setEditingKey(null);
      }
      setVisibleKeys(prev => {
        const newVisible = new Set(prev);
        newVisible.delete(keyToDelete);
        return newVisible;
      });
      tempValuesRef.current.delete(keyToDelete);
      setTempValueTrigger(prev => prev + 1);
      setTempDefaults(prev => {
        const newTemp = { ...prev };
        delete newTemp[keyToDelete];
        return newTemp;
      });
      setOriginalValues(prev => {
        const newTemp = { ...prev };
        delete newTemp[keyToDelete];
        return newTemp;
      });
    }
    setDeleteConfirmOpen(false);
    setKeyToDelete(null);
  };

  const getDisplayValue = useCallback(
    (keyData: ApiKeyData) => {
      if (editingKey === keyData.provider) {
        const tempValue = tempValuesRef.current.get(keyData.provider) ?? "";
        if (visibleKeys.has(keyData.provider)) {
          return tempValue;
        } else {
          return tempValue ? getPlaceholder(keyData.provider) : "";
        }
      }

      if (!keyData.isSet || !keyData.value) {
        return "";
      }

      if (
        visibleKeys.has(keyData.provider) &&
        tempValuesRef.current.has(keyData.provider)
      ) {
        return tempValuesRef.current.get(keyData.provider) ?? "";
      }

      return getPlaceholder(keyData.provider);
    },
    [editingKey, visibleKeys]
  );

  const getPlaceholder = (provider: Provider) => {
    switch (provider) {
      case "anthropic":
        return "sk-ant-*******************************************";
      case "grok":
        return "xai-*******************************************";
      default:
        return "sk-************************************************";
    }
  };

  const getCurrentDefault = useCallback(
    (provider: Provider) => {
      if (editingKey === provider) {
        return getTempDefault(provider);
      }
      const keyData = apiKeys.find(key => key.provider === provider);
      return keyData?.isDefault ?? false;
    },
    [editingKey, getTempDefault, apiKeys]
  );

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
      startEditing(provider);
    }
  };

  useEffect(() => {
    const x = tempValuesRef.current;
    return () => {
      x?.clear();
    };
  }, []);

  return (
    <BreakoutWrapper>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={cn("w-full", className)}>
        <Card className="bg-brand-component border-brand-border text-brand-text mx-auto w-full max-w-full overflow-hidden sm:mx-0">
          <CardHeader className="">
            <CardTitle className="text-brand-text-emphasis">BYOK</CardTitle>
            <CardDescription className="text-brand-text-muted text-xs tracking-tight sm:text-sm">
              {CARD_HEADER_TEXT}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Configured Providers Section */}
            {apiKeys.filter(key => key.isSet).length > 0 && (
              <div className="space-y-4">
                <div className="text-brand-text-muted text-sm font-medium">
                  Configured Providers
                </div>
                <AnimatePresence mode="popLayout">
                  {apiKeys
                    .filter(key => key.isSet)
                    .map(keyData => (
                      <motion.div
                        key={keyData.provider}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <keyData.icon className="h-5 w-5 flex-shrink-0" />
                            <span className="text-brand-text text-sm font-medium">
                              {keyData.text}
                            </span>
                            <div className="h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />
                            {keyData.isDefault && (
                              <span className="flex-shrink-0 rounded-full bg-blue-500 px-2 py-1 text-xs text-white">
                                Default
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditing(keyData.provider)}
                              disabled={decryptingKey === keyData.provider}
                              className="hover:bg-brand-primary/20 h-8 w-8 p-0">
                              {decryptingKey === keyData.provider ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              ) : (
                                <SquarePen className="h-4 w-4" />
                              )}
                            </Button>

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
                                  onClick={() =>
                                    confirmDelete(keyData.provider)
                                  }
                                  className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/20">
                                  <Trash className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-brand-component border-brand-border mx-4 sm:mx-0">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-brand-text-emphasis">
                                    Delete API Key
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-brand-text-muted">
                                    Are you sure you want to delete your{" "}
                                    {keyData.text} API key? This action cannot
                                    be undone and you'll need to re-enter your
                                    API key to use this provider again.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="bg-brand-sidebar border-brand-border text-brand-text hover:bg-brand-primary/20">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={deleteKey}
                                    className="bg-red-600 text-white hover:bg-red-700">
                                    Delete Key
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>

                        {/* Show status when not editing */}
                        {editingKey !== keyData.provider && (
                          <div className="flex items-center space-x-2 pl-7">
                            <div className="text-brand-text-muted text-sm">
                              {keyData.isDefault
                                ? "✓ Default provider"
                                : "Available provider"}
                            </div>
                          </div>
                        )}

                        {/* Edit form - only show when editing this specific key */}
                        {editingKey === keyData.provider && (
                          <form
                            id={`form-${keyData.provider}`}
                            onSubmit={handleFormSubmit}
                            className="space-y-4 pl-7">
                            <input
                              type="hidden"
                              name="provider"
                              value={keyData.provider}
                            />
                            <input
                              type="hidden"
                              name="asDefault"
                              value={getCurrentDefault(
                                keyData.provider
                              ).toString()}
                            />

                            <div className="flex flex-col space-y-3 lg:flex-row lg:space-y-0 lg:space-x-3">
                              <div className="relative flex-1">
                                <Input
                                  ref={el => setInputRef(keyData.provider, el)}
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
                                    updateTempValue(
                                      keyData.provider,
                                      e.target.value
                                    )
                                  }
                                  disabled={!visibleKeys.has(keyData.provider)}
                                  className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text pr-12"
                                  required
                                />

                                {/* Only show eye toggle for existing keys */}
                                {keyData.isSet && (
                                  <div className="absolute top-1/2 right-2 -translate-y-1/2">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        toggleVisibility(keyData.provider)
                                      }
                                      disabled={
                                        decryptingKey === keyData.provider
                                      }
                                      aria-pressed={visibleKeys.has(
                                        keyData.provider
                                      )}
                                      aria-label={`${visibleKeys.has(keyData.provider) ? "Hide" : "Show"} ${keyData.text} API key`}
                                      className="hover:bg-brand-primary/20 h-8 w-8 p-0">
                                      {decryptingKey === keyData.provider ? (
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                      ) : visibleKeys.has(keyData.provider) ? (
                                        <Eye className="h-4 w-4" />
                                      ) : (
                                        <EyeOff className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-3 lg:flex-col lg:space-y-3 lg:space-x-0 xl:flex-row xl:space-y-0 xl:space-x-3">
                                <MultiStateApiKeySubmissionBadge
                                  state={getSubmissionState(keyData.provider)}
                                  context={keyData.isSet ? "update" : "add"}
                                  disabled={
                                    keyData.isSet &&
                                    !hasChanges(keyData.provider)
                                  }
                                  onClick={() => {
                                    const form = document.getElementById(
                                      `form-${keyData.provider}`
                                    ) as HTMLFormElement;
                                    if (form) form.requestSubmit();
                                  }}
                                  className="flex-1 sm:flex-none lg:flex-1 xl:flex-none"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    cancelEditing(keyData.provider)
                                  }
                                  className="bg-brand-sidebar border-brand-border text-brand-text min-h-[44px] flex-1 hover:bg-red-500/20 sm:flex-none lg:flex-1 xl:flex-none">
                                  <X className="mr-2 h-4 w-4" />
                                  Cancel
                                </Button>
                              </div>
                            </div>

                            {/* Default provider toggle */}
                            <div className="flex items-center space-x-3">
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
                              <div className="text-sm text-red-500">
                                {submitError}
                              </div>
                            )}
                          </form>
                        )}
                      </motion.div>
                    ))}
                </AnimatePresence>
              </div>
            )}

            {/* Divider - only show if we have both configured and available providers */}
            {apiKeys.filter(key => key.isSet).length > 0 &&
              (apiKeys.filter(key => !key.isSet).length > 0 ||
                getAvailableProviders().length > 0) && (
                <div className="flex items-center space-x-4 py-2">
                  <div className="border-brand-border flex-1 border-t border-dotted"></div>
                </div>
              )}

            {/* Available Providers Section - providers that are available but not yet configured */}
            {apiKeys.filter(key => !key.isSet).length > 0 && (
              <div className="space-y-4">
                <div className="text-brand-text-muted text-sm font-medium">
                  Available Providers
                </div>
                <AnimatePresence mode="popLayout">
                  {apiKeys
                    .filter(key => !key.isSet)
                    .map(keyData => (
                      <motion.div
                        key={keyData.provider}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <keyData.icon className="h-5 w-5 flex-shrink-0" />
                          <label
                            htmlFor={`${keyData.provider}-key`}
                            className="text-brand-text-muted text-sm font-medium">
                            {keyData.text}
                          </label>
                        </div>

                        {/* Always show the form for new keys - no intermediate state */}
                        <form
                          id={`form-${keyData.provider}`}
                          onSubmit={handleFormSubmit}
                          className="space-y-4 pl-7">
                          <input
                            type="hidden"
                            name="provider"
                            value={keyData.provider}
                          />
                          <input
                            type="hidden"
                            name="asDefault"
                            value={getCurrentDefault(
                              keyData.provider
                            ).toString()}
                          />

                          <div className="flex flex-col space-y-3 lg:flex-row lg:space-y-0 lg:space-x-3">
                            <div className="relative flex-1">
                              <Input
                                ref={el => setInputRef(keyData.provider, el)}
                                name="apiKey"
                                id={`${keyData.provider}-key`}
                                type="text"
                                inputMode="text"
                                placeholder={getPlaceholder(keyData.provider)}
                                value={getDisplayValue(keyData)}
                                onChange={e =>
                                  updateTempValue(
                                    keyData.provider,
                                    e.target.value
                                  )
                                }
                                className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text"
                                required
                              />
                              {/* No eye toggle for new keys - they're always visible */}
                            </div>

                            <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-3 lg:flex-col lg:space-y-3 lg:space-x-0 xl:flex-row xl:space-y-0 xl:space-x-3">
                              <MultiStateApiKeySubmissionBadge
                                state={getSubmissionState(keyData.provider)}
                                context="add"
                                disabled={false}
                                onClick={() => {
                                  const form = document.getElementById(
                                    `form-${keyData.provider}`
                                  ) as HTMLFormElement;
                                  if (form) form.requestSubmit();
                                }}
                                className="flex-1 sm:flex-none lg:flex-1 xl:flex-none"
                              />
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
                          <div className="flex items-center space-x-3">
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
                          {submitError && editingKey === keyData.provider && (
                            <div className="text-sm text-red-500">
                              {submitError}
                            </div>
                          )}
                        </form>
                      </motion.div>
                    ))}
                </AnimatePresence>
              </div>
            )}

            {/* Provider Configuration Section - providers not yet added */}
            {getAvailableProviders().length > 0 && (
              <div className="space-y-4">
                <div className="text-brand-text-muted text-sm font-medium">
                  Provider Configuration
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
                  {getAvailableProviders().map(provider => (
                    <Button
                      key={provider.provider}
                      variant="outline"
                      onClick={() => addProvider(provider.provider)}
                      className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text h-auto min-h-[56px] justify-start space-x-1.5">
                      <provider.icon className="h-6 w-6 flex-shrink-0" />
                      <span className="text-left text-sm">{provider.text}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Shown only when all offered providers are configured */}
            {getAvailableProviders().length === 0 &&
              apiKeys.filter(key => !key.isSet).length === 0 &&
              apiKeys.filter(key => key.isSet).length ===
                providerObj.length && (
                <div className="py-8 text-center">
                  <div className="text-brand-text-muted text-sm">
                    🎉 All supported providers have been configured!
                  </div>
                </div>
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

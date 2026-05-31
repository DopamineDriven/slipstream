"use client";

import type { ApiKeyData } from "@/ui/api-key-settings/types";
import type { ApiKeySubmissionState } from "@/ui/atoms/multi-state-submission-badge";
import type { User } from "@/utils/auth-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getDecryptedApiKeyOnEdit, upsertApiKey } from "@/app/actions/api-key";
import { useApiKeys } from "@/context/api-keys-context";
import { cn } from "@/lib/utils";
import {
  API_KEY_SETTINGS_TEXT_CONSTS,
  providerObj
} from "@/ui/api-key-settings/constants";
import { MultiStateApiKeySubmissionBadge } from "@/ui/atoms/multi-state-submission-badge";
import { AnimatePresence, motion } from "motion/react";
import type {
  ClientContextWorkupProps,
  Provider
} from "@slipstream/types";
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
  BreakoutWrapper,
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
} from "@slipstream/ui";

const getPlaceholder = (provider: Provider) => {
  switch (provider) {
    case "anthropic":
      return "sk-ant-*******************************************";
    case "grok":
      return "xai-*******************************************";
    case "meta":
      return "LLM|******************|*******************";
    case "vercel":
      return "vck_********************************";
    case "gemini":
      return "AIza********************";
    case "mistral":
      return `SwM*****************************`;
    case "cohere":
      return "QlQ*************************************";
    case "deepseek":
      return "vck_********************************";
    case "moonshotai":
      return "vck_********************************";
    case "zai":
      return "vck_********************************";
    case "openai":
    default:
      return "sk-************************************************";
  }
};
const toProviderContext = (providerObj: ApiKeyData[]) => {
  const r = {
    isDefault: {
      gemini: false,
      grok: false,
      meta: false,
      vercel: false,
      mistral: false,
      openai: false,
      cohere: false,
      anthropic: false,
      deepseek: false,
      moonshotai: false,
      zai: false
    },
    isSet: {
      gemini: false,
      grok: false,
      mistral: false,
      meta: false,
      vercel: false,
      openai: false,
      cohere: false,
      anthropic: false,
      deepseek: false,
      moonshotai: false,
      zai: false
    }
  };
  providerObj.forEach(function (o) {
    r.isDefault[o.provider] = o.isDefault;
    r.isSet[o.provider] = o.isSet;
  });
  return r;
};

function equalityCheck(
  one: ClientContextWorkupProps,
  two: ClientContextWorkupProps
) {
  const isSet = { o: one.isSet, t: two.isSet } as const;

  const isDefault = { o: one.isDefault, t: two.isDefault } as const;

  const p = [
    "anthropic",
    "cohere",
    "gemini",
    "openai",
    "meta",
    "mistral",
    "vercel",
    "grok",
    "deepseek",
    "moonshotai",
    "zai"
  ] as const;

  for (const provider of p) {
    if (isSet.o[provider] !== isSet.t[provider]) return false;
    if (isDefault.o[provider] !== isDefault.t[provider]) return false;
  }

  return true;
}

interface ApiKeysTabProps {
  className?: string;
  user?: User;
}

const { CARD_HEADER_TEXT, CARD_FOOTER_TEXT } = API_KEY_SETTINGS_TEXT_CONSTS;

export function ApiKeysTab({ className = "", user: _user }: ApiKeysTabProps) {
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

  const {
    providerContext,
    isAwaitingInitial,
    isAwaitingPong,
    isAwaitingUpdateAck,
    sendProviderContextUpdate
  } = useApiKeys();

  useEffect(() => {
    if (!providerContext) return;
    if ((isAwaitingInitial || isAwaitingPong || isAwaitingUpdateAck) === true)
      return;
    if (equalityCheck(toProviderContext(apiKeys), providerContext) === false) {
      const arr = Array.of<ApiKeyData>();
      for (const p of providerObj) {
        if (providerContext.isSet[p.provider]) {
          p.isSet = true;
          if (providerContext.isDefault[p.provider]) {
            p.isDefault = true;
            arr.push(p);
          } else {
            p.isDefault = false;
            arr.push(p);
          }
        } else {
          p.isSet = false;
          p.isDefault = false;
          arr.push(p);
        }
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setApiKeys(arr);
    }
  }, [
    providerContext,
    apiKeys,
    isAwaitingInitial,
    isAwaitingPong,
    isAwaitingUpdateAck
  ]);

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
      sendProviderContextUpdate(getResult.success);
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
        return tempValuesRef.current.get(keyData.provider) ?? "";
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
        <Card className="bg-background/40 border-foreground/25 text-foreground/90 font-basis mx-auto w-full max-w-full overflow-hidden backdrop-blur-xs sm:mx-0">
          <CardHeader className="">
            <CardTitle className="text-foreground/95 text-xl">BYOK</CardTitle>
            <CardDescription className="text-foreground-muted text-xs tracking-tight sm:text-base">
              {CARD_HEADER_TEXT}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Configured Providers Section */}
            {apiKeys.filter(key => key.isSet).length > 0 && (
              <div className="space-y-4">
                <h3 className="text-brand-text-muted sr-only text-sm font-medium">
                  Configured Providers
                </h3>
                <AnimatePresence mode="popLayout">
                  {apiKeys
                    .filter(key => key.isSet)
                    // eslint-disable-next-line
                    .map(keyData => (
                      <motion.div
                        key={keyData.provider}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="relative flex items-center space-x-2">
                            <keyData.icon className="size-4 shrink-0" />
                            <span className="text-foreground text-sm font-medium">
                              {keyData.text}
                            </span>
                            <div className="motion-safe:animate-twinkle size-1.5 shrink-0 rounded-full bg-green-600" />
                            {keyData.isDefault && (
                              <span className="bg-foreground/20 text-foreground/80 text-xxs sr-only shrink-0 rounded-2xl bg-clip-border px-1 py-0.5">
                                default
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
                                  <AlertDialogCancel className="">
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
                                  disabled={false}
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
                                  className="bg-brand-sidebar border-brand-border text-brand-text min-h-11 flex-1 hover:bg-red-500/20 sm:flex-none lg:flex-1 xl:flex-none">
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
                    // eslint-disable-next-line
                    .map(keyData => (
                      <motion.div
                        key={keyData.provider}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <keyData.icon className="h-5 w-5 shrink-0" />
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
                                className="bg-brand-sidebar border-brand-border text-brand-text min-h-11 flex-1 hover:bg-red-500/20 sm:flex-none lg:flex-1 xl:flex-none">
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
                      className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text h-auto min-h-14 justify-start space-x-1.5">
                      <provider.icon className="h-6 w-6 shrink-0" />
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

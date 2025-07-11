"use client";

import "node:crypto";
import type { Providers } from "@t3-chat-clone/types";
import { useState, useTransition } from "react";
import { getDecryptedApiKeyOnEdit, upsertApiKey } from "@/app/actions/api-key";
import { Switch } from "@/ui/atoms/switch";
import { AnimatePresence, motion } from "motion/react";
import { createRoot } from "react-dom/client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Edit,
  Eye,
  EyeOff,
  Input,
  Key,
  Label,
  Loader,
  Save,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  X
} from "@t3-chat-clone/ui";

const r = document.getElementById("root");
createRoot(r as Element);
interface ApiKeyData {
  id: string;
  provider: Providers;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ApiKeyManagerProps {
  initialKeys: ApiKeyData[];
}

const PROVIDERS: { value: Providers; label: string; color: string }[] = [
  { value: "openai", label: "OpenAI", color: "bg-green-500" },
  { value: "anthropic", label: "Anthropic", color: "bg-orange-500" },
  { value: "gemini", label: "Google Gemini", color: "bg-blue-500" },
  { value: "grok", label: "Grok", color: "bg-purple-500" }
];

export default function ApiKeyManager({ initialKeys }: ApiKeyManagerProps) {
  const [keys, setKeys] = useState<ApiKeyData[]>(initialKeys);
  const [editingKey, setEditingKey] = useState<Providers | null>(null);
  const [showKey, setShowKey] = useState<Record<Providers, boolean>>(
    {} as Record<Providers, boolean>
  );
  const [formData, setFormData] = useState({
    provider: "" as Providers | "",
    apiKey: "",
    isDefault: false
  });
  const [_decryptedKeys, setDecryptedKeys] = useState<
    Record<Providers, string>
  >({} as Record<Providers, string>);
  const [isPending, startTransition] = useTransition();
  const [isDecrypting, setIsDecrypting] = useState<Record<Providers, boolean>>(
    {} as Record<Providers, boolean>
  );

  const handleEdit = async (provider: Providers) => {
    setIsDecrypting(prev => ({ ...prev, [provider]: true }));

    try {
      // Call your server action to decrypt the key
      const decryptedKey = await getDecryptedApiKeyOnEdit(provider);

      setDecryptedKeys(prev => ({ ...prev, [provider]: decryptedKey }));
      setFormData({
        provider,
        apiKey: decryptedKey,
        isDefault: keys.find(k => k.provider === provider)?.isDefault ?? false
      });
      setEditingKey(provider);
      setShowKey(prev => ({ ...prev, [provider]: true }));
    } catch (error) {
      console.error("Failed to decrypt API key:", error);
      // Handle error - maybe show a toast
    } finally {
      setIsDecrypting(prev => ({ ...prev, [provider]: false }));
    }
  };

  const handleSave = () => {
    if (!formData.provider || !formData.apiKey) return;

    startTransition(async () => {
      const form = new FormData();
      form.append("provider", formData.provider);
      form.append("apiKey", formData.apiKey);
      form.append("asDefault", formData.isDefault.toString());

      const result = await upsertApiKey(form);

      if (result.success) {
        // Update local state
        const existingKeyIndex = keys.findIndex(
          k => k.provider === formData.provider
        );
        if (existingKeyIndex >= 0) {
          setKeys(prev =>
            prev.map((key, index) =>
              index === existingKeyIndex
                ? {
                    ...key,
                    isDefault: formData.isDefault,
                    updatedAt: new Date()
                  }
                : key
            )
          );
        } else {
          setKeys(prev => [
            ...prev,
            {
              id: result.id,
              provider: formData.provider as Providers,
              isDefault: formData.isDefault,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          ]);
        }

        handleCancel();
      }
    });
  };

  const handleCancel = () => {
    setEditingKey(null);
    setFormData({ provider: "", apiKey: "", isDefault: false });
    setShowKey({} as Record<Providers, boolean>);
  };

  const toggleKeyVisibility = (provider: Providers) => {
    setShowKey(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  const getProviderConfig = (provider: Providers) =>
    PROVIDERS.find(p => p.value === provider);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">API Key Manager</h1>
        <p className="text-muted-foreground">
          Securely manage your AI provider API keys with real-time
          encryption/decryption
        </p>
      </div>

      {/* Add New Key Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            {editingKey
              ? `Edit ${getProviderConfig(editingKey)?.label} Key`
              : "Add New API Key"}
          </CardTitle>
          <CardDescription>
            {editingKey
              ? "Update your existing API key configuration"
              : "Add a new API key for one of the supported providers"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Select
                value={formData.provider}
                onValueChange={value =>
                  setFormData(prev => ({
                    ...prev,
                    provider: value as Providers
                  }))
                }
                disabled={!!editingKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map(provider => (
                    <SelectItem key={provider.value} value={provider.value}>
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-3 w-3 rounded-full ${provider.color}`}
                        />
                        {provider.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={
                    showKey[formData.provider as Providers]
                      ? "text"
                      : "password"
                  }
                  value={formData.apiKey}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, apiKey: e.target.value }))
                  }
                  placeholder="Enter your API key"
                  className="pr-10"
                />
                {formData.apiKey && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute top-0 right-0 h-full px-3"
                    onClick={() =>
                      toggleKeyVisibility(formData.provider as Providers)
                    }>
                    {showKey[formData.provider as Providers] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="isDefault"
              checked={formData.isDefault}
              onCheckedChange={checked =>
                setFormData(prev => ({ ...prev, isDefault: checked }))
              }
            />
            <Label htmlFor="isDefault">Set as default for this provider</Label>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={!formData.provider || !formData.apiKey || isPending}
              className="flex items-center gap-2">
              {isPending ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {editingKey ? "Update Key" : "Save Key"}
            </Button>
            {editingKey && (
              <Button variant="outline" onClick={handleCancel}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Existing Keys */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Your API Keys</h2>
        <AnimatePresence>
          {keys.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-muted-foreground py-12 text-center">
              <Key className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>No API keys configured yet</p>
              <p className="text-sm">
                Add your first API key above to get started
              </p>
            </motion.div>
          ) : (
            <div className="grid gap-4">
              {keys.map(keyData => {
                const providerConfig = getProviderConfig(keyData.provider);
                const isCurrentlyEditing = editingKey === keyData.provider;

                return (
                  <motion.div
                    key={keyData.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}>
                    <Card
                      className={
                        isCurrentlyEditing ? "ring-primary ring-2" : ""
                      }>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-4 w-4 rounded-full ${providerConfig?.color}`}
                            />
                            <div>
                              <h3 className="font-medium">
                                {providerConfig?.label}
                              </h3>
                              <p className="text-muted-foreground text-sm">
                                Updated {keyData.updatedAt.toLocaleDateString()}
                              </p>
                            </div>
                            {keyData.isDefault && (
                              <Badge variant="secondary">Default</Badge>
                            )}
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(keyData.provider)}
                            disabled={
                              isDecrypting[keyData.provider] ||
                              isCurrentlyEditing
                            }
                            className="flex items-center gap-2">
                            {isDecrypting[keyData.provider] ? (
                              <Loader className="h-4 w-4 animate-spin" />
                            ) : (
                              <Edit className="h-4 w-4" />
                            )}
                            {isDecrypting[keyData.provider]
                              ? "Decrypting..."
                              : "Edit"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 https://v0.dev/chat/react-api-key-component-Cion2yygYA8
 "use client"

import type React from "react"

import { motion, AnimatePresence } from "motion/react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { CirclePlus, Eye, EyeOff, Edit2, Save, X, Trash2 } from "lucide-react"
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
} from "@/components/ui/alert-dialog"

interface ApiKeysTabProps {
  className?: string
}

function useSession() {
  return {
    data: {
      user: {
        name: "Andrew Ross",
        email: "andrew@windycitydevs.io",
        image: "https://lh3.googleusercontent.com/a/ACg8ocISDUQaOSEJd8bLu0EqqA5Iov-S790vcXtUqWuxjxgJ_Aobeg=s96-c",
        id: "x1sa9esbc7nb1bbhnn5uy9ct",
      },
      expires: "2025-07-03T08:37:40.000Z",
      accessToken: "yeah.right.like.id.put.that.here",
      userId: "x1sa9esbc7nb1bbhnn5uy9ct",
    },
  }
}

type Provider = "anthropic" | "gemini" | "grok" | "openai"

interface ApiKeyData {
  provider: Provider
  text: string
  icon: string
  value?: string
  isSet?: boolean
  isDefault?: boolean
}

const providerObj: ApiKeyData[] = [
  {
    provider: "anthropic",
    text: "Anthropic API Key",
    icon: "https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/public/claude-ai-icon.svg",
    value: "sk-ant-*******************************************",
    isSet: true,
    isDefault: false,
  },
  {
    provider: "gemini",
    text: "Gemini API Key",
    icon: "https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/public/google-gemini-icon.svg",
    value: "AIza********************",
    isSet: false,
    isDefault: false,
  },
  {
    provider: "grok",
    text: "Grok API Key",
    icon: "https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/public/grok-icon.svg",
    value: "xai-*******************************************",
    isSet: true,
    isDefault: false,
  },
  {
    provider: "openai",
    text: "OpenAI API Key",
    icon: "https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/public/chatgpt-icon.svg",
    value: "sk-************************************************",
    isSet: true,
    isDefault: true,
  },
]

export function ApiKeysTab({ className = "" }: ApiKeysTabProps) {
  const { data: session } = useSession()

  // State for managing API keys
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>(providerObj)
  const [editingKey, setEditingKey] = useState<Provider | null>(null)
  const [visibleKeys, setVisibleKeys] = useState<Set<Provider>>(new Set())
  const [tempValues, setTempValues] = useState<Record<Provider, string>>({})
  const [tempDefaults, setTempDefaults] = useState<Record<Provider, boolean>>({})

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [keyToDelete, setKeyToDelete] = useState<Provider | null>(null)

  const toggleVisibility = (provider: Provider) => {
    const newVisible = new Set(visibleKeys)
    if (newVisible.has(provider)) {
      newVisible.delete(provider)
    } else {
      newVisible.add(provider)
    }
    setVisibleKeys(newVisible)
  }

  const startEditing = (provider: Provider) => {
    const currentKey = apiKeys.find((key) => key.provider === provider)
    setTempValues((prev) => ({
      ...prev,
      [provider]: currentKey?.value || "",
    }))
    setTempDefaults((prev) => ({
      ...prev,
      [provider]: currentKey?.isDefault || false,
    }))
    setEditingKey(provider)
    // Hide the key by default when editing starts
    setVisibleKeys((prev) => {
      const newVisible = new Set(prev)
      newVisible.delete(provider)
      return newVisible
    })
  }

  const cancelEditing = (provider: Provider) => {
    setEditingKey(null)
    setTempValues((prev) => {
      const newTemp = { ...prev }
      delete newTemp[provider]
      return newTemp
    })
    setTempDefaults((prev) => {
      const newTemp = { ...prev }
      delete newTemp[provider]
      return newTemp
    })
    // Hide the key when canceling edit
    setVisibleKeys((prev) => {
      const newVisible = new Set(prev)
      newVisible.delete(provider)
      return newVisible
    })
  }

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    const apiKey = formData.get("apiKey") as string
    const provider = formData.get("provider") as Provider
    const asDefault = formData.get("asDefault") === "true"

    console.log("Form Data Captured:", {
      apiKey,
      provider,
      asDefault,
    })

    // Update the API keys state
    setApiKeys((prev) =>
      prev.map((key) => {
        if (key.provider === provider) {
          return { ...key, value: apiKey, isSet: apiKey.length > 0, isDefault: asDefault }
        }
        // If this key is being set as default, unset all others
        if (asDefault && key.isDefault) {
          return { ...key, isDefault: false }
        }
        return key
      }),
    )

    // Clean up editing state
    setEditingKey(null)
    setTempValues((prev) => {
      const newTemp = { ...prev }
      delete newTemp[provider]
      return newTemp
    })
    setTempDefaults((prev) => {
      const newTemp = { ...prev }
      delete newTemp[provider]
      return newTemp
    })
    // Hide the key after saving
    setVisibleKeys((prev) => {
      const newVisible = new Set(prev)
      newVisible.delete(provider)
      return newVisible
    })

    // Here you would typically send the data to your server
    // Example: await saveApiKey({ apiKey, provider, asDefault })
  }

  const updateTempValue = (provider: Provider, value: string) => {
    setTempValues((prev) => ({
      ...prev,
      [provider]: value,
    }))
  }

  const updateTempDefault = (provider: Provider, isDefault: boolean) => {
    setTempDefaults((prev) => ({
      ...prev,
      [provider]: isDefault,
    }))
  }

  const confirmDelete = (provider: Provider) => {
    setKeyToDelete(provider)
    setDeleteConfirmOpen(true)
  }

  const deleteKey = () => {
    if (keyToDelete) {
      setApiKeys((prev) =>
        prev.map((key) => (key.provider === keyToDelete ? { ...key, value: "", isSet: false, isDefault: false } : key)),
      )
      // Clean up any editing state for this key
      if (editingKey === keyToDelete) {
        setEditingKey(null)
      }
      setVisibleKeys((prev) => {
        const newVisible = new Set(prev)
        newVisible.delete(keyToDelete)
        return newVisible
      })
      setTempValues((prev) => {
        const newTemp = { ...prev }
        delete newTemp[keyToDelete]
        return newTemp
      })
      setTempDefaults((prev) => {
        const newTemp = { ...prev }
        delete newTemp[keyToDelete]
        return newTemp
      })
    }
    setDeleteConfirmOpen(false)
    setKeyToDelete(null)
  }

  const getDisplayValue = (keyData: ApiKeyData) => {
    if (editingKey === keyData.provider) {
      const tempValue = tempValues[keyData.provider] || ""
      // In edit mode, show actual value only if visibility is toggled ON
      if (visibleKeys.has(keyData.provider)) {
        return tempValue // Show raw value when eye is OPEN
      } else {
        // Show masked version when eye is CLOSED
        return tempValue ? getPlaceholder(keyData.provider) : ""
      }
    }

    if (!keyData.isSet || !keyData.value) {
      return ""
    }

    // Always show masked version when not editing
    return getPlaceholder(keyData.provider)
  }

  const getPlaceholder = (provider: Provider) => {
    switch (provider) {
      case "anthropic":
        return "sk-ant-*******************************************"
      case "grok":
        return "xai-*******************************************"
      default:
        return "sk-************************************************"
    }
  }

  const getCurrentDefault = (provider: Provider) => {
    if (editingKey === provider) {
      return tempDefaults[provider] || false
    }
    const keyData = apiKeys.find((key) => key.provider === provider)
    return keyData?.isDefault || false
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      <Card className="bg-brand-component border-brand-border text-brand-text">
        <CardHeader>
          <CardTitle className="text-brand-text-emphasis">API Keys</CardTitle>
          <CardDescription className="text-brand-text-muted">
            Bring your own API keys for select models. This allows for higher usage limits and access to specific model
            versions.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <AnimatePresence mode="popLayout">
            {apiKeys.map((keyData) => (
              <motion.div
                key={keyData.provider}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <div className="flex items-center space-x-2">
                  <img src={keyData.icon || "/placeholder.svg"} alt={`${keyData.provider} icon`} className="w-5 h-5" />
                  <label htmlFor={`${keyData.provider}-key`} className="text-brand-text-muted text-sm font-medium">
                    {keyData.text}
                  </label>
                  {keyData.isSet && <div className="w-2 h-2 bg-green-500 rounded-full" />}
                  {keyData.isDefault && (
                    <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded-full">Default</span>
                  )}
                </div>

                {editingKey === keyData.provider ? (
                  <form onSubmit={handleFormSubmit} className="space-y-3">
                    <input type="hidden" name="provider" value={keyData.provider} />
                    <input type="hidden" name="asDefault" value={getCurrentDefault(keyData.provider).toString()} />

                    <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
                      <div className="relative flex-1">
                        <Input
                          name="apiKey"
                          id={`${keyData.provider}-key`}
                          type={!visibleKeys.has(keyData.provider) ? "password" : "text"}
                          inputMode="text"
                          placeholder={getPlaceholder(keyData.provider)}
                          value={getDisplayValue(keyData)}
                          onChange={(e) => updateTempValue(keyData.provider, e.target.value)}
                          className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text pr-12"
                          required
                        />

                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleVisibility(keyData.provider)}
                            className="h-8 w-8 p-0 hover:bg-brand-primary/20"
                          >
                            {visibleKeys.has(keyData.provider) ? (
                              <Eye className="h-4 w-4" />
                            ) : (
                              <EyeOff className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="flex space-x-2">
                        <Button
                          type="submit"
                          variant="outline"
                          className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text"
                        >
                          <Save className="mr-2 h-4 w-4" />
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => cancelEditing(keyData.provider)}
                          className="bg-brand-sidebar border-brand-border hover:bg-red-500/20 text-brand-text"
                        >
                          <X className="mr-2 h-4 w-4" />
                          Cancel
                        </Button>
                      </div>
                    </div>


                    <div className="flex items-center space-x-2 pl-7">
                      <Switch
                        id={`default-${keyData.provider}`}
                        checked={getCurrentDefault(keyData.provider)}
                        onCheckedChange={(checked) => updateTempDefault(keyData.provider, checked)}
                      />
                      <Label htmlFor={`default-${keyData.provider}`} className="text-sm text-brand-text-muted">
                        Set as default provider
                      </Label>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
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

                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">

                        {keyData.isSet && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => startEditing(keyData.provider)}
                            className="h-8 w-8 p-0 hover:bg-brand-primary/20"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        )}

                        {keyData.isSet && (
                          <AlertDialog
                            open={deleteConfirmOpen && keyToDelete === keyData.provider}
                            onOpenChange={(open) => {
                              if (!open) {
                                setDeleteConfirmOpen(false)
                                setKeyToDelete(null)
                              }
                            }}
                          >
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => confirmDelete(keyData.provider)}
                                className="h-8 w-8 p-0 hover:bg-red-500/20 text-red-500"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-brand-component border-brand-border">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-brand-text-emphasis">Delete API Key</AlertDialogTitle>
                                <AlertDialogDescription className="text-brand-text-muted">
                                  Are you sure you want to delete your {keyData.text}? This action cannot be undone and
                                  you'll need to re-enter your API key to use this provider again.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="bg-brand-sidebar border-brand-border text-brand-text hover:bg-brand-primary/20">
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={deleteKey}
                                  className="bg-red-600 text-white hover:bg-red-700"
                                >
                                  Delete Key
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>

                    {!keyData.isSet && (
                      <Button
                        variant="outline"
                        onClick={() => startEditing(keyData.provider)}
                        className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text"
                      >
                        Add Key
                      </Button>
                    )}
                  </div>
                )}

                {editingKey !== keyData.provider && keyData.isSet && (
                  <div className="flex items-center space-x-2 pl-7">
                    <div className="text-sm text-brand-text-muted">
                      {keyData.isDefault ? "✓ Default provider" : "Available provider"}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          <Button
            variant="outline"
            className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text w-full"
            disabled={true}
          >
            <CirclePlus className="mr-2 h-4 w-4" />
            All supported providers added
          </Button>
        </CardContent>

        <CardFooter className="text-brand-text-muted text-xs">
          Your API keys are stored securely and only used to communicate with the respective model providers.
        </CardFooter>
      </Card>
    </motion.div>
  )
}

 */

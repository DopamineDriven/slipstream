"use client"

import { ApiKeysTab } from "@/ui/settings/api-keys-tab" // This is the content component

export function ApiKeysSettingsSection() {
  return <ApiKeysTab isProUser={true} />
}

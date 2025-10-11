"use client";

import type { ClientWorkupProps } from "@/types/shared";
import type { User } from "@/utils/auth-client";
import { useMemo } from "react";
import { useApiKeys } from "@/context/api-keys-context";
import { useSettingsDrawer } from "@/context/settings-drawer-context";
import { ApiKeysTab } from "@/ui/api-key-settings";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle
} from "@/ui/atoms/drawer";
import { ScrollArea } from "@/ui/atoms/scroll-area";
import { UserProfileCard } from "@/ui/settings/user-profile-card";
import { useSession } from "@/utils/auth-client";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, X } from "@slipstream/ui";

export function SettingsDrawer({ initialData, initUser }: { initialData?: ClientWorkupProps; initUser?: User }) {
  const { data: session, isPending } = useSession();
  const { apiKeys } = useApiKeys();
  const { isOpen, close, activeTab, setActiveTab } = useSettingsDrawer();
  const effectiveInitialData = useMemo(() => {
    if (initialData) return initialData;
    return {
      isSet: apiKeys.isSet,
      isDefault: apiKeys.isDefault
    } satisfies ClientWorkupProps;
  }, [apiKeys.isDefault, apiKeys.isSet, initialData]);
  const user = (initUser ?? session?.user) satisfies User | undefined;
  return (
    <Drawer open={isOpen} onOpenChange={open => !open && close()}>
      <DrawerContent className="bg-brand-component border-brand-border text-brand-text flex h-[90vh] flex-col">
        <div className="mx-auto flex w-full max-w-md flex-grow flex-col overflow-hidden">
          <DrawerHeader className="flex shrink-0 items-center justify-between">
            <div>
              <DrawerTitle className="text-brand-text-emphasis">
                Settings
              </DrawerTitle>
              <DrawerDescription className="text-brand-text-muted">
                Manage your preferences and account.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-brand-text-muted hover:text-brand-text">
                <X className="h-5 w-5" />
              </Button>
            </DrawerClose>
          </DrawerHeader>
          {isPending ? (
            <div className="p-4">
              <div className="h-12 w-full">Loading...</div>
            </div>
          ) : (
            <ScrollArea className="flex-grow p-4">
              <div className="space-y-4">
                <Tabs
                  value={activeTab}
                  onValueChange={v => setActiveTab(v as typeof activeTab)}
                  className="w-full">
                  <TabsList className="bg-brand-sidebar border-brand-border grid w-full grid-cols-2 border">
                    <TabsTrigger value="apiKeys">API Keys</TabsTrigger>
                    <TabsTrigger value="account">Profile</TabsTrigger>
                  </TabsList>
                  <TabsContent value="apiKeys" className="mt-4">
                    <ApiKeysTab
                      initialData={effectiveInitialData}
                      user={user}
                      className="bg-brand-background border-brand-border rounded-lg p-4"
                    />
                  </TabsContent>
                  <TabsContent value="account" className="mt-4">
                    <UserProfileCard user={user} />
                  </TabsContent>
                </Tabs>
              </div>
            </ScrollArea>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
// To continue this session, run codex resume 0199d2f1-929a-7c21-bf96-61e8b341cc70

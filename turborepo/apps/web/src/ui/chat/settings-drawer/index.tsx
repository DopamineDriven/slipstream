"use client";

import type { ClientWorkupProps } from "@/types/shared";
import type { User } from "@/utils/auth-client";
import { useMemo } from "react";
import { useApiKeys } from "@/context/api-keys-context";
import { useSettingsDrawer } from "@/context/settings-drawer-context";
import { ApiKeysTab } from "@/ui/api-key-settings";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle
} from "@/ui/atoms/drawer";
import { ScrollArea } from "@/ui/atoms/scroll-area";
import { UserProfileCard } from "@/ui/settings/user-profile-card";
import { useSession } from "@/utils/auth-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@slipstream/ui";

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
      <DrawerContent className="bg-linear-210 from-background/95 via-background/75 to-background/95 backdrop-blur-sm border-foreground/55 text-foreground/80 font-basis flex h-[90vh] flex-col">
        <div className="mx-auto flex w-full max-w-md sm:max-w-xl grow flex-col overflow-x-hidden">
          <DrawerHeader className="flex shrink-0 items-center justify-between bg-transparent">
            <div>
              <DrawerTitle className="text-foreground text-2xl">
                Settings
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                Manage your ApiKeys.
              </DrawerDescription>
            </div>
          </DrawerHeader>
          {isPending ? (
            <div className="p-4">
              <div className="h-12 w-full">Loading...</div>
            </div>
          ) : (
            <ScrollArea className="grow px-4">
              <div className="space-y-2">
                <Tabs
                  value={activeTab}
                  onValueChange={v => setActiveTab(v as typeof activeTab)}
                  className="w-full">
                  <TabsList className="bg-background/40 border-foreground/45 grid w-full grid-cols-2 border">
                    <TabsTrigger  value="apiKeys">API Keys</TabsTrigger>
                    <TabsTrigger value="account">Profile</TabsTrigger>
                  </TabsList>
                  <TabsContent value="apiKeys" className="my-auto">
                    <ApiKeysTab
                      initialData={effectiveInitialData}
                      user={user}
                      className="bg-background/40 border-brand-border"
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

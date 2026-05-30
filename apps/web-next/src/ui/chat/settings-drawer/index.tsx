"use client";

import type { User } from "@/utils/auth-client";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@slipstream/ui";

interface SettingsDrawerProps {
  user?: User;
  isLoading?: boolean;
}

export function SettingsDrawer({
  user,
  isLoading = false
}: SettingsDrawerProps) {
  const { isOpen, close, activeTab, setActiveTab } = useSettingsDrawer();
  return (
    <Drawer open={isOpen} onOpenChange={open => !open && close()}>
      <DrawerContent className="from-background/95 via-background/75 to-background/95 border-foreground/55 text-foreground/80 font-basis flex h-[90vh] flex-col bg-linear-210 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-md grow flex-col overflow-x-hidden sm:max-w-xl">
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
          {isLoading ? (
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
                    <TabsTrigger value="apiKeys">API Keys</TabsTrigger>
                    <TabsTrigger value="account">Profile</TabsTrigger>
                  </TabsList>
                  <TabsContent value="apiKeys" className="my-auto">
                    <ApiKeysTab
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

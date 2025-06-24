"use client";

import type { User } from "next-auth";
import { Button, Icon } from "@t3-chat-clone/ui";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle
} from "@/ui/atoms/drawer";
import { ScrollArea } from "@/ui/atoms/scroll-area";
import { ApiKeysTab } from "@/ui/settings/api-keys-tab"; // Example tab
import { UserProfileCard } from "@/ui/settings/user-profile-card";

interface SettingsDrawerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  user?: User;
}

const _settingsOptions = [
  {
    id: "profile",
    label: "Profile",
    icon: Icon.User,
    component: UserProfileCard
  },
  {
    id: "apiKeys",
    label: "API Keys",
    icon: Icon.KeyRound,
    component: ApiKeysTab
  },
  // Add more settings options here
  {
    id: "customization",
    label: "Customization",
    icon: Icon.Palette,
    component: () => <p>Customization (TODO)</p>
  },
  {
    id: "history",
    label: "History & Sync",
    icon: Icon.History,
    component: () => <p>History & Sync (TODO)</p>
  }
];

export function SettingsDrawer({
  isOpen,
  onOpenChange,
  user
}: SettingsDrawerProps) {
  // For simplicity, we'll just show a list of buttons that could lead to sections
  // A more complex drawer might use an Accordion or nested views
  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
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
                <Icon.X className="h-5 w-5" />
              </Button>
            </DrawerClose>
          </DrawerHeader>
          <ScrollArea className="flex-grow p-4">
            <div className="space-y-3">
              <UserProfileCard
                user={user}
                className="bg-brand-background border-brand-border"
              />
              <ApiKeysTab
                isProUser={false}
                className="bg-brand-background border-brand-border rounded-lg p-4"
              />
            </div>
          </ScrollArea>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

"use client"

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "@/ui/atoms/drawer"
import { Button, Icon } from "@t3-chat-clone/ui"
import { ScrollArea } from "@/ui/atoms/scroll-area"
import { UserProfileCard } from "@/ui/settings/user-profile-card"
import { ApiKeysTab } from "@/ui/settings/api-keys-tab" // Example tab

interface SettingsDrawerProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

const _settingsOptions = [
  { id: "profile", label: "Profile", icon: Icon.User, component: UserProfileCard },
  { id: "apiKeys", label: "API Keys", icon: Icon.KeyRound, component: ApiKeysTab },
  // Add more settings options here
  { id: "customization", label: "Customization", icon: Icon.Palette, component: () => <p>Customization (TODO)</p> },
  { id: "history", label: "History & Sync", icon: Icon.History, component: () => <p>History & Sync (TODO)</p> },
]

export function SettingsDrawer({ isOpen, onOpenChange }: SettingsDrawerProps) {
  // For simplicity, we'll just show a list of buttons that could lead to sections
  // A more complex drawer might use an Accordion or nested views
  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-brand-component border-brand-border text-brand-text flex flex-col h-[90vh]">
        {/* Removed fixed max-h from here, will be controlled by ScrollArea or inner content */}
        <div className="mx-auto w-full max-w-md flex flex-col flex-grow overflow-hidden">
          <DrawerHeader className="flex justify-between items-center shrink-0">
            <div>
              <DrawerTitle className="text-brand-text-emphasis">Settings</DrawerTitle>
              <DrawerDescription className="text-brand-text-muted">
                Manage your preferences and account.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" className="text-brand-text-muted hover:text-brand-text">
                <Icon.X className="h-5 w-5" />
              </Button>
            </DrawerClose>
          </DrawerHeader>
          <ScrollArea className="p-4 flex-grow">
            <div className="space-y-3">
              {/* Example: Directly embedding UserProfileCard for now */}
              <UserProfileCard className="bg-brand-background border-brand-border" />
              <ApiKeysTab isProUser={false} className="bg-brand-background border-brand-border p-4 rounded-lg" />
              {/* You can map through settingsOptions to create more sections or buttons */}
            </div>
          </ScrollArea>
          {/* <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline" className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text">Done</Button>
          </DrawerClose>
        </DrawerFooter> */}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

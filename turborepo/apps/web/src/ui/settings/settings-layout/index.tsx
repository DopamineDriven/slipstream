"use client";

import { Card, Icon } from "@t3-chat-clone/ui";
import { motion } from "motion/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/atoms/tabs";
import { ApiKeysTab } from "@/ui/settings/api-keys-tab";

const settingsTabs = [
  { value: "account", label: "Account", icon: Icon.User },
  { value: "customization", label: "Customization", icon: Icon.Palette },
  { value: "history", label: "History & Sync", icon: Icon.History },
  { value: "models", label: "Models", icon: Icon.KeyRound },
  { value: "apiKeys", label: "API Keys", icon: Icon.KeyRound },
  { value: "attachments", label: "Attachments", icon: Icon.Paperclip },
  { value: "contactUs", label: "Contact Us", icon: Icon.MessageCircleQuestion }
];

interface SettingsLayoutProps {
  activeTab?: string;
  className?: string;
}

export function SettingsLayout({
  activeTab = "apiKeys",
  className = ""
}: SettingsLayoutProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`p-2 sm:p-4 md:p-6 ${className}`}>
      <Tabs defaultValue={activeTab} className="w-full">
        <TabsList className="bg-brand-component border-brand-border mb-6 grid w-full grid-cols-2 gap-1 rounded-lg border p-1 sm:grid-cols-3 sm:gap-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
          {settingsTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="data-[state=active]:bg-brand-primary data-[state=active]:text-brand-primary-foreground text-brand-text-muted hover:bg-brand-sidebar hover:text-brand-text h-auto flex-col px-2 py-2 sm:flex-row sm:justify-center sm:py-1.5">
                <Icon className="mb-1 size-4 sm:mr-2 sm:mb-0" />
                <span className="text-xs sm:text-sm">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Add TabsContent for each tab here. For now, only API Keys is implemented. */}
        <TabsContent value="account">
          <Card className="bg-brand-component border-brand-border text-brand-text p-6">
            Account Settings (Placeholder)
          </Card>
        </TabsContent>
        <TabsContent value="customization">
          <Card className="bg-brand-component border-brand-border text-brand-text p-6">
            Customization Settings (Placeholder)
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <Card className="bg-brand-component border-brand-border text-brand-text p-6">
            History & Sync Settings (Placeholder)
          </Card>
        </TabsContent>
        <TabsContent value="models">
          <Card className="bg-brand-component border-brand-border text-brand-text p-6">
            Models Settings (Placeholder)
          </Card>
        </TabsContent>
        <TabsContent value="apiKeys">
          <ApiKeysTab isProUser={false} />{" "}
          {/* Set to true to see the Pro version */}
        </TabsContent>
        <TabsContent value="attachments">
          <Card className="bg-brand-component border-brand-border text-brand-text p-6">
            Attachments Settings (Placeholder)
          </Card>
        </TabsContent>
        <TabsContent value="contactUs">
          <Card className="bg-brand-component border-brand-border text-brand-text p-6">
            Contact Us (Placeholder)
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

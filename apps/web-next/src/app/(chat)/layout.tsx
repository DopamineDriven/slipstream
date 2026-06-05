import React from "react";
import { redirect } from "next/navigation";
import { AIChatProvider } from "@/context/ai-chat-context";
import { ApiKeysProvider } from "@/context/api-keys-context";
import { AssetProvider } from "@/context/asset-context";
import { ChatWebSocketProvider } from "@/context/chat-ws-context";
import { ImageGenProvider } from "@/context/image-gen-context";
import { TTSProvider } from "@/context/tts-context";
import { ModelSelectionProvider } from "@/context/model-selection-context";
import { SettingsDrawerProvider } from "@/context/settings-drawer-context";
import { getSession } from "@/utils/auth";

export default async function AuthedLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  if (!session?.user) redirect("/auth/login");
  return (
    <ChatWebSocketProvider user={session.user}>
      <ModelSelectionProvider>
        <ApiKeysProvider>
          <SettingsDrawerProvider>
            <AssetProvider userId={session.user.id}>
              <ImageGenProvider>
                <TTSProvider>
                  <AIChatProvider userId={session.user.id}>
                    {children}
                  </AIChatProvider>
                </TTSProvider>
              </ImageGenProvider>
            </AssetProvider>
          </SettingsDrawerProvider>
        </ApiKeysProvider>
      </ModelSelectionProvider>
    </ChatWebSocketProvider>
  );
}

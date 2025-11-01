import React from "react";
import { redirect } from "next/navigation";
import { AIChatProvider } from "@/context/ai-chat-context";
import { ApiKeysProvider } from "@/context/api-keys-context";
import { SettingsDrawerProvider } from "@/context/settings-drawer-context";
import { AssetProvider } from "@/context/asset-context";
import { ChatWebSocketProvider } from "@/context/chat-ws-context";
import { ModelSelectionProvider } from "@/context/model-selection-context";
import { ImageGenProvider } from "@/context/image-gen-context";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
import { getSession } from "@/utils/auth";

const { prismaApiKeyService } = ormHandler(prismaClient);

export default async function AuthedLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {

  const session = await getSession();

  if (!session?.user) redirect("/auth/login");

  const fallbackData = await prismaApiKeyService.getClientApiKeys(
    session.user.id
  );
  return (
    <ChatWebSocketProvider user={session.user}>
      <ModelSelectionProvider>
        <ApiKeysProvider userId={session.user.id} fallbackData={fallbackData}>
          <SettingsDrawerProvider>
            <AssetProvider userId={session.user.id}>
              <ImageGenProvider>
                <AIChatProvider userId={session.user.id}>{children}</AIChatProvider>
              </ImageGenProvider>
            </AssetProvider>
          </SettingsDrawerProvider>
        </ApiKeysProvider>
      </ModelSelectionProvider>
    </ChatWebSocketProvider>
  );
}

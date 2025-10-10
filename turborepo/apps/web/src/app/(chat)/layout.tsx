import React from "react";
import { redirect } from "next/navigation";
import { AIChatProvider } from "@/context/ai-chat-context";
import { ApiKeysProvider } from "@/context/api-keys-context";
import { AssetProvider } from "@/context/asset-context";
import { ChatWebSocketProvider } from "@/context/chat-ws-context";
import { ConversationIdProvider } from "@/context/conversation-id-context";
import { ModelSelectionProvider } from "@/context/model-selection-context";
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
      <ConversationIdProvider>
        <ModelSelectionProvider>
          <ApiKeysProvider userId={session.user.id}>
            <AssetProvider userId={session.user.id}>
              <AIChatProvider userId={session.user.id}>{children}</AIChatProvider>
            </AssetProvider>
          </ApiKeysProvider>
        </ModelSelectionProvider>
      </ConversationIdProvider>
    </ChatWebSocketProvider>
  );
}

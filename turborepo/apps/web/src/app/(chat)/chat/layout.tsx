import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
import { ChatLayoutShell } from "@/ui/chat/chat-page-layout-shell";
import { getSession } from "@/utils/auth";

const { prismaConversationService, prismaApiKeyService } =
  ormHandler(prismaClient);
export const metadata: Metadata = {
  title: "Chat Home"
};

export default async function ChatLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await getSession();

  if (!session?.user) redirect("/auth/login");
  const [fallbackData, _initialApiKeyData] = await Promise.all([
    prismaConversationService.getSidebarData(session.user.id),
    prismaApiKeyService.getClientApiKeys(session.user.id)
  ]);
  return (
    <ChatLayoutShell fallbackData={fallbackData} userId={session.user.id}>
      {children}
    </ChatLayoutShell>
  );
}

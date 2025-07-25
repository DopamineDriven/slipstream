import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
import { ChatLayoutClient } from "@/ui/chat/chat-layout";
import { ChatLayoutShell } from "@/ui/chat/chat-page-layout-shell";

export const viewport = {
  colorScheme: "normal",
  userScalable: true,
  themeColor: "#020817",
  viewportFit: "auto",
  initialScale: 1,
  maximumScale: 1,
  width: "device-width"
} satisfies Viewport;

export const metadata: Metadata = {
  title: "Chat Home"
};

const { prismaConversationService } = ormHandler(prismaClient);

export default async function ChatLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await auth();

  if (!session?.user?.id) redirect("/api/auth/signin");

  const sidebardata = await prismaConversationService.getSidebarData(
    session.user.id
  );

  return (
    <ChatLayoutClient>
      <ChatLayoutShell user={session.user} sidebarData={sidebardata}>
        {children}
      </ChatLayoutShell>
    </ChatLayoutClient>
  );
}

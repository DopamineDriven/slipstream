import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ChatLayoutClient } from "@/ui/chat/chat-layout";
import { ChatLayoutShell } from "@/ui/chat/chat-page-layout-shell/experimental";

export const metadata: Metadata = {
  title: "Chat Home"
};

export default async function ChatLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <ChatLayoutClient>
      <ChatLayoutShell>
        {children}
      </ChatLayoutShell>
    </ChatLayoutClient>
  );
}

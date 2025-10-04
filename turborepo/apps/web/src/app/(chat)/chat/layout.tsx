import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ChatLayoutClient } from "@/ui/chat/chat-layout";
import { ChatLayoutShell } from "@/ui/chat/chat-page-layout-shell";

export const metadata: Metadata = {
  title: "Chat Home"
};

export default function ChatLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <ChatLayoutClient>
      <ChatLayoutShell>{children}</ChatLayoutShell>
    </ChatLayoutClient>
  );
}

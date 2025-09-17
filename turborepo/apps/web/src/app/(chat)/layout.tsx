import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ChatLayoutClient } from "@/ui/chat/chat-layout";

export const metadata: Metadata = {
  title: "Chat Home"
};

export default function ChatLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return <ChatLayoutClient>{children}</ChatLayoutClient>;
}

import type { Viewport } from "next";
import type { ReactNode } from "react";
import { ChatLayoutClient } from "@/ui/chat/chat-layout";

export const viewport = {
  colorScheme: "normal",
  userScalable: true,
  themeColor: "#020817",
  viewportFit: "auto",
  initialScale: 1,
  maximumScale: 1,
  width: "device-width"
} satisfies Viewport;

export default function ChatLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return <ChatLayoutClient>{children}</ChatLayoutClient>;
}

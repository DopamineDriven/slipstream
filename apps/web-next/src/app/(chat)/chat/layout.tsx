import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ChatLayoutShell } from "@/ui/chat/chat-page-layout-shell";
import { getSession } from "@/utils/auth";

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

  return <ChatLayoutShell user={session.user}>{children}</ChatLayoutShell>;
}

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
import { ChatInterface } from "@/ui/chat/dynamic/experimental";

export const dynamicParams = true;

export const viewport = {
  colorScheme: "normal",
  userScalable: true,
  themeColor: "#020817",
  viewportFit: "auto",
  initialScale: 1,
  maximumScale: 1,
  width: "device-width"
} satisfies Viewport;

export async function generateMetadata({
  params
}: {
  params: Promise<{ conversationId: string }>;
}): Promise<Metadata> {
  const { conversationId } = await params;
  if (conversationId !== "new-chat") {
    const initialMessages =
      await prismaConversationService.getMessagesByConversationId(
        conversationId
      );
    const title = prismaConversationService.sanitizeTitle(
      initialMessages?.title ?? "Untitled"
    );

    return {
      title
    };
  } else
    return {
      title: "New Chat"
    };
}

const { prismaConversationService } =
  ormHandler(prismaClient);

export default async function ConversationLayout({
  children,
  params
}: Readonly<{
  children: ReactNode;
  params: Promise<{ conversationId: string }>;
}>) {
  const session = await auth();
  const { conversationId } = await params;
  if (!session?.user?.id) redirect("/api/auth/signin");
  // get the data currently retrieved in the pages file
  // loads all preexisting messages on sidebar conversation title click -> navigate to chat events
  const initialMessages =
    await prismaConversationService.getMessagesByConversationId(conversationId);
  // we need to break ChatInterface into its data-driven parts which will be rendered here vs presentation (static) portions of the component that can be rendered in page.tsx
  return (
    <ChatInterface
      conversationId={conversationId}
      isNewChat={initialMessages?.messages.length === 0}
      conversationTitle={initialMessages?.title ?? "Untitled"}
      initialMessages={initialMessages?.messages}
      user={session.user}>
      {children}
    </ChatInterface>
  );
}

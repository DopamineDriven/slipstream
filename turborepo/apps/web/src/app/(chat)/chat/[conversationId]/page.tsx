import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
import { ChatAreaSkeleton } from "@/ui/chat/chat-area-skeleton";
import { ChatContent } from "@/ui/chat/chat-input";
import { ChatInterface } from "@/ui/chat/dynamic";
import type { InferGSPRT } from "@t3-chat-clone/types";

// Create once at module level
const { prismaConversationService } = ormHandler(prismaClient);

export const dynamicParams = true;

export async function generateStaticParams() {
  return [{ conversationId: "new-chat" }];
}

export async function generateMetadata({
  params
}: InferGSPRT<typeof generateStaticParams>): Promise<Metadata> {
  const { conversationId } = await params;
  if (conversationId !== "new-chat") {
    const title =
      await prismaConversationService.getTitleByConversationId(conversationId);
    return {
      title
    };
  }
  return {
    title: "New Chat"
  };
}

export default async function ChatPage({
  params
}: InferGSPRT<typeof generateStaticParams>) {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");

  const { conversationId } = await params;

  // Fetch data directly on the server
  let messages = null;
  let conversationTitle = null;

  if (conversationId !== "new-chat") {
    const data =
      await prismaConversationService.getMessagesByConversationId(
        conversationId
      );

    if (data) {
      messages = data.messages;
      conversationTitle = data.title;
    }
  }
  return (
    <Suspense
      fallback={
        <div className="flex h-full flex-col">
          <ChatAreaSkeleton />
          <ChatContent user={session.user} conversationId={conversationId} />
        </div>
      }>
      <ChatInterface
        initialMessages={messages}
        conversationTitle={conversationTitle}
        conversationId={conversationId}
        user={session.user}>
        <ChatContent user={session.user} conversationId={conversationId} />
      </ChatInterface>
    </Suspense>
  );
}

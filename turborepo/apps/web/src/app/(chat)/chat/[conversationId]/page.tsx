import type { DynamicChatRouteProps } from "@/types/shared";
import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
import { ChatAreaSkeleton } from "@/ui/chat/chat-area-skeleton";
import { ChatInterface } from "@/ui/chat/dynamic";
import type { InferGSPRT } from "@t3-chat-clone/types";

// Create once at module level
const { prismaConversationService } = ormHandler(prismaClient);

export const dynamicParams = true;
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return [{ conversationId: "new-chat" }, { conversationId: "home" }];
}

export async function generateMetadata({
  params
}: InferGSPRT<typeof generateStaticParams>): Promise<Metadata> {
  const { conversationId } = await params;
  if (conversationId !== "new-chat" && conversationId !== "home") {
    const title =
      await prismaConversationService.getTitleByConversationId(conversationId);
    return {
      title
    };
  } else if (conversationId === "home") {
    return {
      title: "Home"
    };
  }
  return {
    title: "New Chat"
  };
}

export default async function ChatPage({
  params
}: InferGSPRT<typeof generateStaticParams>) {
  const { conversationId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");

  // Fetch data directly on the server
  let messages: DynamicChatRouteProps | null = null;
  let conversationTitle: string | null = null;
  if (conversationId !== "new-chat" && conversationId !== "home") {
    const data =
      await prismaConversationService.getMessagesByConversationIdWithAssets(
        conversationId
      );

    if (data) {
      messages = data.messages.map(t => {
        const { attachments, ...rest } = t;
        const cleanAttachments = attachments.map(att => ({
          ...att,
          size: att.size ? Number(att.size) : null
        }));
        return { ...rest, attachments: cleanAttachments };
      });
      conversationTitle = data.title;
    }
  }

  return (
    <Suspense fallback={<ChatAreaSkeleton />}>
      <ChatInterface
        initialMessages={messages}
        conversationTitle={conversationTitle}
        conversationId={conversationId}
        user={session.user}
      />
    </Suspense>
  );
}

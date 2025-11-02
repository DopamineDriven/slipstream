import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
import { ChatAreaSkeleton } from "@/ui/chat/chat-area-skeleton";
import { ChatInterface } from "@/ui/chat/dynamic";
import { getSession } from "@/utils/auth";
import type { InferGSPRT, Provider } from "@slipstream/types";

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
  const session = await getSession();
  if (!session?.user?.id) redirect("/auth/login");

  // Fetch data directly on the server
  let messages,
    conversationTitle: string | null = null,
    lastActiveProvider: null | Provider = null,
    lastActiveModel: string | null = null;

  if (conversationId !== "new-chat" && conversationId !== "home") {
    const data =
      await prismaConversationService.getMessagesByConversationIdWithAssets(
        conversationId
      );

    if (data) {
      const m = data.messages.map((t, o) => {
        if (o === data.messages.length - 1) {
          lastActiveProvider = t.provider.toLowerCase() as Provider;
          lastActiveModel = t.model;
        }
        const { attachments, ...rest } = t;
        const cleanAttachments = attachments.map(att => ({
          ...att,
          image: att.image ?? null,
          document: att.document ?? null,
          size: att.size ? Number(att.size) : null
        }));
        return { ...rest, attachments: cleanAttachments };
      });
      messages = m;
      conversationTitle = data.title;
    }
  }

  return (
    <Suspense fallback={<ChatAreaSkeleton />}>
      <ChatInterface
        initialMessages={messages ?? null}
        conversationTitle={conversationTitle}
        conversationId={conversationId}
        lastModel={lastActiveModel}
        lastProvider={lastActiveProvider}
        user={session.user}
      />
    </Suspense>
  );
}

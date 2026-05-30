import type { Metadata } from "next";
import { Suspense } from "react";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
import { ChatAreaSkeleton } from "@/ui/chat/chat-area-skeleton";
import { ChatInterface } from "@/ui/chat/dynamic";
import type { InferGSPRT } from "@slipstream/types";

const { prismaConversationService } = ormHandler(prismaClient);

export const dynamicParams = true;
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return [{ conversationId: "new-chat" }, { conversationId: "home" }];
}

export async function generateMetadata({
  params
}: InferGSPRT<typeof generateStaticParams>): Promise<Metadata> {
  return await prismaConversationService.handleMetadata({ params });
}

export default async function ChatPage({
  params
}: InferGSPRT<typeof generateStaticParams>) {
  const { conversationId } = await params;
  const props =
    await prismaConversationService.getConversationRouteProps(conversationId);

  return (
    <Suspense fallback={<ChatAreaSkeleton />}>
      <ChatInterface {...props} />
    </Suspense>
  );
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
import { InferGSPRT } from "@/types/next";
import { ChatInterface } from "@/ui/chat/dynamic";
import { Conversation, Message } from "@prisma/client";

const { prismaConversationService, prismaApiKeyService } =
  ormHandler(prismaClient);

// need the user to be authed for these paths to be generated
export const dynamicParams = true;
// only generate `/new-chat` at build time -- need an authenticated user for other conversations to be generated
// this mirrors the pattern used for a conversationId placeholder on new chat, (new-chat) that is used by the server
// to signal that it needs to generate a new conversation as opposed to updating an existing one
export async function generateStaticParams() {
  return [{ conversationId: "new-chat" }];
}

export default async function ChatPage({
  params,
  searchParams
}: InferGSPRT<typeof generateStaticParams> & {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const { conversationId } = await params;
  const { prompt } = await searchParams;
  const session = await auth();

  if (!session?.user) return redirect("/api/auth/signin");
  if (conversationId === "new-chat" && typeof prompt === "undefined")
    return redirect("/");

  const providerConfig = await prismaApiKeyService.getClientApiKeys(
    session.user.id
  );

  let initialMessages:
    | (Conversation & {
        messages: Message[];
      })
    | null = null;

  if (conversationId !== "new-chat") {
    initialMessages =
      await prismaConversationService.getMessagesByConversationId(
        conversationId
      );
  }

  return (
    <Suspense fallback={"Loading..."}>
        <ChatInterface
          user={session.user}
          apiKeys={providerConfig}
          isNewChat={conversationId === "new-chat"}
          conversationTitle={initialMessages?.title ?? undefined}
          initialMessages={initialMessages?.messages ?? undefined}
          conversationId={conversationId}
          initialPrompt={prompt}
        />
    </Suspense>
  );
}

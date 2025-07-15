import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
import { InferGSPRT } from "@/types/next";
import { ChatPage as ChatPageWorkup } from "@/ui/clone";

const { prismaConversationService, prismaApiKeyService } =
  ormHandler(prismaClient);

// need the user to be authed for these paths to be generated
export const dynamicParams = true;
// only generate `/new-chat` at build time -- need an authenticated user for other conversations to be generated
// this mirrors the pattern used for a conversationId placeholder on new chat, (new-chat) that is used by the server
// to signal that it needs to generate a new conversation as opposed to updating an existing one
export async function generateStaticParams() {
  const arr = Array.of<string>();
  arr.push("/new-chat");
  try {
    const sesh = await auth();
    if (!sesh?.user) return arr.map(t => ({ conversationId: t }));
    const conversations =
      await prismaConversationService.getRecentConversationsByUserId(
        sesh.user.id
      );
    conversations.forEach(function (t) {
      arr.push(t.id);
      t.id;
    });
  } catch (err) {
    console.warn(err);
  } finally {
    return arr.map(conversationId => {
      return {
        conversationId
      };
    });
  }
}

export default async function ChatPage({
  params
}: InferGSPRT<typeof generateStaticParams>) {
  const { conversationId } = await params;
  const session = await auth();

  if (!session?.user) return redirect("/api/auth/signin");

  const providerConfig = await prismaApiKeyService.getClientApiKeys(
    session.user.id
  );
  const conversationDetails =
    await prismaConversationService.getMessagesByConversationId(conversationId);

  const recentConvos =
    await prismaConversationService.getRecentConversationsByUserId(
      session.user.id
    );

  return (
    <Suspense fallback={"Loading..."}>
      {/* need to resolve how to distinguish the chat home page from chat pages with specific conversation ids (home page is where there re suggestions on desktop and no chat started yet?)  */}
      <ChatPageWorkup
        user={session.user}
        providerConfig={providerConfig}
        conversationDetails={conversationDetails}
        recentConvos={recentConvos}
      />
    </Suspense>
  );
}

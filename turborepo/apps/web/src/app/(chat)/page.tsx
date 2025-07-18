import type { Metadata } from "next";
import type { Session } from "next-auth";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
// import { ChatPage } from "@/ui/clone";
import { ChatLayoutShell } from "@/ui/chat/chat-page-layout-shell";
import { ChatEmptyState } from "@/ui/chat/empty-chat-shell";

export const metadata:Metadata = {
  title: "Chat Home"
};

const { prismaConversationService } =
  ormHandler(prismaClient);

export default async function HomePage() {
  const session = (await auth()) satisfies Session | null;

  if (!session?.user) return redirect("/api/auth/signin");


  const recentConvos =
    await prismaConversationService.getRecentConversationsByUserId(
      session.user.id
    );
  return (
    <Suspense fallback={"Loading..."}>
      <ChatLayoutShell user={session.user} recentConvos={recentConvos}>
        <ChatEmptyState   user={session.user} />
      </ChatLayoutShell>
    </Suspense>
  );
}

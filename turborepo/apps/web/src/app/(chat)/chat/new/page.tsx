import type { Metadata } from "next";
import type { Session } from "next-auth";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
import { ChatPage } from "@/ui/clone";

export const metadata = {
  title: "new chat"
} satisfies Metadata;

const { prismaApiKeyService, prismaConversationService } =
  ormHandler(prismaClient);

export default async function HomePage() {
  const session = (await auth()) satisfies Session | null;

  if (!session?.user) return redirect("/api/auth/signin");

  const providerConfig = await prismaApiKeyService.getClientApiKeys(
    session.user.id
  );
  const recentConvos =
    await prismaConversationService.getRecentConversationsByUserId(
      session.user.id
    );

  return (
    <Suspense fallback={"Loading..."}>
      <ChatPage user={session.user} providerConfig={providerConfig} recentConvos={recentConvos} />
    </Suspense>
  );
}

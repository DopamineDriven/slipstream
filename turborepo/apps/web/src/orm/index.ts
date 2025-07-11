import type { PrismaClientWithAccelerate } from "@/lib/prisma";
import { PrismaUserKeyService } from "@/orm/user-key-service";
import { PrismaUserMessageService } from "@/orm/user-message-service";

interface OrmServiceEntity {
  prismaApiKeyService: PrismaUserKeyService;
  prismaConversationService: PrismaUserMessageService;
}

/**
 *
 * to use, you import this ormHandler to a page file (app/page.tsx, for example) and import the prisma client from "@/lib/prisma", eg:
 *
 * ```tsx
 *import type { Metadata } from "next";
import type { Session } from "next-auth";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
import { ChatPage } from "@/ui/clone";

export const metadata = {
  title: "t3 clone home"
} satisfies Metadata;

const { prismaApiKeyService } = ormHandler(prismaClient);

export default async function HomePage() {
  const session = (await auth()) satisfies Session | null;

  if (!session?.user) return redirect("/api/auth/signin");
  const providerConfig = await prismaApiKeyService.getClientApiKeys(
    session.user.id
  );
  return (
    <Suspense fallback={"Loading..."}>
      <ChatPage user={session.user} providerConfig={providerConfig} />
    </Suspense>
  );
}

 *
 * ```
 *
 */
export function ormHandler(
  prisma: PrismaClientWithAccelerate
): OrmServiceEntity {
  return {
    prismaApiKeyService: new PrismaUserKeyService(prisma),
    prismaConversationService: new PrismaUserMessageService(prisma)
  };
}

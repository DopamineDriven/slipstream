"use server";

import type {  User } from "next-auth";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";

export async function getSideBarDataAction(
  skip = 0,
  take = 20
): Promise<{
  user: User;
  conversations: { id: string; title: string; updatedAt: Date }[];
  totalCount: number;
  hasMore: boolean;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin");
  }

  const { prismaConversationService } = ormHandler(prismaClient);

  // Parallel queries for better performance
  const [conversations, totalCount] = await Promise.all([
    prismaConversationService.getRecentConversationsByUserId(session.user.id, {
      skip,
      take
    }),
    prismaConversationService.convoCounts(session.user.id)
  ]);

  return {
    user: session.user,
    conversations: conversations.map(c => ({
      id: c.id,
      title: c.title ?? "Untitled",
      updatedAt: c.updatedAt
    })),
    totalCount,
    hasMore: skip + take < totalCount
  };
}

export async function deleteConversationAction(conversationId: string) {
  const { prismaConversationService } = ormHandler(prismaClient);
  return await prismaConversationService.deleteConversation(conversationId);
}

export async function updateConversationTitleAction(
  conversationId: string,
  updatedTitle: string
) {
  const { prismaConversationService } = ormHandler(prismaClient);
  return await prismaConversationService.updateConversationTitle(
    conversationId,
    updatedTitle
  );
}

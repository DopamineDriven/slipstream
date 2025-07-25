"use server";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";

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

"use server";

import { prismaClient } from "@/lib/prisma";

/**
 * Ensure there is a Conversation row for this id+user.
 * If it already exists, this is a no-op.
 */
export async function ensureConversation(
  conversationId: string,
  userId: string
) {
  await prismaClient.conversation.upsert({
    where: { id: conversationId },
    update: {},
    create: {
      id: conversationId,
      userId,
      title: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  });
}

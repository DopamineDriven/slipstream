import { redirect, unauthorized } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { CONVERSATION_PAGE_SIZE } from "@/lib/conversation-pages";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
import { getSession } from "@/utils/auth";

export const fetchCache = "force-no-store";
export const revalidate = 0;

const { prismaConversationService: p } = ormHandler(prismaClient);

export async function GET(
  _req: NextRequest,
  {
    params
  }: {
    params: Promise<{
      userId: string;
      conversationId: string;
      cursorId: string;
    }>;
  }
) {
  const { userId, conversationId, cursorId } = await params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      {
        redirect("/auth/login");
      }
    }
    if (session.user.id !== userId) {
      unauthorized();
    }

    const cursorOrdinal = Number(cursorId);
    if (!Number.isInteger(cursorOrdinal) || cursorOrdinal < 0) {
      return NextResponse.json(
        { error: `Invalid cursor "${cursorId}"` },
        { status: 400 }
      );
    }

    const page = await p.getConversationMessagesPage(
      conversationId,
      CONVERSATION_PAGE_SIZE,
      cursorOrdinal
    );

    return NextResponse.json(page);
  } catch (error) {
    console.error(
      `Error fetching more messages in conversation ${conversationId} after cursor ${cursorId}:`,
      error
    );
    return NextResponse.json(
      {
        error: `Failed to fetch more messages in conversation ${conversationId} after cursor ${cursorId}`
      },
      { status: 500 }
    );
  }
}

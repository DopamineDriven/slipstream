import { redirect, unauthorized } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
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

    const msgs = await p.getMessagesByCursor(
      conversationId,
      25,
      cursorId
    );

    return NextResponse.json(msgs);
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

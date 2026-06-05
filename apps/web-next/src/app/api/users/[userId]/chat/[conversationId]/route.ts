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
  { params }: { params: Promise<{ userId: string; conversationId: string }> }
) {
  const { userId, conversationId } = await params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      {
        redirect("/auth/login");
      }
    }
    const expiryUnixEpoch = new Date(session.session.expiresAt).getTime();
    if (new Date(Date.now()).getTime() > expiryUnixEpoch) {
      redirect("/auth/login");
    }
    // Ensure user can only access their own conversations
    if (session.user.id !== userId) {
      unauthorized();
    }

    const page = await p.getConversationMessagesPage(conversationId, 25);

    return NextResponse.json(page);
  } catch (error) {
    console.error(`Error fetching conversation ${conversationId}:`, error);
    return NextResponse.json(
      { error: `Failed to fetch conversation ${conversationId}` },
      { status: 500 }
    );
  }
}

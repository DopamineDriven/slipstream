import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      redirect("/api/auth/signin");
    }

    // Ensure user can only access their own conversations
    if (session.user.id !== params.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { prismaConversationService } = ormHandler(prismaClient);
    const conversations = await prismaConversationService.getSidebarData(
      params.userId
    );

    return NextResponse.json(conversations);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}

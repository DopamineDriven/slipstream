// app/api/users/[userId]/conversations/[conversationId]/route.ts
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";

export const fetchCache = "force-no-store";
export const revalidate = 0;

const { prismaConversationService } = ormHandler(prismaClient);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string; conversationId: string }> }
) {
  const { userId, conversationId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      redirect("/api/auth/signin");
    }

    // Ensure user can only access their own conversations
    if (session.user.id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const conversations =
      await prismaConversationService.getMessagesByConversationId(
        conversationId
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; conversationId: string }> }
) {
  const { userId, conversationId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      redirect("/api/auth/signin");
    }

    if (session.user.id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = (await request.json()) as { title: string };
    const { title } = body;

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const updatedConversation =
      await prismaConversationService.updateConversationTitle(
        conversationId,
        title
      );

    return NextResponse.json({
      id: updatedConversation.id,
      title: updatedConversation.title ?? "Untitled",
      updatedAt: updatedConversation.updatedAt
    });
  } catch (error) {
    console.error("Error updating conversation title:", error);
    return NextResponse.json(
      { error: "Failed to update conversation title" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string; conversationId: string }> }
) {
  const { userId, conversationId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      redirect("/api/auth/signin");
    }

    if (session.user.id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await prismaConversationService.deleteConversation(conversationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    return NextResponse.json(
      { error: "Failed to delete conversation" },
      { status: 500 }
    );
  }
}

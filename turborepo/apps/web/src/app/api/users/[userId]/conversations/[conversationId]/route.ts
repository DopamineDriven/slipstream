// app/api/users/[userId]/conversations/[conversationId]/route.ts
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";

const { prismaConversationService } = ormHandler(prismaClient);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string; conversationId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      redirect("/api/auth/signin");
    }

    if (session.user.id !== params.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = (await request.json()) as { title: string };
    const { title } = body;

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const updatedConversation =
      await prismaConversationService.updateConversationTitle(
        params.conversationId,
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
  request: NextRequest,
  { params }: { params: { userId: string; conversationId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      redirect("/api/auth/signin");
    }

    if (session.user.id !== params.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await prismaConversationService.deleteConversation(params.conversationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    return NextResponse.json(
      { error: "Failed to delete conversation" },
      { status: 500 }
    );
  }
}

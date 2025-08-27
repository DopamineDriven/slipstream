import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";

const { prismaApiKeyService } = ormHandler(prismaClient);

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      redirect("/api/auth/signin");
    }

    // Ensure user can only access their own conversations
    if (session.user.id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

  const apiKeysData = await prismaApiKeyService.getClientApiKeys(
    session.user.id
  );

    return NextResponse.json(apiKeysData);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}

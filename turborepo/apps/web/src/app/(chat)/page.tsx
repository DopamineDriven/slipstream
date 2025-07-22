import type { Metadata } from "next";
import type { Session } from "next-auth";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ChatEmptyState } from "@/ui/chat/empty-chat-shell";

export const metadata:Metadata = {
  title: "Chat Home"
};


export default async function HomePage() {
  const session = (await auth()) satisfies Session | null;

  if (!session?.user) return redirect("/api/auth/signin");

  return (
    <Suspense fallback={"Loading..."}>

        <ChatEmptyState   user={session.user} />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ChatPage } from "@/ui/clone";

export const metadata: Metadata = {
  title: "t3 clone home"
};

export default async function HomePage() {
  const session = await auth();
  if (!session) return redirect("/api/auth/signin");
  return (
    <Suspense fallback={"Loading..."}>
      <ChatPage user={session?.user} />
    </Suspense>
  );
}

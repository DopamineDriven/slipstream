import type { Metadata } from "next";
import type { Session } from "next-auth";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ChatPage } from "@/ui/clone";

export const metadata: Metadata = {
  title: "t3 clone home"
};

export default async function HomePage() {
  const session = (await auth()) satisfies Session | null;

  if (!session) return redirect("/api/auth/signin");
  // uncomment if expired sessions aren't being properly detected by next-auth
  // const exp = session.expires;
  // const isExpired =
  //   new Date(exp).getTime() - new Date(Date.now()).getTime() < 0;
  // if (isExpired) return redirect("/api/auth/signin");
  return (
    <Suspense fallback={"Loading..."}>
      <ChatPage user={session?.user} />
    </Suspense>
  );
}

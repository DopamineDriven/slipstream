import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { ChatPage } from "@/ui/clone";

export const metadata = {
  title: "t3 clone home"
}

export default async function HomePage() {
  const session = await auth();
  console.log(session?.user);

  return (
    <Suspense fallback={"Loading..."}>
      <ChatPage user={session?.user} />
    </Suspense>
  );
}

import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { LandingPage } from "@/ui/home";

export default async function HomePage() {
  const session = await auth();
  console.log(session?.user);
  return (
    <Suspense fallback={"Loading..."}>
      <LandingPage session={session} />
    </Suspense>
  );
}

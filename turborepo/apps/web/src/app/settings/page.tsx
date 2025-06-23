import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { default as SettingsPage } from "@/ui/settings";
import { redirect } from "next/navigation";

export const metadata = {
  title: "settings"
};

export default async function Settings() {
  const session = await auth();
  if (!session) return redirect("/api/auth/signin");
  return (
    <Suspense fallback={"Loading..."}>
      <SettingsPage user={session?.user} />
    </Suspense>
  );
}

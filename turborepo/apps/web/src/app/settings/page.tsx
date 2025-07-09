import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getClientApiKeys } from "@/orm/handle-keys";
import { default as SettingsPage } from "@/ui/settings";

export const metadata = {
  title: "settings"
};

export default async function Settings() {
  const session = await auth();
  if (!session?.user) return redirect("/api/auth/signin");
  const keyData = await getClientApiKeys(session.user.id);
  return (
    <Suspense fallback={"Loading..."}>
      <SettingsPage user={session?.user} initialData={keyData} />
    </Suspense>
  );
}

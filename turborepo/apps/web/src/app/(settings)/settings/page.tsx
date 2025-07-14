import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
import { default as SettingsPage } from "@/ui/settings";

export const metadata = {
  title: "settings"
};

const { prismaApiKeyService } = ormHandler(prismaClient);

export default async function Settings() {
  const session = await auth();
  if (!session?.user) return redirect("/api/auth/signin");

  const keyData = await prismaApiKeyService.getClientApiKeys(session.user.id);
  return (
    <Suspense fallback={"Loading..."}>
      <SettingsPage user={session?.user} initialData={keyData} />
    </Suspense>
  );
}

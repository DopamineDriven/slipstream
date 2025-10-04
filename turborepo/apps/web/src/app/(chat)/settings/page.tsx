import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/utils/auth";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
import { default as SettingsPage } from "@/ui/settings";

export const metadata: Metadata = {
  title: "settings"
};

const { prismaApiKeyService } = ormHandler(prismaClient);

export default async function Settings() {
  const session = await getSession();
  if (!session?.user) return redirect("/auth/login");

  const keyData = await prismaApiKeyService.getClientApiKeys(session.user.id);
  return (
    <Suspense fallback={"Loading..."}>
      <SettingsPage user={session?.user} initialData={keyData} />
    </Suspense>
  );
}

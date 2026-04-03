import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { default as SettingsPage } from "@/ui/settings";
import { getSession } from "@/utils/auth";
import { InferGSPRT } from "@slipstream/types";

export const dynamicParams = true;
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return [{ id: "user-id" }];
}

export async function generateMetadata({
  params
}: InferGSPRT<typeof generateStaticParams>): Promise<Metadata> {
  const { id } = await params;
  if (id !== "user-id") {
    const userName = id;
    return {
      title: userName + " | Settings"
    };
  } else {
    return {
      title: "Settings"
    };
  }
}

export default async function Settings({
  params
}: InferGSPRT<typeof generateStaticParams>) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/auth/login");
  if (session.user.id !== id) redirect("/auth/login");

  return (
    <Suspense fallback={"Loading..."}>
      <SettingsPage user={session?.user} />
    </Suspense>
  );
}

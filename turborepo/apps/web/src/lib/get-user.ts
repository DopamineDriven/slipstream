"use server";

import { auth } from "@/lib/auth";

export const ServerUser = async () => {
  const session = await auth();

  return session?.user ?? null;
};

import { redirect } from "next/navigation";
import { signOut } from "@/utils/auth-client";

export const signOutHelper = async () => {
  await signOut({
    fetchOptions: { onSuccess: redirect("/auth/login") }
  });
};

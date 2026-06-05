import { auth } from "@/utils/auth";
import {
  inferAdditionalFields,
  lastLoginMethodClient
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL,
  plugins: [
    inferAdditionalFields<typeof auth>(),
    // anonymousClient(),
    lastLoginMethodClient()
  ]
});

export type Sesh = typeof authClient.$Infer.Session;

export type User = (typeof authClient.$Infer.Session)["user"];

export const {
  signIn,
  signOut,
  useSession,
  isLastUsedLoginMethod,
  getLastUsedLoginMethod,
  clearLastUsedLoginMethod
} = authClient;

import { getSiteUrl } from "@/lib/site-url";
import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins"
export const authClient = createAuthClient({
  baseURL: getSiteUrl(process.env.NODE_ENV),
  plugins: [
    anonymousClient()
  ]
});

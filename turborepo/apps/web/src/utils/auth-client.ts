import { getSiteUrl } from "@/lib/site-url";
import {
  anonymousClient,
  inferAdditionalFields
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { auth } from "./auth";

export const authClient = createAuthClient({
  baseURL: getSiteUrl(process.env.NODE_ENV),
  plugins: [inferAdditionalFields<typeof auth>(), anonymousClient()]
});

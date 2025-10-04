import type { BetterAuthOptions } from "better-auth";
import { headers } from "next/headers";
import { prismaClient } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site-url";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { lastLoginMethod } from "better-auth/plugins";
import { anonymous } from "better-auth/plugins/anonymous";

// openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile
export const auth = betterAuth({
  trustedOrigins: ["http://localhost:3030"],
  database: prismaAdapter(prismaClient, {
    provider: "postgresql"
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? ""
    },
    google: {
      prompt: "select_account consent",
      accessType: "offline",
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? ""
    }
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: getSiteUrl(process.env.NODE_ENV),
  account: {
    accountLinking: {
      enabled: true
    },
    fields: {
      accountId: "providerAccountId",
      refreshToken: "refresh_token",
      accessToken: "access_token",
      accessTokenExpiresAt: "expires_at",
      idToken: "id_token",
      providerId: "provider"
    }
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    fields: {
      expiresAt: "expires", // (nextauth)`expires`->`expiresAt`(better auth)
      token: "sessionToken" // (nextauth)`sessionToken`->`token`(better auth)
    },
    cookieCache: {
      enabled: true,
      maxAge: 3600 * 24 // seconds
    }
  },
  user: { fields: { emailVerified: "email_verified" } },
  appName: "AI Coalesce",
  // can handle onLinkAccount in `anonymous()` options
  plugins: [
    lastLoginMethod({ storeInDatabase: true }),
    anonymous({
      emailDomainName: "aicoalesce.com",

      onLinkAccount: async ({ anonymousUser, newUser }) => {
        const { emailVerified, ...userNew } = newUser.user;
        // const {expiresAt, ...sessionNew} = newUser.session;
        await prismaClient.$transaction(async t => {
          await t.user.update({
            where: { id: anonymousUser.user.id },
            data: {
              emailVerified: emailVerified ? new Date(Date.now()) : null,
              ...userNew
            }
          });
        });
      }
    }),
    nextCookies()
  ]
} satisfies BetterAuthOptions);

export type Session = typeof auth.$Infer.Session;

export type User = (typeof auth.$Infer.Session)["user"];

export const getSession = async () => {
  "use cache";
  return await auth.api.getSession({
    headers: await headers()
  });
};

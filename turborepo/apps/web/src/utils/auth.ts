import type { BetterAuthOptions } from "better-auth";
import { cache } from "react";
import { headers } from "next/headers";
import { prismaClient } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site-url";
import jsonData from "@/utils/__out__/random-name-gen.json" with { type: "json" };
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { lastLoginMethod } from "better-auth/plugins";
import { anonymous } from "better-auth/plugins/anonymous";

// openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile
export const auth = betterAuth({
  trustedOrigins: [
    "http://localhost:3030",
    "https://chat.aicoalesce.com",
    "https://dev.chat.aicoalesce.com"
  ],
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
      accessTokenExpiresAt: "expiresAt",
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
  user: {
    fields: { emailVerified: "email_verified" }
    // additionalFields: {
    //   isAnonymous: { type: "boolean", input: true }
    // }
  },
  databaseHooks: {
    user: {
      create: {
        async after(user, _context) {
          if (!user.image) {
            await prismaClient.user.update({
              where: { id: user.id },
              data: {
                image:
                  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759541043761-doge-anonymous-avatar.png"
              }
            });
          } else return () => {};
        }
      }
    }
  },
  appName: "AI Coalesce",
  // can handle onLinkAccount in `anonymous()` options
  plugins: [
    lastLoginMethod({ storeInDatabase: true }),
    anonymous({
      emailDomainName: "aicoalesce.com",
      generateName: () => {
        const { prefixes, suffixes } = jsonData;
        const prefix =
          prefixes.at(Math.floor(Math.random() * prefixes.length)) ?? "Random";
        const suffix =
          suffixes.at(Math.floor(Math.random() * suffixes.length)) ?? "User";
        return `${prefix} ${suffix}`;
      },
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        const { emailVerified, ...userNew } = newUser.user;

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

export const getSession = cache(async () => {
  return await auth.api.getSession({
    headers: await headers()
  });
});

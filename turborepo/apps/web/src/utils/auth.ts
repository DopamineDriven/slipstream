import { prismaClient } from "@/lib/prisma";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { anonymous } from "better-auth/plugins/anonymous";

export const auth = betterAuth({
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
  // can handle onLinkAccount in `anonymous()` options
  plugins: [
    anonymous({
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
    })
  ]
});

/**
 * TODO
 * RE-ADD THE FOLLOWING TO `app/api/auth/[...all]/route.ts`
 *
 import { auth } from "@/utils/auth";
 import { toNextJsHandler } from "better-auth/next-js";

 export const { POST, GET } = toNextJsHandler(auth);
 */

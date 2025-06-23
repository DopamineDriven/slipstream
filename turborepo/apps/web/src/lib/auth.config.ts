import type { NextAuthConfig } from "next-auth";
import type { GoogleProfile } from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import { prismaClient } from "@/lib/prisma";

export const authConfig = <NextAuthConfig>{
  adapter: PrismaAdapter(prismaClient),
  providers: [
    Google<GoogleProfile>({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: { access_type: "offline", prompt: "consent" }
      },
      async profile(profile) {
        return {...profile}
      }
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60
  },
  trustHost: true,
  debug: true
};

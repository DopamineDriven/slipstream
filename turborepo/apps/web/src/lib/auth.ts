// pages/api/auth/[...nextauth].ts
import type { NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import prismaClient from "@/lib/prisma";

export const {
  auth,
  signIn,
  signOut,
  unstable_update,
  handlers: { GET, POST }
} = NextAuth(req => {
  console.log(JSON.stringify(req?.headers.entries(), null, 2));
  return {
    adapter: PrismaAdapter(prismaClient),
    ...authConfig
  } as NextAuthConfig;
});

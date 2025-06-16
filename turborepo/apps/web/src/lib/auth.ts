// pages/api/auth/[...nextauth].ts
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { prismaClient } from "@/lib/prisma";

export const {
  auth,
  handlers: { GET, POST }
} = NextAuth({
    adapter: PrismaAdapter(prismaClient),
    ...authConfig
  });

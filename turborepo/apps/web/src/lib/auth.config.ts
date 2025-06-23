import type { NextAuthConfig } from "next-auth";
// pages/api/auth/[...nextauth].ts
import type { GoogleProfile } from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Passkey from "next-auth/providers/passkey";

export const authConfig = <NextAuthConfig>{
  providers: [
    Passkey,
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
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      profile(profile) {
        return {
          id: profile.id.toString(),
          name: profile.name ?? profile.login,
          email: profile.email,
          image: profile.avatar_url
        }
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60
  },
  experimental: { enableWebAuthn: true },
  trustHost: true,
  debug: true
};

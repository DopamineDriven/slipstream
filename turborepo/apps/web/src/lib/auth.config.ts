import type { NextAuthConfig } from "next-auth";
// pages/api/auth/[...nextauth].ts
import type { JWT as NextAuthJWT } from "next-auth/jwt";
import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import type { GoogleProfile } from "@auth/core/providers/google";

export interface AccessTokenSuccess {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope?: string;
}

export interface AccessTokenError {
  error_description?: string;
  error_uri?: string;
  error: string;
}

/**
 * see https://www.oauth.com/oauth2-servers/access-tokens/access-token-response/
 */
export type AccessTokenResUnion = AccessTokenError | AccessTokenSuccess;

export const authConfig = <NextAuthConfig>{
  providers: [
    Google<GoogleProfile>({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: { access_type: "offline", prompt: "consent" }
      }
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET
    })
  ],
  session: {
    strategy: "jwt"
  },
  secret: process.env.AUTH_SECRET,
  callbacks: {
    async jwt({ token, account, user }) {
      if (user.id) {
        token.id = user.id;
      }
      if (account) {
        return {
          ...token,
          provider: account.provider,
          access_token: account.access_token ?? token.access_token,
          expires_at: account.expires_at ?? token.expires_at,
          refresh_token: account.refresh_token ?? token.refresh_token
        };
      }
      if (token?.provider !== "google") return token;
      if (Date.now() < (token as NextAuthJWT).expires_at * 1000) {
        return token;
      }
      // Otherwise, refresh it
      if (!token.refresh_token) {
        throw new Error("Missing refresh token");
      }
      try {
        const resp = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.AUTH_GOOGLE_ID ?? "",
            client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
            grant_type: "refresh_token",
            refresh_token: token.refresh_token
          })
        });
        const data = (await resp.json()) as AccessTokenResUnion;
        if ("error" in data) {
          throw new Error(
            data.error_description ?? `Token endpoint returned ${resp.status}`,
            { cause: data }
          );
        } else {
          return {
            ...token,
            access_token: data.access_token,
            expires_at: Math.floor(Date.now() / 1000 + data.expires_in),
            refresh_token: data.refresh_token ?? token.refresh_token
          };
        }
      } catch (err) {
        console.error("RefreshTokenError", err);
        return { ...token, error: "RefreshTokenError" };
      }
    },
    async session({ session, token }) {
      // Expose any error and fresh access token in session
      session.error = token.error;
      session.accessToken = token.access_token;
      session.user.id = token.id;
      return session;
    }
  }
};

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    provider?: string;
    access_token: string;
    expires_at: number; // seconds
    refresh_token?: string;
    error?: "RefreshTokenError";
  }
}

declare module "@auth/core/types" {
  interface DefaultUser {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    createdAt?: string;
    updatedAt?: string;
  }
  interface Session {
    error?: "RefreshTokenError";
    accessToken?: string;
  }
}

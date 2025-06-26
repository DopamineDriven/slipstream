import type { JWT as NextAuthJWT } from "next-auth/jwt";
import { nanoid } from "nanoid";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { prismaClient } from "@/lib/prisma";

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
export const {
  signIn,
  signOut,
  auth,
  handlers: { GET, POST }
} = NextAuth({
  ...authConfig,
  events: {
    async signOut(message) {
      if ("token" in message) {
        const seshToken = message.token?.sessionToken;
        await prismaClient.session.delete({
          where: { sessionToken: seshToken ?? "" }
        });
      }
    }
  },
  secret: process.env.AUTH_SECRET,
  callbacks: {
    async authorized(params) {
      const s = JSON.stringify(params, null, 2);
      console.info(`[authorizedCallback]: ` + s);
      if (!params.auth?.user) {
        return false;
      } else {
        return true;
      }
    },
    async jwt({ token, account, user, trigger, profile: _profile }) {
      if ((trigger === "signIn" || trigger === "signUp") && user && account) {
        const sessionToken = nanoid();

        token.sessionToken = sessionToken;
        token.userId = user.id;
        const expires = account.expires_at
          ? new Date(account.expires_at * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // fallback 30d
        await prismaClient.user.update({
          where: { email: token.email ?? "", id: user.id ?? "" },
          data: {
            emailVerified: new Date(Date.now()),
            updatedAt: new Date(Date.now())
          }
        });
        await prismaClient.session.create({
          data: {
            userId: user.id ?? "",
            sessionToken,
            expires
          }
        });
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
          const newExpiresAt = Math.floor(Date.now() / 1000 + data.expires_in);
          token.access_token = data.access_token;
          token.expires_at = newExpiresAt;
          token.refresh_token = data.refresh_token ?? token.refresh_token;
          if (token?.sessionToken) {
            await prismaClient.session.update({
              where: { sessionToken: token.sessionToken },
              data: { expires: new Date(newExpiresAt * 1000) }
            });
          }
          return token;
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
      if (session.user && token.userId) {
        session.user.id = token.userId;
        session.userId = session.user.id;
      } // next auth has a gross Date & string cast for the expires field...impossible for that to ever happen, so we have to cast
      session.expires = new Date(
        token.expires_at * 1000
      ).toISOString() as unknown as Date & string;
      return session;
    }
  }
});

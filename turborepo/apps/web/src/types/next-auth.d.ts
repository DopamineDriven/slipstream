import type { DefaultSession, DefaultUser } from "next-auth";


declare module "next-auth" {
  interface Session extends DefaultSession {
    expires: DefaultSession["expires"];
    accessToken?: string;
    sessionToken?: string;
    error?: "RefreshTokenError";
  }
  interface User extends Omit<DefaultUser, "id"> {
    id: string;
    createdAt?: string;
    updatedAt?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    provider?: string;
    access_token: string;
    expires_at: number; // seconds
    refresh_token?: string;
    sessionToken?: string;
    error?: "RefreshTokenError";
  }
}

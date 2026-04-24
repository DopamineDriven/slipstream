import { redirect } from "next/navigation";

export type SessionFunc = () => Promise<{
  session: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    expiresAt: Date;
    token: string;
    ipAddress?: string | null | undefined;
    userAgent?: string | null | undefined;
  };
  user: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    email: string;
    emailVerified: boolean;
    name: string;
    image?: string | null | undefined;
    lastLoginMethod?: string | null | undefined;
  };
} | null>;

export async function sessionHelper(getSession: SessionFunc) {
  const session = await getSession();
  if (!session?.user?.id) {
    {
      redirect("/auth/login");
    }
  }
  const expiryUnixEpoch = new Date(session.session.expiresAt).getTime();
  if (new Date(Date.now()).getTime() > expiryUnixEpoch) {
    redirect("/auth/login");
  }
  return session;
}

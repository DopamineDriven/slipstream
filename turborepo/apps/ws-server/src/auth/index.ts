import { Credentials } from "@slipstream/credentials";
import { jwtVerify } from "jose";

// hardcoded-string for local dev fallback only as it's truly useless -- generated with openssl rand -base64 32
// the production secret is generated with openssl rand -base64 64 (64 bit random secret as opposed to the 32 bit secret shown below)

export async function verifyJWT(
  token: string
): Promise<null | { sub: string }> {
  const JWT_SECRET = await new Credentials().get("JWT_SECRET");
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    const sub = payload.sub;
    if (!sub) throw new Error(`JWT payload missing sub (user id)`);

    return { sub };
  } catch (err) {
    if (err instanceof Error) throw new Error(err.message);
    else return null;
  }
}

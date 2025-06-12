import { jwtVerify } from "jose";

// hardcoded-string for local dev fallback only as it's truly useless -- generated with openssl rand -base64 32
// the production secret is generated with openssl rand -base64 64 (64 bit random secret as opposed to the 32 bit secret shown below)
const JWT_SECRET =
  process.env.JWT_SECRET ?? "QzItEuoPfuEZyoll41Zw8x+l0/8jSJxZYbpQ76dk4vI=";

export async function verifyJWT(
  token: string
): Promise<null | { sub: string }> {
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

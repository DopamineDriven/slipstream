import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { detectDeviceAndSetCookies } from "@/lib/server-cookies";

export const config = {
  matcher: [
    // api excluded — Set-Cookie on an API response voids Vercel CDN
    // caching (s-maxage on /api/stats was being replaced with max-age=0);
    // the page document request owns cookie stamping for the domain
    "/((?!api|_next/static|_next/image|favicon.ico|opengraph-image|twitter-image).*)"
  ]
};

export default async function proxy(req: NextRequest) {
  return detectDeviceAndSetCookies(req, NextResponse.next());
}

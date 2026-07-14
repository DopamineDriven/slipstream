import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {detectDeviceAndSetCookies} from "@/lib/server-cookies";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|twitter-image).*)"
  ]
};

const EU_EEA_COUNTRY_CODES = [
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
  "IS",
  "LI",
  "NO",
  "GF",
  "GP",
  "MQ",
  "YT",
  "RE",
  "MF"
] as const;

const UNSUPPORTED_SET = new Set<string>(EU_EEA_COUNTRY_CODES);

const UNSUPPORTED_PATH = "/unsupported-region/check-back";

function isUnsupportedCountry(country: string | null | undefined) {
  if (!country) return true;
  return UNSUPPORTED_SET.has(country.toUpperCase());
}
function resolveResponse(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const country =
    req.headers.get("x-vercel-ip-country") ??
    (process.env.NODE_ENV === "development" ? "US" : undefined);

  const onUnsupportedPath =
    pathname === UNSUPPORTED_PATH ||
    pathname.startsWith(`${UNSUPPORTED_PATH}/`);
  const blocked = isUnsupportedCountry(country);

  // Visitors from EU/EEA regions get sent to the unsupported page.
  if (blocked && !onUnsupportedPath) {
    const url = req.nextUrl.clone();
    url.pathname = UNSUPPORTED_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Supported visitors should never sit on the unsupported page.
  if (!blocked && onUnsupportedPath) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export default async function proxy(req: NextRequest) {
  return detectDeviceAndSetCookies(req, resolveResponse(req));
}

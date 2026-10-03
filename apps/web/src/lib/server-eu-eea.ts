import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const EU_EEA_COUNTRY_CODES = [
  "AT",
  "AX",
  "BE",
  "BG",
  "CH",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GB",
  "GF",
  "GG",
  "GI",
  "GP",
  "GR",
  "HR",
  "HU",
  "IE",
  "IM",
  "IS",
  "IT",
  "JE",
  "LI",
  "LT",
  "LU",
  "LV",
  "MF",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RE",
  "RO",
  "SE",
  "SI",
  "SK",
  "MQ",
  "YT"
] as const;

const UNSUPPORTED_SET = new Set<string>(EU_EEA_COUNTRY_CODES);

const UNSUPPORTED_PATH = "/unsupported-region/check-back";

function isUnsupportedCountry(country: string | null | undefined) {
  if (!country) return true;
  return UNSUPPORTED_SET.has(country.toUpperCase());
}
export function resolveResponse(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const country =
    req.headers.get("x-vercel-ip-country") ??
    (process.env.NODE_ENV === "development" ? "US" : undefined);

  const onUnsupportedPath =
    pathname === UNSUPPORTED_PATH ||
    pathname.startsWith(`${UNSUPPORTED_PATH}/`);
  const blocked = isUnsupportedCountry(country);

  // Visitors from EU/EEA regions (as well as GB and CH) get sent to the unsupported page.
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

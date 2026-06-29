import type { NextRequest } from "next/server";
import { NextResponse, userAgent } from "next/server";

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

const UNSUPPORTED_PATH = "/unsupported";

function isUnsupportedCountry(country: string | null | undefined) {
  if (!country) return true;
  return UNSUPPORTED_SET.has(country.toUpperCase());
}

function detectDeviceAndSetCookies(
  request: NextRequest,
  response: NextResponse
) {
  const domain =
    process.env.NODE_ENV !== "development" ? ".aicoalesce.com" : undefined;
  const config = {
    domain,
    path: "/",
    secure: typeof domain !== "undefined",
    sameSite: "lax",
    httpOnly: false
  } as const;

  const country = request.headers.get("x-vercel-ip-country") ?? "US";
  const region =
    request.headers.get("x-vercel-ip-country-region") ?? "Illinois";
  const city = request.headers.get("x-vercel-ip-city") ?? "Chicago";
  const lng = request.headers.get("x-vercel-ip-longitude") ?? "-87.8966849";
  const lat = request.headers.get("x-vercel-ip-latitude") ?? "41.8338486";
  const postalCode = request.headers.get("x-vercel-ip-postal-code") ?? "60010";
  const ip = request.headers.get("x-vercel-forwarded-for") ?? "127.0.0.1";

  const tz = request.headers.get("x-vercel-ip-timezone") ?? "America/Chicago";
  const { os, device, ua, browser } = userAgent(request);
  const isMac = /(mac)/gim.test(os?.name ?? "") ?? false;
  const latlng = `${lat},${lng}` as const;
  const browserName = browser.name ?? "Chrome";
  const browserVersion = browser.version ?? "147.0.7727.49";
  const { hostname } = request.nextUrl;

  const accept = request.headers.get("accept-language") ?? "";
  const m = accept.match(
    /^\s*([A-Za-z]{1,8}(?:-[A-Za-z]{1,8})*)(?:;q=[0-9.]+)?/
  );

  const isIOS = /(ios|iphone|ipad|iwatch)/i.test(ua);

  const ios = `${isIOS}` as const;

  const viewport = device?.type === "mobile" ? "mobile" : "desktop";

  let locale = m?.[1] ?? "en-US";

  if (!locale.includes("-")) {
    locale = `${locale.toLowerCase()}-${country}`;
  }

  const obj = {
    hostname,
    locale,
    viewport,
    browserName,
    browserVersion,
    ios,
    latlng,
    tz,
    ua: encodeURIComponent(ua),
    ip,
    country,
    city,
    isMac: `${isMac}`,
    region,
    postalCode
  } as const;

  for (const key of Object.keys(obj)) {
    if (request.cookies.has(key)) {
      response.cookies.delete(key);
    }
  }

  for (const [k, v] of Object.entries(obj)) {
    response.cookies.set(k, v, config);
  }

  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
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

import type { NextRequest } from "next/server";
import { NextResponse, userAgent } from "next/server";
import { getCookieCache } from "better-auth/cookies";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|twitter-image|auth/(?:login|signup)).*)"
  ]
};

function detectDeviceAndSetCookies(
  request: NextRequest,
  response: NextResponse
) {
  const domain =
    process.env.NODE_ENV !== "development" ? ".aicoalesce.com" : undefined;
  const country = request.headers.get("x-vercel-ip-country") ?? "US";
  const region =
    request.headers.get("x-vercel-ip-country-region") ?? "Illinois";
  const city = request.headers.get("x-vercel-ip-city") ?? "Chicago";
  const lng = request.headers.get("x-vercel-ip-longitude") ?? "-87.8966849";
  const lat = request.headers.get("x-vercel-ip-latitude") ?? "41.8338486";
  const postalCode = request.headers.get("x-vercel-ip-postal-code") ?? "60010";
  const ip = request.headers.get("x-vercel-forwarded-for") ?? "127.0.0.1";

  const tz = request.headers.get("x-vercel-ip-timezone") ?? "America/Chicago";
  const { os, device, ua } = userAgent(request);
  const isMac = /(mac)/gim.test(os?.name ?? "") ?? false;
  const latlng = `${lat},${lng}` as const;

  const { hostname } = request.nextUrl;

  const accept = request.headers.get("accept-language") ?? "";
  const m = accept.match(
    /^\s*([A-Za-z]{1,8}(?:-[A-Za-z]{1,8})*)(?:;q=[0-9.]+)?/
  );

  if (request.cookies.has("hostname")) {
    response.cookies.delete("hostname");
  }

  if (request.cookies.has("locale")) {
    response.cookies.delete("locale");
  }

  if (request.cookies.has("viewport")) {
    response.cookies.delete("viewport");
  }

  if (request.cookies.has("ios")) {
    response.cookies.delete("ios");
  }

  if (request.cookies.has("latlng")) {
    response.cookies.delete("latlng");
  }

  if (request.cookies.has("country")) {
    response.cookies.delete("country");
  }

  if (request.cookies.has("region")) {
    response.cookies.delete("region");
  }
  if (request.cookies.has("postalCode")) {
    response.cookies.delete("postalCode");
  }

  if (request.cookies.has("city")) {
    response.cookies.delete("city");
  }

  if (request.cookies.has("tz")) {
    response.cookies.delete("tz");
  }
  if (request.cookies.has("ip")) {
    response.cookies.delete("ip");
  }
  if (request.cookies.has("ua")) {
    response.cookies.delete("ua");
  }
  if (request.cookies.has("isMac")) {
    response.cookies.delete("isMac");
  }

  const isIOS = /(ios|iphone|ipad|iwatch)/i.test(ua);

  const ios = `${isIOS}` as const;

  // Set viewport type
  const viewport = device?.type === "mobile" ? "mobile" : "desktop";

  let locale = m?.[1] ?? "en-US";

  if (!locale.includes("-")) {
    locale = `${locale.toLowerCase()}-${country}`;
  }

  const config = {
    domain,
    path: "/",
    secure: typeof domain !== "undefined",
    sameSite: "lax",
    httpOnly: false
  } as const;
  // Set cookies
  response.cookies.set("hostname", hostname, config);
  response.cookies.set("locale", locale, config);
  response.cookies.set("viewport", viewport, config);
  response.cookies.set("ios", ios, config);
  response.cookies.set("latlng", latlng, config);
  response.cookies.set("tz", tz, config);
  response.cookies.set("ua", ua, config);
  response.cookies.set("ip", ip, config);
  response.cookies.set("country", country, config);
  response.cookies.set("city", city, config);
  response.cookies.set("isMac", `${isMac}`, config);
  response.cookies.set("region", region, config);
  response.cookies.set("postalCode", postalCode, config);
  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
}

export default async function middleware(req: NextRequest) {
  const session = await getCookieCache(req);
  if (!session && !req.nextUrl.pathname.includes("/auth")) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }
  if (req.nextUrl.pathname === "/") {
    return detectDeviceAndSetCookies(
      req,
      NextResponse.rewrite(new URL("/chat/home", req.url))
    );
  } else return detectDeviceAndSetCookies(req, NextResponse.next());
}

import { NextRequest, NextResponse, userAgent } from "next/server";

export { authConfig } from "@/lib/auth.config";
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};

function detectDeviceAndSetCookies(
  request: NextRequest,
  response: NextResponse
) {
  const country = request.headers.get("x-vercel-ip-country") ?? "US";
  const region =
    request.headers.get("x-vercel-ip-country-region") ?? "Illinois";
  const city = request.headers.get("x-vercel-ip-city") ?? "Chicago";
  const lng = request.headers.get("x-vercel-ip-longitude") ?? "-87.8966849";
  const lat = request.headers.get("x-vercel-ip-latitude") ?? "41.8338486";
  const postalCode = request.headers.get("x-vercel-ip-postal-code") ?? "60010";

  const tz = request.headers.get("x-vercel-ip-timezone") ?? "america/chicago";
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

  // Set cookies
  response.cookies.set("hostname", hostname);
  response.cookies.set("locale", locale);
  response.cookies.set("viewport", viewport);
  response.cookies.set("ios", ios);
  response.cookies.set("latlng", latlng);
  response.cookies.set("tz", tz);
  response.cookies.set("country", country);
  response.cookies.set("city", city);
  response.cookies.set("isMac", `${isMac}`);
  response.cookies.set("region", region);
  response.cookies.set("postalCode", postalCode);
  response.headers.set("Access-Control-Allow-Origin", "*");

  return response;
}

export default async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  return detectDeviceAndSetCookies(req, res);
}

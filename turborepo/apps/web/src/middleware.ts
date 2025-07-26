import { NextRequest, NextResponse, userAgent } from "next/server";

export { authConfig } from "@/lib/auth.config";
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};

function detectDeviceAndSetCookies(
  request: NextRequest,
  response: NextResponse
) {
  const country = request.headers.get("X-Vercel-IP-Country") ?? "US";
  const city = request.headers.get("x-vercel-ip-city") ?? "Chicago";
  const lng = request.headers.get("x-vercel-ip-longitude") ?? "-87.8966849";
  const lat = request.headers.get("x-vercel-ip-latitude") ?? "41.8338486";
  const tz = request.headers.get("x-vercel-ip-timezone") ?? "america/chicago";
  const { os, device, ua } = userAgent(request);
  const isMac = /(mac)/gim.test(os?.name ?? "") ?? false;
  const latlng = `${lat},${lng}` as const;

  const { hostname } = request.nextUrl;

  if (request.cookies.has("hostname")) {
    response.cookies.delete("hostname");
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

  // Set cookies
  response.cookies.set("hostname", hostname);
  response.cookies.set("viewport", viewport);
  response.cookies.set("ios", ios);
  response.cookies.set("latlng", latlng);
  response.cookies.set("tz", tz);
  response.cookies.set("country", country);
  response.cookies.set("city", city);
  response.cookies.set("isMac", `${isMac}`);
  response.headers.set("Access-Control-Allow-Origin", "*");

  return response;
}

export default async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  return detectDeviceAndSetCookies(req, res);
}

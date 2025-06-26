import type { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import type { Awaitable } from "@auth/core/types";
import { UserData } from "@/types/chat-ws";

const userDataMap = new Map<string, UserData>();
export function stashUserData(
  userId: string,
  cookieObj: Record<keyof UserData, string> | null
) {
  if (!cookieObj) return;
  const { city, country, latlng, tz } = cookieObj;
  return userDataMap.set(userId, { city, country, latlng, tz });
}

export async function handleCookies(cookieHeader?: string) {
  const arr = Array.of<readonly [keyof UserData, string]>();
  try {
    if (cookieHeader) {
      cookieHeader.split(";").forEach(function (cookie) {
        const cookieKeys = ["city", "country", "latlng", "tz"];
        const parts = cookie.match(/(.*?)=(.*)/);
        if (parts) {
          const k = (parts?.[1]?.trim() ?? "").trimStart();
          const v = parts?.[2]?.trim() ?? "";
          console.log([k, v]);
          if (cookieKeys.includes(k)) {
            arr.push([k as keyof UserData, decodeURIComponent(v)] as const);
          }
        }
      });
    } else {
      console.warn("No cookies received in the WebSocket handshake.");
    }
  } catch (err) {
    if (err instanceof Error) {
      console.error(`parseCookies Error: ` + err.message);
    } else {
      const stringify = JSON.stringify(err, null, 2);
      console.error(stringify);
    }
  } finally {
    if (arr.length > 0) {
      return Object.fromEntries(arr) as Record<keyof UserData, string>;
    } else return null;
  }
}

// type HandleAuthorization = {
//   authorized?:
//     | ((params: {
//         request: NextRequest;
//         auth: Session | null;
//       }) => Awaitable<boolean | NextResponse | Response | undefined>)
//     | undefined;
// }["authorized"];

export function handleAuthorization(params: {
  request: NextRequest;
  auth: Session | null;
}): Awaitable<boolean | NextResponse | Response | undefined> | undefined {
  const _nextUrl = params.request.nextUrl;
  const cookies = params.request.headers.get("cookie");
  if (cookies) {
    params.auth?.user?.id;
    const extract = handleCookies(cookies);
    extract.then(async data => {
      data;
    });
  }
  if (!params?.auth?.user) {
    return false;
  } else {
    console.log(params);
    return true;
  }
}

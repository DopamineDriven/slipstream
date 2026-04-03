"use client";

import { useEffect, useRef } from "react";
import Cookies from "js-cookie";

interface KnownCookies {
  userId?: string; // set cookie with server (stores userId in memory), parse, read, set with middleware after handshake ?
  hostname?: string; // "chat.aicoalesce.com"
  latlng?: string; // "41.8338486,-87.8966849"
  city?: string; // "Chicago"
  country?: string; // "US" -> 2-leter iso-3166-1 notaton
  tz?: string; // "america/chicago"
  ios?: string;
  viewport?: string;
}

export function useReadCookie(): KnownCookies | null {
  const cookieRef = useRef<KnownCookies | null>(null);

  useEffect(() => {
    const arr = Array.of<[keyof KnownCookies, string]>();

    const cookieKeys = [
      "city",
      "country",
      "latlng",
      "tz",
      "userId",
      "hostname",
      "ios",
      "viewport"
    ];
    function handleCookieInjection() {
      try {
        const cookiesRead = Cookies.get();
        for (const [key, val] of Object.entries(cookiesRead)) {
          if (cookieKeys.includes(key)) {
            arr.push([key as keyof KnownCookies, val]);
          } else {
            console.warn("No cookies received in the WebSocket handshake.");
          }
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
          const toObj = Object.fromEntries(arr) as Record<
            keyof KnownCookies,
            string
          >;
          cookieRef.current = toObj;
          return Object.fromEntries(arr) as Record<keyof KnownCookies, string>;
        } else console.info("no cookies returned");
      }
    }
    handleCookieInjection();
    return () => {};
  }, []);

  return cookieRef.current;
}

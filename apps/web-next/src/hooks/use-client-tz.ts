"use client";

import { useEffect } from "react";
import Cookies from "js-cookie";

const COOKIE_DOMAIN =
  process.env.NODE_ENV !== "development" ? ".aicoalesce.com" : undefined;

export function useClientTz() {
  useEffect(() => {
    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!deviceTz || Cookies.get("client-tz") === deviceTz) return;

    Cookies.set("client-tz", deviceTz, {
      domain: COOKIE_DOMAIN,
      path: "/",
      expires: 365,
      secure: typeof COOKIE_DOMAIN !== "undefined",
      sameSite: "lax"
    });
  }, []);
}

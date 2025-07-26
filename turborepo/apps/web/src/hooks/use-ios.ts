"use client";

import { useEffect, useState } from "react";
import { useCookiesCtx } from "@/context/cookie-context";

export function useIos() {
  const { get } = useCookiesCtx();
  const [isIos, setIsIos] = useState<boolean>(false);

  useEffect(() => {
    const iosCookie = get("ios");
    setIsIos(iosCookie === "true");
  }, [get]);

  return isIos;
}

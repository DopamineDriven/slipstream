"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { usePathnameContext } from "@/context/pathname-context";

export function PathnameSync() {
  const { setPathname } = usePathnameContext();
  const pathname = usePathname();

  useEffect(() => {
    console.log(pathname);
    setPathname(pathname);
  }, [pathname, setPathname]);

  return null;
}

"use client"

import { useState, useEffect } from "react"

interface PlatformInfo {
  isMac: boolean
  isIOS: boolean
  viewport: "mobile" | "desktop"
  country: string
  city: string
  timezone: string
  coordinates: string
  hostname: string
}

export function usePlatformDetection(): PlatformInfo {
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo>({
    isMac: false,
    isIOS: false,
    viewport: "desktop",
    country: "US",
    city: "Chicago",
    timezone: "america/chicago",
    coordinates: "41.8338486,-87.8966849",
    hostname: "localhost",
  })

  useEffect(() => {
    // Read from cookies set by middleware
    const getCookie = (name: string): string => {
      const value = `; ${document.cookie}`
      const parts = value.split(`; ${name}=`)
      if (parts.length === 2) return parts.pop()?.split(";").shift() ?? ""
      return ""
    }

    setPlatformInfo({
      isMac: getCookie("isMac") === "true",
      isIOS: getCookie("ios") === "true",
      viewport: (getCookie("viewport") as "mobile" | "desktop") || "desktop",
      country: getCookie("country") || "US",
      city: getCookie("city") || "Chicago",
      timezone: getCookie("tz") || "america/chicago",
      coordinates: getCookie("latlng") || "41.8338486,-87.8966849",
      hostname: getCookie("hostname") || "localhost",
    })
  }, [])

  return platformInfo
}

// Helper function for backward compatibility
export function isMac(): boolean {
  if (typeof document === "undefined") return false

  const getCookie = (name: string): string => {
    const value = `; ${document.cookie}`
    const parts = value.split(`; ${name}=`)
    if (parts.length === 2) return parts.pop()?.split(";").shift() ?? ""
    return ""
  }

  return getCookie("isMac") === "true"
}

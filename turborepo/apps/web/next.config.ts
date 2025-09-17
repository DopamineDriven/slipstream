import type { NextConfig } from "next";

export default {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: false },
  experimental: { optimizePackageImports: ["@slipstream/ui"] },
  typescript: { ignoreBuildErrors: false, tsconfigPath: "./tsconfig.json" },
  images: {
    loader: "default",
    formats: ["image/avif", "image/webp"],
    dangerouslyAllowSVG: true,
    remotePatterns: [
      {
        hostname: "localhost",
        port: "3030",
        protocol: "http"
      },
      { hostname: "lh3.googleusercontent.com", protocol: "https" },
      {
        hostname: `chat.d0paminedriven.com`,
        protocol: "https"
      },
      {
        hostname: `py.d0paminedriven.com`,
        protocol: "https"
      },
      {
        hostname: `assets.d0paminedriven.com`,
        protocol: "https"
      },
      {
        hostname: `assets-dev.d0paminedriven.com`,
        protocol: "https"
      },
            {
        hostname: `chat.aicoalesce.com`,
        protocol: "https"
      },
      {
        hostname: `py.coalesce.com`,
        protocol: "https"
      },
      {
        hostname: `assets.aicoalesce.com`,
        protocol: "https"
      },
      {
        hostname: `assets-dev.aicoalesce.com`,
        protocol: "https"
      },
      { hostname: "images.unsplash.com", protocol: "https" },
      { hostname: "tailwindui.com", protocol: "https" }
    ]
  },
  productionBrowserSourceMaps: true
} satisfies NextConfig;

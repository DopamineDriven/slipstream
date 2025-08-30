import type { NextConfig } from "next";

export default {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: false },
  experimental: { optimizePackageImports: ["@t3-chat-clone/ui"] },
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
        hostname: `ws-server-assets-dev.s3.us-east-1.amazonaws.com`,
        protocol: "https"
      },
      {
        hostname: `py-gen-assets-dev.s3.us-east-1.amazonaws.com`,
        protocol: "https"
      },
      {
        hostname: `ws-server-assets-prod.s3.us-east-1.amazonaws.com`,
        protocol: "https"
      },
      {
        hostname: `py-gen-assets-prod.s3.us-east-1.amazonaws.com`,
        protocol: "https"
      },
      { hostname: "images.unsplash.com", protocol: "https" },
      { hostname: "tailwindui.com", protocol: "https" }
    ]
  },
  productionBrowserSourceMaps: true
} satisfies NextConfig;

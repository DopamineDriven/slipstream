import type { NextConfig } from "next";

export default {
  reactStrictMode: true,
  reactCompiler: true,
  // defaults to to 1mb :|
  experimental: {
    serverActions: { bodySizeLimit: `50mb` },
    authInterrupts: true
  },
  typescript: { ignoreBuildErrors: false, tsconfigPath: "./tsconfig.json" },
  images: {
    localPatterns: [
      { pathname: "/dd/**" },
      { pathname: "/highlights/**" },
      { pathname: "/icon/**" },
      { pathname: "/photos/heritage/**" },
      { pathname: "/ideation/**" },
      { pathname: "/misc/**" },
      { pathname: "/providers/**" },
      { pathname: "/svgs/**" },
      { pathname: "/*" }
    ],
    qualities: [75, 80, 85, 90, 95, 100],
    loader: "default",
    formats: ["image/avif", "image/webp"],
    dangerouslyAllowLocalIP: true,
    maximumRedirects: 5,
    unoptimized: true,
    contentDispositionType: "attachment",
    minimumCacheTTL: 60,
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
        hostname: `dev.chat.d0paminedriven.com`,
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
      { hostname: "home.nps.gov", protocol: "https" },
      {
        hostname: `dev.chat.aicoalesce.com`,
        protocol: "https"
      },
      {
        hostname: `py.aicoalesce.com`,
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
      { hostname: "raw.githubusercontent.com", protocol: "https" },
      { hostname: "imgen.x.ai", protocol: "https" },
      { hostname: "images.unsplash.com", protocol: "https" },
      { hostname: "tailwindcss.com", protocol: "https" }
    ]
  },
  async rewrites() {
    return [
      {
        source: "/",
        destination: "/chat/home"
      }
    ];
  },
  productionBrowserSourceMaps: true
} satisfies NextConfig;

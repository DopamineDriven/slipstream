import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { getSiteUrl } from "@/lib/site-url";
import { NotFound } from "@/ui/layout/not-found";
import { GeistMono } from "geist/font/mono";

export const metadata = {
  metadataBase: new URL(getSiteUrl(process.env.VERCEL_ENV)),
  title: "AI Coalesce | 404",
  description: "Not all who wander are lost, but I sure am.",
  appleWebApp: {
    startupImage: "/apple-icon.png",
    statusBarStyle: "black-translucent",
    title: "AI Coalesce"
  }
} satisfies Metadata;

export default function GlobalNotFound() {
  return (
    <html
      suppressHydrationWarning
      lang="en"
      data-scroll-behavior="smooth"
      className={`${GeistMono.variable}`}>
      <head>
        <Script
          async
          id="prevent-flash-of-wrong-theme"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (prefersDark) {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `
          }}
        />
      </head>
      <body
        className={
          "bg-background font-basis m-0 h-dvh w-screen overflow-hidden p-0 antialiased"
        }>
        <NotFound />
      </body>
    </html>
  );
}

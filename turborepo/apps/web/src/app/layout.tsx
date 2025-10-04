import type { Metadata, Viewport } from "next";
import React from "react";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import "@slipstream/ui/globals.css";
import { Suspense } from "react";
import Script from "next/script";
import { CookieProvider } from "@/context/cookie-context";
import { PathnameProvider } from "@/context/pathname-context";
import { getSiteUrl } from "@/lib/site-url";
import { PathnameSync } from "@/ui/pathname-sync";
import * as ga from "@/utils/google-analytics";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"]
});

export const viewport = {
  colorScheme: "normal",
  themeColor: "#0a0a0a",
  viewportFit: "cover",
  maximumScale: 1,
  userScalable: false,
  initialScale: 1,
  width: "device-width"
} satisfies Viewport;

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl(process.env.VERCEL_ENV)),
  title: {
    default: "AI Coalesce",
    template: "%s | aicoalesce"
  },
  authors: [{ name: "Andrew Ross", url: "https://github.com/DopamineDriven" }],
  twitter: {
    card: "summary_large_image",
    title: "AI Chat",
    creator: "@Dopamine_Driven",
    creatorId: "989610823105568769",
    description:
      "Chat with models offered by Gemini, OpenAI, Anthropic, Meta, v0, and xAI"
  },
  appleWebApp: {
    startupImage: "/apple-icon.png",
    statusBarStyle: "black-translucent",
    title: "AI Coalesce"
  },
  creator: "Andrew Ross",
  description:
    "Chat with models offered by Gemini, OpenAI, Anthropic, Meta, v0, and xAI",
  openGraph: {
    title: "AI Chat",
    description:
      "Chat with models offered by Gemini, OpenAI, Anthropic, Meta, v0, and xAI",
    url: getSiteUrl(process.env.VERCEL_ENV),
    siteName: "AI Coalesce | aicoalesce",
    locale: "en_US",
    type: "website",
    countryName: "US",
    emails: ["andrew.simpson.ross@gmail.com"]
  },
  icons: [
    {
      type: "image/png",
      rel: "apple-touch-icon",
      url: new URL("/apple-touch-icon.png", getSiteUrl(process.env.VERCEL_ENV)),
      sizes: "180x180"
    },
    {
      type: "image/svg+xml",
      rel: "mask-icon",
      url: new URL("/favicon.svg", getSiteUrl(process.env.VERCEL_ENV))
    },
    {
      type: "image/png",
      rel: "icon",
      url: new URL("/meta/favicon-96x96.png", getSiteUrl(process.env.VERCEL_ENV)),
      sizes: "96x96"
    }
  ],
  robots: {
    googleBot: {
      follow: true,
      index: true,
      indexifembedded: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1
    },
    follow: true,
    index: true,
    indexifembedded: true,
    "max-video-preview": -1,
    "max-image-preview": "large",
    "max-snippet": -1
  }
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning lang="en">
      <head>
        <script
          async={true}
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
        className={cn(
          "bg-background font-basis m-0 h-[100dvh] w-[100dvw] overflow-hidden p-0 antialiased",
          inter.variable
        )}>
        <CookieProvider>
          <ThemeProvider attribute={"class"} defaultTheme="system" enableSystem>
            <PathnameProvider>
              <Suspense fallback={null}>
                <PathnameSync />
              </Suspense>
              {children}
            </PathnameProvider>
          </ThemeProvider>
        </CookieProvider>
      </body>
      <Script
        async
        strategy="afterInteractive"
        id="gtag-init"
        dangerouslySetInnerHTML={{
          __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${ga.GA_TRACKING_ID}', {
            page_path: window.location.pathname,
          });
         `
        }}
      />
      <Script
        async
        id={ga.GA_TRACKING_ID}
        data-test={ga.GA_TRACKING_ID}
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${ga.GA_TRACKING_ID}`}
      />
    </html>
  );
}

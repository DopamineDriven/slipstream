import type { Metadata, Viewport } from "next";
import React from "react";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import "@t3-chat-clone/ui/globals.css";
import Script from "next/script";
import { ChatWebSocketProvider } from "@/context/chat-ws-context";
import { auth } from "@/lib/auth";
import { getSiteUrl } from "@/lib/site-url";
import * as ga from "@/utils/google-analytics";
import { SessionProvider } from "next-auth/react";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"]
});

export const viewport = {
  colorScheme: "normal",
  userScalable: true,
  themeColor: "#020817",
  viewportFit: "auto",
  initialScale: 1,
  maximumScale: 1,
  width: "device-width"
} satisfies Viewport;

export const metadata = {
  metadataBase: new URL(getSiteUrl(process.env.NODE_ENV)),
  title: {
    default: "AI Chat",
    template: "%s | d0paminedriven"
  },
  authors: [{ name: "Andrew Ross", url: "https://github.com/DopamineDriven" }],
  twitter: {
    card: "summary_large_image",
    title: "AI Chat",
    creator: "@Dopamine_Driven",
    creatorId: "989610823105568769",
    description:
      "Chat with models offered by Gemini, OpenAI, Anthropic, and xAI"
  },
  appleWebApp: {
    startupImage: "/apple-icon.png",
    statusBarStyle: "black-translucent",
    title: "AI Chat"
  },
  creator: "Andrew Ross",
  description: "Chat with models offered by Gemini, OpenAI, Anthropic, and xAI",
  openGraph: {
    title: "AI Chat",
    description:
      "Chat with models offered by Gemini, OpenAI, Anthropic, and xAI",
    url: getSiteUrl(process.env.NODE_ENV),
    siteName: "AI Chat | d0paminedriven",
    locale: "en_US",
    type: "website",
    countryName: "US",
    emails: ["andrew@windycitydevs.io"]
  },
  icons: [
    {
      type: "image/png",
      rel: "apple-touch-icon",
      url: new URL("/apple-touch-icon.png", getSiteUrl(process.env.NODE_ENV)),
      sizes: "180x180"
    },
    {
      type: "image/svg+xml",
      rel: "mask-icon",
      url: new URL("/favicon.svg", getSiteUrl(process.env.NODE_ENV))
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
} satisfies Metadata;

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  return (
    <html suppressHydrationWarning lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
          integrity="sha384-n8MVd4RsNIU0tAv4ct0nTaAbDJwPJzDEaqSD1odI+WdtXRGWt2kTvGFasHpSy3SV"
          crossOrigin="anonymous"
        />
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
          "bg-background font-basis min-h-screen antialiased",
          inter.variable
        )}>
        <ThemeProvider attribute={"class"} defaultTheme="system" enableSystem>
          <SessionProvider session={session}>
            <ChatWebSocketProvider>{children}</ChatWebSocketProvider>
          </SessionProvider>
        </ThemeProvider>
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

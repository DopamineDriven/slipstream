import type { Metadata, Viewport } from "next";
import React from "react";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { cn } from "@/lib/utils";
import "./globals.css";
import "@t3-chat-clone/ui/globals.css";
import { SessionProvider } from "next-auth/react";
import { ChatWebSocketProvider } from "@/context/chat-ws-context";
import { auth } from "@/lib/auth";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"]
});

export const viewport = {
  colorScheme: "normal",
  userScalable: true,
  themeColor: "#ffffff",
  viewportFit: "auto",
  initialScale: 1,
  maximumScale: 1,
  width: "device-width"
} satisfies Viewport;

export const metadata = {
  /* populate relevant values in src/lib/site-url.ts and uncomment for url injetion */
  // metadataBase: new URL(getSiteUrl(process.env.NODE_ENV)),
  title: {
    default: "@t3-chat-clone/web",
    template: "%s | @t3-chat-clone/web"
  },
  description: "@t3-chat-clone/web scaffolded by @d0paminedriven/turbogen"
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
          "bg-background font-cal-sans min-h-screen antialiased",
          inter.variable
        )}>
        <ThemeProvider attribute={"class"} defaultTheme="system" enableSystem>
          <SessionProvider session={session}>
            <ChatWebSocketProvider>
              {children}
            </ChatWebSocketProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

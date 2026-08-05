import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { CookieProvider } from "@/context/cookie-context";
import { getAnalyticsMode, getSiteUrl } from "@/lib/site-url";
import { ThemeProvider } from "@/ui/theme/provider";

export const metadata = {
  metadataBase: new URL(getSiteUrl(process.env.VERCEL_ENV)),
  title: {
    default: "AI Coalesce",
    template: "%s | AI Coalesce"
  },
  authors: [{ name: "Andrew Ross", url: "https://github.com/DopamineDriven" }],
  twitter: {
    card: "summary_large_image",
    title: "AI Coalesce",
    creator: "@Dopamine_Driven",
    creatorId: "989610823105568769",
    description: "Minimal Constraints, Maximal Emergence"
  },
  appleWebApp: {
    startupImage: "/apple-icon.png",
    statusBarStyle: "black-translucent",
    title: "AI Coalesce"
  },
  creator: "Andrew Ross",
  openGraph: {
    title: "AI Coalesce",
    description: "Minimal Constraints, Maximal Emergence",
    url: getSiteUrl(process.env.VERCEL_ENV),
    siteName: "AI Coalesce | aicoalesce",
    locale: "en_US",
    type: "website",
    countryName: "US",
    emails: ["andrew@aicoalesce.com"]
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
      url: new URL("/favicon-96x96.png", getSiteUrl(process.env.VERCEL_ENV)),
      sizes: "96x96"
    }
  ],
  description:
    "AI Coalesce is a multi-provider, multi-model medium supporting 13 providers and ~130 models",
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

export const viewport = {
  colorScheme: "dark",
  themeColor: "#141414"
} satisfies Viewport;

const mode = getAnalyticsMode(process.env.VERCEL_ENV);
export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`bg-background ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        <CookieProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </CookieProvider>
        <Analytics mode={mode} />
      </body>
    </html>
  );
}

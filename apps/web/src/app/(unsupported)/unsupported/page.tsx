import type { Metadata } from "next";
import { AICoalesce } from "@slipstream/ui";

export const metadata: Metadata = {
  title: "Not available in your region — AI Coalesce",
  description:
    "AI Coalesce is not yet available in the EU and EEA. We're working to support your region soon.",
  robots: { index: false, follow: false }
};

export default function UnsupportedPage() {
  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <AICoalesce
          aria-label="AI Coalesce"
          className="text-foreground h-20 w-auto"
        />
        <h1 className="mt-10 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          AI Coalesce isn&apos;t available in your region yet
        </h1>

        <p className="text-muted-foreground mt-4 leading-relaxed text-pretty">
          Access from the European Union and European Economic Area is currently
          paused while we make sure we can support you in full compliance with
          local regulations. This is a temporary restriction, not a permanent
          one.
        </p>

        <div className="border-border bg-card mt-8 w-full rounded-lg border p-4 text-left">
          <p className="text-muted-foreground text-sm leading-relaxed">
            If you believe you&apos;re seeing this message in error, it may be
            due to your network or VPN location. Otherwise, we&apos;ll be in
            touch as soon as AI Coalesce is available where you are.
          </p>
        </div>

        <p className="text-muted-foreground mt-8 text-sm">
          Questions? Reach us at{" "}
          <a
            href="mailto:andrew@aicoalesce.com"
            className="text-foreground font-medium underline underline-offset-4 hover:no-underline">
            support@aicoalesce.com
          </a>
        </p>
      </div>
    </main>
  );
}

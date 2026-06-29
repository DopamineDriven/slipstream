import type { Metadata } from "next";
import { UnsupportedComponent } from "@/ui/unsupported";

export const metadata: Metadata = {
  title: "Not Available",
  description:
    "AI Coalesce is not yet available in the EU and EEA. We're working to support your region soon.",
  robots: { index: false, follow: false }
};

export default async function UnsupportedPage() {
  return <UnsupportedComponent />;
}

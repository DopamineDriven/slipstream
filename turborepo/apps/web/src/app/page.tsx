import { Suspense } from "react";
import { LandingPage } from "@/ui/home";

export default function HomePage() {
  return (
    <Suspense fallback={"Loading..."}>
      <LandingPage />
    </Suspense>
  );
}
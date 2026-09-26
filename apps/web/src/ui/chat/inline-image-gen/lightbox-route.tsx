"use client";

import type { LightboxImage } from "@/ui/chat/inline-image-gen/lightbox";
import { useRouter } from "next/navigation";
import { Lightbox } from "@/ui/chat/inline-image-gen/lightbox";

/** The intercepted `/attachment/[id]`: closing is a history pop, so back/forward
 *  reopen and dismiss it like any other navigation. */
export function LightboxRoute({ image }: { image: LightboxImage }) {
  const router = useRouter();
  return <Lightbox image={image} onClose={() => router.back()} />;
}

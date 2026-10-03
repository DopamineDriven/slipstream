"use client";

import type { AssetView } from "@/lib/asset-view";
import { useRouter } from "next/navigation";
import { Lightbox } from "@/ui/chat/inline-image-gen/lightbox";

/** The intercepted `/attachment/[id]`: closing is a history pop, so back/forward
 *  reopen and dismiss it like any other navigation. */
export function LightboxRoute({ asset }: { asset: AssetView }) {
  const router = useRouter();
  return <Lightbox asset={asset} onClose={() => router.back()} />;
}

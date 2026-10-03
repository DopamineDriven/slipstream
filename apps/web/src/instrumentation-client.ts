import type { RouterTransitionStartEvent, RouterTransitionType } from "next";
import { publishRouterTransitionStart } from "@/navigation/transition-store";


export function onRouterTransitionStart(
  url: string,
  navigationType: RouterTransitionType,
  event: RouterTransitionStartEvent | null
) {
  publishRouterTransitionStart(url, navigationType, event);
}

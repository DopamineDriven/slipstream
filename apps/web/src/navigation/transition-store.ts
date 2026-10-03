import type {
  RouterTransitionPrefetchIntent,
  RouterTransitionStartEvent,
  RouterTransitionType
} from "next";

export type RouterTransition = {
  readonly id: string;
  readonly url: URL;
  readonly type: RouterTransitionType;
  readonly startedAt: number;
  readonly fromRoutes: readonly string[];
  readonly prefetchIntent: RouterTransitionPrefetchIntent | null;
};

type TransitionListener = (transition: RouterTransition) => void;

const listeners = new Set<TransitionListener>();
let latest: RouterTransition | undefined;
let fallbackSequence = 0;

export function publishRouterTransitionStart(
  url: string,
  type: RouterTransitionType,
  event: RouterTransitionStartEvent | null
) {
  // Next passes the raw href for push/replace ("/chat/abc") but an absolute
  // location.href for traverse; resolving against the document normalizes both.
  const transition = {
    id: event?.id ?? `local-${(++fallbackSequence).toString(36)}`,
    url: new URL(url, window.location.href),
    type,
    startedAt: event?.timestamp ?? Date.now(),
    fromRoutes: event?.fromRoutes ?? [],
    prefetchIntent: event?.prefetchIntent ?? null
  } satisfies RouterTransition;

  latest = transition;
  for (const listener of listeners) listener(transition);
}

export function subscribeRouterTransitionStart(
  listener: TransitionListener
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLatestRouterTransition() {
  return latest;
}

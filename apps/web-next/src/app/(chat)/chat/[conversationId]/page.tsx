"use client";

/**
 * Fully client chat route — no SSR data fetch, no `generateMetadata`. Authed by the `(chat)` layout; non-indexed,
 * so SEO is irrelevant. History hydrates client-side via SWR into the store, and the tab title is owned by the
 * façade's `document.title` effect (off `status.title` — first chunk for a new chat, SWR hydration for an existing
 * one). `use(params)` suspends into the route's `loading.tsx` (the `AiCoalesceLoader`); `useSession()` provides the
 * authed user (the same hook the sidebar uses).
 */

import { use } from "react";
import { ChatInterface } from "@/ui/chat/dynamic";
import { useSession } from "@/utils/auth-client";

export default function ChatPage({
  params
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);
  const { data: session } = useSession();

  // No in-page fallback: `loading.tsx` covers route/param resolution; this brief null covers session hydration.
  if (!session?.user) return null;

  return <ChatInterface user={session.user} conversationId={conversationId} />;
}

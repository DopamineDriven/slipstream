import { AiCoalesceLoader } from "@/ui/loading/ai-coalesce-loader";

/**
 * Route-level Suspense fallback for `/chat/[conversationId]`. Shows while the client page resolves its params
 * (`use(params)`) / session on navigation. History loading WITHIN a resolved route uses the message skeleton in
 * `ChatInterface`, not this — this is the full-area branded loader.
 */
export default function Loading() {
  return <AiCoalesceLoader />;
}

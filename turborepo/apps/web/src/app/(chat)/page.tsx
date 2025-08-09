import { Suspense } from "react";
import { ChatEmptyState } from "@/ui/chat/empty-chat-shell";


export default async function HomePage() {
  return (
    <Suspense fallback={"Loading..."}>
      <ChatEmptyState />
    </Suspense>
  );
}

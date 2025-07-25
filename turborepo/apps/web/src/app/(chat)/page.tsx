"use client";

import { Suspense } from "react";
import { ChatEmptyState } from "@/ui/chat/empty-chat-shell";


export default function HomePage() {
  return (
    <Suspense fallback={"Loading..."}>
      <ChatEmptyState />
    </Suspense>
  );
}

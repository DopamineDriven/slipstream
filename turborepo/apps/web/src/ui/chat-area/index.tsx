// src/ui/atoms/chat-area.tsx
"use client";

import type { Message as PrismaMessage } from "@prisma/client";
import type { User } from "next-auth";
import { useEffect, useRef } from "react";
import { ScrollArea } from "@/ui/atoms/scroll-area";
import { ChatMessage } from "@/ui/chat-message";
import { motion } from "motion/react";
import { Provider, toPrismaFormat } from "@t3-chat-clone/types";

interface ChatAreaProps {
  messages?: PrismaMessage[];
  streamedText?: string;
  isStreaming?: boolean;
  model: string | null;
  provider: Provider;
  conversationId: string |null;
  onUpdateMessage?: (messageId: string, newText: string) => void;
  user?: User;
  className?: string;
}

export function ChatArea({
  messages = [],
  streamedText = "",
  isStreaming = false,
  onUpdateMessage,
  model,
  user,
  conversationId,
  provider,
  className = ""
}: ChatAreaProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  // scroll to bottom whenever messages or streamingText change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamedText]);

  return (
    <ScrollArea className={`flex-grow p-2 sm:p-4 md:p-6 ${className}`}>
      <motion.div
        className="space-y-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ staggerChildren: 0.1 }}>
        {/* Render all persisted messages */}
        {messages.map(msg => (
          <ChatMessage
            key={msg.id}
            message={{
              id: msg.id,
              senderType: msg.senderType,
              content: msg.content,
              createdAt: msg.createdAt,
              conversationId: msg.conversationId,
              model: msg.model,
              provider: msg.provider,
              updatedAt: msg.updatedAt,
              userId: msg.userId,
              userKeyId: msg.userKeyId
              // include any other fields your ChatMessage expects
            }}
            user={user}
            onUpdateMessage={onUpdateMessage}
          />
        ))}

        {/* If streaming is active, render one in-flight AI bubble */}
        {isStreaming && streamedText && (
          <ChatMessage
            key="streaming"
            message={{
              id: "streaming",
              senderType: "AI",
              content: streamedText,
              createdAt: new Date(),
              conversationId: conversationId ?? "new-chat",
              model,
              provider: toPrismaFormat(provider),
              updatedAt: new Date(),
              userId: user?.id ?? null,
              userKeyId: null
            }}
            user={user}
          />
        )}

        {/* anchor for auto-scroll */}
        <div ref={endRef} />
      </motion.div>
    </ScrollArea>
  );
}

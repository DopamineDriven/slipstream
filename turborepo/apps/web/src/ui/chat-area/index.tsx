"use client";

import type { User } from "next-auth";
import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/ui/atoms/scroll-area";
import { ChatMessage } from "@/ui/chat-message";
import { motion } from "motion/react";
import { Provider, toPrismaFormat } from "@t3-chat-clone/types";
import { UIMessage } from "@/types/shared";

interface ChatAreaProps {
  messages?: UIMessage[];
  streamedText?: string;
  isStreaming?: boolean;
  model: string | null;
  provider: Provider;
  conversationId: string |null;
  onUpdateMessage?: (messageId: string, newText: string) => void;
  user?: User;
  className?: string;
  isAwaitingFirstChunk: boolean
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
  const _provider = provider;
  const _conversationId = conversationId;
  const _model = model;
  const _isStreaming = isStreaming;

  // scroll to bottom whenever messages or streamingText change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamedText]);
  // 2) accumulate all chunks into one displayText
  const accRef = useRef("");
  const [displayText, setDisplayText] = useState("");

  useEffect(() => {
    if (streamedText) {
      accRef.current = streamedText;
      setDisplayText(accRef.current);
    }
  }, [streamedText]);
  return (
    <ScrollArea className={`flex-grow p-2 sm:p-4 md:p-6 ${className}`}>
      <motion.div
        className="space-y-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ staggerChildren: 0.1 }}>
        {/* Render all persisted messages */}
        {messages.map(msg => {

          return(

          <ChatMessage
            key={msg.id}
            message={msg}
            user={user}
            onUpdateMessage={onUpdateMessage}
          />
        )})}
        {displayText && (
          <ChatMessage
            key="streaming"
            message={{
              id: "streaming",
              senderType: "AI",
              content: displayText,
              createdAt: new Date(),
              updatedAt: new Date(),
              conversationId: conversationId ?? "new-chat",
              model: model ?? "unknown-model",
              provider: toPrismaFormat(provider),
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

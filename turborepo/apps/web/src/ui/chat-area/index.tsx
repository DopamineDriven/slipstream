"use client";

import { useEffect, useRef } from "react"; // Import useRef and useEffect
import { motion } from "motion/react";
import { User } from "next-auth";
import type { Message } from "@/types/ui";
import { mockMessages } from "@/lib/mock"; // Assuming mockMessages is still used for default
import { ScrollArea } from "@/ui/atoms/scroll-area";
import { ChatMessage } from "@/ui/chat-message";

interface ChatAreaProps {
  messages?: Message[];
  className?: string;
  onUpdateMessage?: (messageId: string, newText: string) => void;
  scrollToMessageId?: string | null; // To trigger scroll to a specific message
  onScrollToMessageHandled?: () => void; // Callback after scroll is handled
  user?: User;
  streamedText?: string;
  isStreaming?: boolean;
}

export function ChatArea({
  messages = mockMessages,
  className = "",
  onUpdateMessage,
  scrollToMessageId,
  onScrollToMessageHandled: _onScrollToMessageHandled,
  user,
  streamedText = "",
  isStreaming = false
}: ChatAreaProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null); // Ref for the ScrollArea's viewport
  const messagesEndRef = useRef<HTMLDivElement>(null); // Ref for the end of messages list

  // Scroll to bottom when new messages are added (unless a specific message is targeted)
  useEffect(() => {
    if (!scrollToMessageId && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, scrollToMessageId]);

  // Scroll to a specific message if scrollToMessageId is set
  // This is a simplified version; direct child refs in ChatMessage are more robust for this.
  // For now, we'll rely on the ChatMessage's internal scrollIntoView when editing.

  return (
    <ScrollArea
      ref={scrollAreaRef}
      className={`flex-grow p-2 sm:p-4 md:p-6 ${className}`}>
      <motion.div
        className="space-y-1" // Reduced space-y for tighter message packing
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ staggerChildren: 0.1 }}>
        {messages.map(msg => (
          <ChatMessage
            key={msg.id}
            message={msg}
            user={user}
            onUpdateMessage={onUpdateMessage}
          />
        ))}
        {streamedText && (
          <ChatMessage
            key="streaming"
            message={{
              id: "streaming",
              sender: "ai",
              text: streamedText,
              originalText: streamedText,
              timestamp: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
              }),
              avatar: "/placeholder.svg?width=32&height=32"
            }}
            user={user}
          />
        )}
        <div ref={messagesEndRef} />
        {/* Invisible element at the end for auto-scrolling */}
      </motion.div>
    </ScrollArea>
  );
}

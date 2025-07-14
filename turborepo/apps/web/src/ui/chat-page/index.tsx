"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ChatArea } from "@/ui/chat-area";
import { MessageInputBar } from "@/ui/message-input-bar";
import { EmptyStateChat } from "@/ui/empty-state-chat";
import type { Message } from "@/types/ui";

import {
  ArrowDownCircle,
  Button,
  Settings,
  ShareIcon as Share2
} from "@t3-chat-clone/ui";
import { ProviderModelSelector } from "@/ui/model-selector-drawer";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { MobileModelSelectorDrawer } from "@/ui/mobile-model-select";
import { defaultModelSelection } from "@/lib/models";
import { User } from "next-auth";
import { ClientWorkupProps } from "@/types/shared";
import { Conversation } from "@prisma/client";
import dynamic from "next/dynamic";

const ThemeToggle = dynamic(
  () => import("@/ui/theme-toggle").then(d => d.ThemeToggle),
  { ssr: false }
);


const SCROLL_THRESHOLD = 100;
interface ChatPageProps {
  user?: User;
  providerConfig: ClientWorkupProps;
  recentConvos?: Conversation[];
}
export function ChatHome({user, providerConfig: _providerConfig, recentConvos: _recentConvos}: ChatPageProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatEmpty, setIsChatEmpty] = useState(messages.length === 0);
  const [selectedModel, setSelectedModel] = useState(
    defaultModelSelection
  );
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const chatAreaContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottomButton, setShowScrollToBottomButton] =
    useState(false);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (chatAreaContainerRef.current) {
      chatAreaContainerRef.current.scrollTo({
        top: chatAreaContainerRef.current.scrollHeight,
        behavior
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom("auto");
  }, [messages, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const container = chatAreaContainerRef.current;
    if (container) {
      const isScrolledUp =
        container.scrollHeight - container.scrollTop - container.clientHeight >
        SCROLL_THRESHOLD;
      setShowScrollToBottomButton(isScrolledUp);
    }
  }, []);

  useEffect(() => {
    const container = chatAreaContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [handleScroll]);

  const handleSendMessage = (text: string, isEditSubmit = false) => {
    const newMessage: Message = {
      id: String(Date.now()),
      sender: "user",
      text,
      originalText: text,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      }),
      avatar: user?.image ?? ""
    };
    if (!isEditSubmit) {
      setMessages(prev => [...prev, newMessage]);
    }
    setIsChatEmpty(false);

    const thinkingMessageId = `thinking-${Date.now()}`;
    const thinkingMessage: Message = {
      id: thinkingMessageId,
      sender: "ai",
      text: "Thinking...",
      originalText: "Thinking...",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      }),
      model: selectedModel.modelId,
      avatar: "/placeholder.svg?width=32&height=32"
    };
    setMessages(prev => [...prev, thinkingMessage]);

    setTimeout(() => {
      const aiResponse: Message = {
        id: String(Date.now() + 1),
        sender: "ai",
        text: `This is a simulated AI response to "${text}" using ${
          selectedModel.displayName
        } (${selectedModel.modelId}). The previous message was ${
          isEditSubmit ? "an edit." : "new."
        }`,
        originalText: `This is a simulated AI response to "${text}" using ${
          selectedModel.displayName
        } (${selectedModel.modelId}). The previous message was ${
          isEditSubmit ? "an edit." : "new."
        }`,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        }),
        model: selectedModel.modelId,
        avatar: "/placeholder.svg?width=32&height=32"
      };
      setMessages(prev =>
        prev.map(m => (m.id === thinkingMessageId ? aiResponse : m))
      );
    }, 2000);
  };

  const handleUpdateMessage = (messageId: string, newText: string) => {
    setMessages(prevMessages =>
      prevMessages.map(msg =>
        msg.id === messageId
          ? { ...msg, text: newText, originalText: newText, isEditing: false }
          : msg
      )
    );
    handleSendMessage(newText, true);
  };

  const handlePromptSelect = (prompt: string) => {
    handleSendMessage(prompt);
  };

  const handleShareChat = () => {
    console.log("Share chat clicked. Implement sharing logic.");
    alert("Share functionality to be implemented!");
  };

  return (
    <div className='flex flex-col flex-grow h-full overflow-hidden relative'>
      {/* Header */}
      <header className='p-2 sm:p-4 border-b border-brand-border flex justify-between items-center bg-brand-background sticky top-0 z-10 h-14 shrink-0'>
        <div className='w-10' />{" "}
        {/* Spacer for mobile since sidebar toggle is in layout */}
        <ProviderModelSelector
          selectedModel={selectedModel}
          onModelChangeAction={setSelectedModel}
          onClick={() => setIsModelSelectorOpen(true)}
        />
        <div className='flex items-center space-x-1 sm:space-x-2'>
          <Button
            variant='ghost'
            size='icon'
            onClick={handleShareChat}
            className='text-brand-text-muted hover:text-brand-text hover:bg-brand-component'>
            <Share2 className="size-5" />
            <span className='sr-only'>Share chat</span>
          </Button>
          {isDesktop && (
            <Button
              variant='ghost'
              size='icon'
              asChild
              className='text-brand-text-muted hover:text-brand-text hover:bg-brand-component'>
              <Link href='/settings'>
                <Settings className="size-5" />
                <span className='sr-only'>Settings</span>
              </Link>
            </Button>
          )}
          <ThemeToggle className='text-brand-text-muted hover:text-brand-text hover:bg-brand-component' />
        </div>
      </header>

      {/* Main Chat Area */}
      <main
        ref={chatAreaContainerRef}
        className='flex-grow flex flex-col overflow-y-auto relative'>
        {isChatEmpty ? (
          <EmptyStateChat
            user={user}
            onPromptSelect={handlePromptSelect}
          />
        ) : (
          <ChatArea messages={messages} onUpdateMessage={handleUpdateMessage} />
        )}

        {showScrollToBottomButton && (
          <Button
            variant='outline'
            size='icon'
            className={cn(
              "absolute bottom-4 right-4 sm:right-6 z-20 rounded-full h-10 w-10 sm:h-12 sm:w-12 shadow-lg",
              "bg-brand-component border-brand-border text-brand-text-muted hover:bg-brand-sidebar hover:text-brand-text"
            )}
            onClick={() => scrollToBottom()}
            aria-label='Scroll to bottom'>
            <ArrowDownCircle className="size-6" />
          </Button>
        )}
      </main>

      {/* Message Input */}
      <MessageInputBar
        onSendMessage={text => handleSendMessage(text, false)}
        currentModelId={selectedModel.modelId}
        className='shrink-0'
      />
      <MobileModelSelectorDrawer
        isOpen={isModelSelectorOpen}
        onOpenChangeAction={setIsModelSelectorOpen}
        selectedModel={selectedModel}
        onSelectModelAction={setSelectedModel}
      />
    </div>
  );
}

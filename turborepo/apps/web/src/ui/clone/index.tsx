"use client";

import type { User } from "next-auth";
import { Button, Icon } from "@t3-chat-clone/ui";
import { useCallback, useEffect, useRef, useState } from "react";
// import { useChatWebSocketContext } from "@/context/chat-ws-context";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { Message, Model } from "@/types/ui";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  availableModels,
  mockMessages as initialMessages,
  mockUserProfile
} from "@/lib/mock";
import { cn } from "@/lib/utils";
import { ChatArea } from "@/ui/chat-area";
import { EmptyStateChat } from "@/ui/empty-state-chat";
import { MessageInputBar } from "@/ui/message-input-bar";
import { MobileModelSelectorDrawer } from "@/ui/mobile-model-select";
import { SettingsDrawer } from "@/ui/settings-drawer";
import { Sidebar } from "@/ui/sidebar";

const ThemeToggle = dynamic(
  () => import("@/ui/theme-toggle").then(d => d.ThemeToggle),
  { ssr: false }
);

const SCROLL_THRESHOLD = 100;

export function ChatPage({ user }: { user?: User }) {
  const [messages, setMessages] = useState<Message[]>(
    initialMessages.map(msg => ({
      ...msg,
      originalText: typeof msg.text === "string" ? msg.text : ""
    }))
  );

  // const {} = useChatWebSocketContext()
  const [isChatEmpty, setIsChatEmpty] = useState(messages.length === 0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<Model>(
    availableModels[0] as Model
  );
  const [isModelDrawerOpen, setIsModelDrawerOpen] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const chatAreaContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottomButton, setShowScrollToBottomButton] =
    useState(false);

  const { resolvedTheme } = useTheme();

  useEffect(() => {
    // Check if user prefers dark mode
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    // Apply theme based on system preference during initial load
    if (!resolvedTheme) {
      if (prefersDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    } else {
      // Apply theme based on resolvedTheme once it's available
      if (resolvedTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [resolvedTheme]);

  useEffect(() => {
    setIsSidebarOpen(isDesktop);
  }, [isDesktop]);

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

  const handleSendMessage = (
    text: string,
    modelId: string,
    isEditSubmit = false
  ) => {
    const newMessage: Message = {
      id: crypto.randomUUID(),
      sender: "user",
      text,
      originalText: text,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      }),
      avatar: user?.image ?? mockUserProfile.image
    };
    if (!isEditSubmit) {
      setMessages(prev => [...prev, newMessage]);
    }
    setIsChatEmpty(false);
    // ... (rest of the function)

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
      model: modelId,
      avatar: "/globe.svg?width=32&height=32"
    };
    setMessages(prev => [...prev, thinkingMessage]);

    setTimeout(() => {
      const aiResponse: Message = {
        id: String(Date.now() + 1),
        sender: "ai",
        text: `This is a simulated AI response to "${text}" using model ${modelId}. The previous message was ${
          isEditSubmit ? "an edit." : "new."
        }`,
        originalText: `This is a simulated AI response to "${text}" using model ${modelId}. The previous message was ${
          isEditSubmit ? "an edit." : "new."
        }`,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        }),
        model: modelId,
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
    handleSendMessage(newText, selectedModel.id, true);
  };

  const handleNewChat = () => {
    setMessages([]);
    setIsChatEmpty(true);
    if (!isDesktop) setIsSidebarOpen(false);
  };

  const handlePromptSelect = (prompt: string) => {
    handleSendMessage(prompt, selectedModel.id);
  };

  const handleShareChat = () => {
    console.log("Share chat clicked. Implement sharing logic.");
    alert("Share functionality to be implemented!");
  };

  const header = (
    <header className="border-brand-border bg-brand-background sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b p-2 sm:p-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
        {isSidebarOpen ? <Icon.PanelLeftClose /> : <Icon.PanelRightClose />}
        <span className="sr-only">
          {isSidebarOpen ? "Close sidebar" : "Open sidebar"}
        </span>
      </Button>
      <Button
        variant="ghost"
        onClick={() => setIsModelDrawerOpen(true)}
        className="text-brand-text hover:bg-brand-component px-3 text-sm sm:text-base">
        {selectedModel.icon && (
          <Image
            src={selectedModel.icon || "/placeholder.svg"}
            alt=""
            width={16}
            height={16}
            className="mr-2 rounded-sm"
          />
        )}
        {selectedModel.name}
        <Icon.ChevronDown className="ml-1 h-4 w-4" />
      </Button>
      <div className="flex items-center space-x-1 sm:space-x-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleShareChat}
          className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
          <Icon.ShareIcon className="size-[1.125rem]" />
          <span className="sr-only">Share chat</span>
        </Button>
        {isDesktop && (
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
            <Link href="/settings">
              <Icon.Settings className="size-[1.125rem]" />
              <span className="sr-only">Settings</span>
            </Link>
          </Button>
        )}
        <ThemeToggle className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component" />
        {!isDesktop && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSettingsDrawerOpen(true)}
            className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
            <Icon.Settings />
            <span className="sr-only">Settings</span>
          </Button>
        )}
      </div>
    </header>
  );

  const chatContent = (
    <div className="relative flex h-full flex-grow flex-col overflow-hidden">
      {header}
      <main
        ref={chatAreaContainerRef}
        className="relative flex flex-grow flex-col overflow-y-auto">
        {isChatEmpty ? (
          <EmptyStateChat
            userName={
              user?.name?.split(" ")[0] ?? mockUserProfile.name.split(" ")[0]
            }
            onPromptSelect={handlePromptSelect}
          />
        ) : (
          <ChatArea
            messages={messages}
            onUpdateMessage={handleUpdateMessage}
            user={user}
          />
        )}
        {showScrollToBottomButton && (
          <Button
            variant="outline"
            size="icon"
            className={cn(
              "absolute right-4 bottom-4 z-20 h-10 w-10 rounded-full shadow-lg sm:right-6 sm:h-12 sm:w-12",
              "bg-brand-component border-brand-border text-brand-text-muted hover:bg-brand-sidebar hover:text-brand-text"
            )}
            onClick={() => scrollToBottom()}
            aria-label="Scroll to bottom">
            <Icon.ArrowDownCircle className="size-5" />
          </Button>
        )}
      </main>
      <MessageInputBar
        onSendMessage={(text, modelId) =>
          handleSendMessage(text, modelId, false)
        }
        currentModelId={selectedModel.id}
        className="shrink-0"
      />
    </div>
  );

  return (
    <>
      <div className="bg-brand-background text-brand-text flex h-screen overflow-hidden">
        {isDesktop ? (
          <PanelGroup direction="horizontal">
            {isSidebarOpen && (
              <Panel
                defaultSize={20}
                minSize={15}
                maxSize={25}
                collapsible
                onCollapse={() => setIsSidebarOpen(false)}
                onExpand={() => setIsSidebarOpen(true)}>
                <Sidebar
                  user={{
                    ...user
                  }}
                  onNewChat={handleNewChat}
                  onOpenSettings={() => setIsSettingsDrawerOpen(true)}
                  className="h-full"
                />
              </Panel>
            )}
            {isSidebarOpen && (
              <PanelResizeHandle className="bg-brand-border/50 hover:bg-brand-border w-1 transition-colors" />
            )}
            <Panel>{chatContent}</Panel>
          </PanelGroup>
        ) : (
          <>
            <AnimatePresence>
              {isSidebarOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-40 bg-black/50"
                    onClick={() => setIsSidebarOpen(false)}
                  />
                  <motion.div
                    key="sidebar-mobile"
                    initial={{ x: "-100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "-100%" }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="fixed top-0 left-0 z-50 h-full">
                    <Sidebar
                      user={{
                        ...user
                      }}
                      onNewChat={handleNewChat}
                      onOpenSettings={() => setIsSettingsDrawerOpen(true)}
                      className="h-full w-[280px] sm:w-[300px]"
                    />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
            <div className="flex flex-grow flex-col overflow-hidden">
              {chatContent}
            </div>
          </>
        )}
      </div>
      <MobileModelSelectorDrawer
        isOpen={isModelDrawerOpen}
        onOpenChange={setIsModelDrawerOpen}
        selectedModel={selectedModel}
        onSelectModel={setSelectedModel}
      />
      <SettingsDrawer
        isOpen={isSettingsDrawerOpen}
        onOpenChange={setIsSettingsDrawerOpen}
      />
    </>
  );
}

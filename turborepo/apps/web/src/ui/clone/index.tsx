"use client";

import type { ClientWorkupProps } from "@/types/shared";
import type { Message } from "@/types/ui";
import type { Conversation, Message as PrismaMessage } from "@prisma/client";
import type { User } from "next-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAiChat } from "@/hooks/use-ai-chat";
import { useMediaQuery } from "@/hooks/use-media-query";
import { defaultModelSelection, ModelSelection } from "@/lib/models";
import { cn } from "@/lib/utils";
import { ChatArea } from "@/ui/chat-area";
import { EmptyStateChat } from "@/ui/empty-state-chat";
import { MessageInputBar } from "@/ui/message-input-bar";
import { MobileModelSelectorDrawer } from "@/ui/mobile-model-select";
import { SettingsDrawer } from "@/ui/settings-drawer";
import { Sidebar } from "@/ui/sidebar";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { AllModelsUnion, Provider } from "@t3-chat-clone/types";
import {
  ArrowDownCircle,
  Button,
  Settings,
  ShareIcon
} from "@t3-chat-clone/ui";
import { ProviderModelSelector } from "../model-selector-drawer";

const ThemeToggle = dynamic(
  () => import("@/ui/theme-toggle").then(d => d.ThemeToggle),
  { ssr: false }
);

const SCROLL_THRESHOLD = 100;

interface ChatPageProps {
  user?: User;
  providerConfig: ClientWorkupProps;
  recentConvos?: Conversation[];
  conversationDetails?:null | (Conversation & { messages: PrismaMessage[] })
}

export function ChatPage({
  user,
  providerConfig,
  recentConvos
}: ChatPageProps) {
  const {
    // should definitely be double or triple checking this in a lifecycle hook before allowing prompts to be sent -- if not connected that means their session is invalid and they need to sign in again (shouldn't happen but just in case)
    isConnected,
    streamedText,
    // need to keep state current as more than one message is sent
    messages: _aiMessages,
    // we should have this at least listen for any subtle errors that may be occurring otherwise we're flying blind in that regard
    error,
    isComplete,
    sendChat
  } = useAiChat();
  const [messages, setMessages] = useState<Message[]>([]);

  const [isChatEmpty, setIsChatEmpty] = useState(messages.length === 0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelSelection>(
    defaultModelSelection
  );
  const [isModelDrawerOpen, setIsModelDrawerOpen] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const chatAreaContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottomButton, setShowScrollToBottomButton] =
    useState(false);
  const [_isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);

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

  // Connection check as requested in comments
  useEffect(() => {
    if (!isConnected) {
      console.warn("WebSocket not connected - user may need to sign in again");
      // TODO: Redirect to sign in or show connection error
    }
  }, [isConnected]);

  // Error handling as requested in comments
  useEffect(() => {
    if (error) {
      console.error("AI Chat Error:", error);
      // TODO: Show user-facing error message
    }
  }, [error]);

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
    // Connection check before sending as requested in comments
    if (!isConnected) {
      console.error("Cannot send message: WebSocket not connected");
      // TODO: Show user error message about connection
      return;
    }
    // Optimistic UI update - ID will be resolved when server persists to database
    if (!isEditSubmit) {
      const optimisticMessage: Message = {
        id: "temp-user-message", // Static temp ID - easy to find and replace with real DB ID
        sender: "user",
        text,
        originalText: text,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        }),
        avatar: user?.image ?? "/svgs/user.svg"
      };
      setMessages(prev => [...prev, optimisticMessage]);
    }
    setIsChatEmpty(false);

    // Use real streaming via sendChat (SHOULD THIS BE MEMOIZED OR HANDLED IN A MORE PERFORMANT MANNER?)
    const provider = (
      selectedModel.provider.includes("gpt")
        ? "openai"
        : selectedModel.provider.includes("gemini")
          ? "gemini"
          : selectedModel.provider.includes("claude")
            ? "anthropic"
            : selectedModel.provider.includes("grok")
              ? "grok"
              : selectedModel.provider.includes("xai")
                ? "grok"
                : "openai"
    ) satisfies Provider;

    const hasConfigured = providerConfig.isSet[provider];
    const isDefault = providerConfig.isDefault[provider];
    // please NEVER use as any....ever. just ask if you aren't sure what type to assign something that requires an explicit annotation please
    sendChat(
      text,
      provider as Provider,
      modelId as AllModelsUnion,
      hasConfigured,
      isDefault
    );
  };

  const handleUpdateMessage = (messageId: string, newText: string) => {
    setMessages(prevMessages =>
      prevMessages.map(msg =>
        msg.id === messageId
          ? { ...msg, text: newText, originalText: newText, isEditing: false }
          : msg
      )
    );
    handleSendMessage(newText, selectedModel.modelId, true);
  };

  const handleNewChat = () => {
    setMessages([]);
    setIsChatEmpty(true);
    if (!isDesktop) setIsSidebarOpen(false);
  };

  const handlePromptSelect = (prompt: string) => {
    handleSendMessage(prompt, selectedModel.modelId);
  };

  const handleShareChat = () => {
    console.log("Share chat clicked. Implement sharing logic.");
    alert("Share functionality to be implemented!");
  };

  // const header = (
  //   <header className="border-brand-border bg-brand-background sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b p-2 sm:p-4">
  //     <Button
  //       variant="ghost"
  //       size="icon"
  //       onClick={() => setIsSidebarOpen(!isSidebarOpen)}
  //       className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
  //       {isSidebarOpen ? <PanelLeftClose /> : <PanelRightClose />}
  //       <span className="sr-only">
  //         {isSidebarOpen ? "Close sidebar" : "Open sidebar"}
  //       </span>
  //     </Button>
  //     <Button
  //       variant="ghost"
  //       onClick={() => setIsModelDrawerOpen(true)}
  //       className="text-brand-text hover:bg-brand-component px-3 text-sm sm:text-base">
  //       {selectedModel.provider &&
  //         (selectedModel.provider === "gemini" ? (
  //           <GeminiIcon />
  //         ) : selectedModel.provider === "grok" ? (
  //           <XAiIcon />
  //         ) : selectedModel.provider === "anthropic" ? (
  //           <AnthropicIcon />
  //         ) : (
  //           <OpenAiIcon />
  //         ))}
  //       {selectedModel.displayName}
  //       <ChevronDown className="ml-1 h-4 w-4" />
  //     </Button>
  //     <div className="flex items-center space-x-1 sm:space-x-2">
  //       <Button
  //         variant="ghost"
  //         size="icon"
  //         onClick={handleShareChat}
  //         className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
  //         <ShareIcon className="size-[1.125rem]" />
  //         <span className="sr-only">Share chat</span>
  //       </Button>
  //       {isDesktop && (
  //         <Button
  //           variant="ghost"
  //           size="icon"
  //           asChild
  //           className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
  //           <Link href="/settings">
  //             <Settings className="size-[1.125rem]" />
  //             <span className="sr-only">Settings</span>
  //           </Link>
  //         </Button>
  //       )}
  //       <ThemeToggle className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component" />
  //       {!isDesktop && (
  //         <Button
  //           variant="ghost"
  //           size="icon"
  //           onClick={() => setIsSettingsDrawerOpen(true)}
  //           className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
  //           <Settings />
  //           <span className="sr-only">Settings</span>
  //         </Button>
  //       )}
  //     </div>
  //   </header>
  // );

  const chatContent = (
    <div className="relative flex h-full flex-grow flex-col overflow-hidden">
      <header className="border-brand-border bg-brand-background sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b p-2 sm:p-4">
        <div className="w-10" />{" "}
        {/* Spacer for mobile since sidebar toggle is in layout */}
        <ProviderModelSelector
          selectedModel={selectedModel}
          onModelChangeAction={model => setSelectedModel(model)}
          onClick={() => setIsModelSelectorOpen(true)}
        />
        <div className="flex items-center space-x-1 sm:space-x-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShareChat}
            className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
            <ShareIcon className="size-5" />
            <span className="sr-only">Share chat</span>
          </Button>
          {isDesktop && (
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
              <Link href="/settings">
                <Settings className="size-5" />
                <span className="sr-only">Settings</span>
              </Link>
            </Button>
          )}
          <ThemeToggle className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component" />
        </div>
      </header>
      <main
        ref={chatAreaContainerRef}
        className="relative flex flex-grow flex-col overflow-y-auto">
        {isChatEmpty ? (
          <EmptyStateChat user={user} onPromptSelect={handlePromptSelect} />
        ) : (
          <ChatArea
            messages={messages}
            onUpdateMessage={handleUpdateMessage}
            user={user}
            streamedText={streamedText}
            isStreaming={!isComplete && !!streamedText}
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
            <ArrowDownCircle className="size-5" />
          </Button>
        )}
      </main>
      <MessageInputBar
        onSendMessage={(text, modelId) =>
          handleSendMessage(text, modelId, false)
        }
        currentModelId={selectedModel.modelId}
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
                  chatThreads={recentConvos}
                  user={user}
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
                      chatThreads={recentConvos}
                      user={user}
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
        onOpenChangeAction={setIsModelDrawerOpen}
        selectedModel={selectedModel}
        onSelectModelAction={setSelectedModel}
      />
      <SettingsDrawer
        user={user}
        isOpen={isSettingsDrawerOpen}
        onOpenChange={setIsSettingsDrawerOpen}
      />
    </>
  );
}

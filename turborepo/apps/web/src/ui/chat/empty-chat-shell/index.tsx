"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useModelSelection } from "@/context/model-selection-context";
import { useAiChat } from "@/hooks/use-ai-chat";
import { providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import { AttachmentPopover } from "@/ui/attachment-popover";
import { FullscreenTextInputDialog } from "@/ui/fullscreen-text-input-dialog";
import { Logo } from "@/ui/logo";
import { MobileModelSelectorDrawer } from "@/ui/mobile-model-select";
import { motion } from "motion/react";
import { User } from "next-auth";
import type {
  AllModelsUnion,
  ClientContextWorkupProps
} from "@t3-chat-clone/types";
import {
  Button,
  Card,
  CardContent,
  Code,
  FileText,
  Loader,
  MessageSquare,
  Send,
  Sparkles,
  Textarea
} from "@t3-chat-clone/ui";

const suggestedPrompts = [
  {
    icon: Code,
    title: "Code Review",
    prompt:
      "Review this code and suggest improvements for better performance and readability."
  },
  {
    icon: FileText,
    title: "Write Content",
    prompt:
      "Help me write a professional email to a client about project updates."
  },
  {
    icon: MessageSquare,
    title: "Brainstorm Ideas",
    prompt: "Generate creative marketing ideas for a new mobile app launch."
  },
  {
    icon: Sparkles,
    title: "Explain Concepts",
    prompt:
      "Explain quantum computing in simple terms that a beginner can understand."
  }
];

interface ChatEmptyStateProps {
  user?: User;
  apiKeys: ClientContextWorkupProps;
}
const MAX_TEXTAREA_HEIGHT_PX = 120;

export function ChatEmptyState({ user, apiKeys }: ChatEmptyStateProps) {
  const router = useRouter();
  const { isConnected, sendChat,  } = useAiChat();
  const { selectedModel } = useModelSelection();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Local state for the input
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFullScreenInputOpen, setIsFullScreenInputOpen] = useState(false);

  const [showExpandButton, setShowExpandButton] = useState(false);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const h = Math.min(ta.scrollHeight, MAX_TEXTAREA_HEIGHT_PX);
    ta.style.height = `${h}px`;
    setShowExpandButton(ta.scrollHeight > 48);
  }, [message]);

  const handleSendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || !isConnected || isSubmitting) return;

      setIsSubmitting(true);

      try {
        const hasConfigured = apiKeys.isSet[selectedModel.provider];
        const isDefault = apiKeys.isDefault[selectedModel.provider];

        sendChat(
          messageText.trim(),
          selectedModel.provider,
          selectedModel.modelId as AllModelsUnion,
          hasConfigured,
          isDefault
        );

        const params = new URLSearchParams({ prompt: messageText.trim() });
        router.push(`/chat/new-chat?${params.toString()}`);
      } catch (error) {
        console.error("Failed to send message:", error);
        setIsSubmitting(false);
      }
    },
    [isConnected, isSubmitting, apiKeys, selectedModel, sendChat, router]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (message.trim()) {
        handleSendMessage(message);
      }
    },
    [handleSendMessage, message]
  );

  const handleFullScreenSubmit = useCallback(
    (fullText: string) => {
      setMessage(fullText);
      setIsFullScreenInputOpen(false);
      handleSendMessage(fullText);
    },
    [handleSendMessage]
  );

  const handlePromptClick = useCallback(
    (prompt: string) => {
      handleSendMessage(prompt);
    },
    [handleSendMessage]
  );

  const handleAttachmentSelect = useCallback(
    (type: "file" | "camera" | "photo") => {
      console.log("Selected attachment type:", type);
      // TODO Implement attachment logic here
    },
    []
  );
  const CurrentIcon = providerMetadata[selectedModel.provider].icon;
  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8 text-center">
        <Logo className="mx-auto mb-4 size-12 stroke-current text-current [&_path]:stroke-current" />
        <h1 className="text-brand-text mb-2 text-3xl font-bold">
          {`How can I help you today, ${user?.name?.split(" ")[0] ?? "User"}?`}
        </h1>
        <p className="text-brand-text-muted text-lg">
          Start a conversation with {selectedModel.displayName}
        </p>
      </motion.div>

      {/* Suggested Prompts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-8 grid w-full max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
        {suggestedPrompts.map((item, idx) => (
          <Card
            key={idx}
            className="hover:bg-brand-component/50 border-brand-border bg-brand-component cursor-pointer transition-colors"
            onClick={() => handlePromptClick(item.prompt)}>
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <item.icon className="text-brand-primary mt-0.5 h-5 w-5 flex-shrink-0" />
                <div>
                  <h3 className="text-brand-text mb-1 font-medium">
                    {item.title}
                  </h3>
                  <p className="text-brand-text-muted text-sm">{item.prompt}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Direct Input Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="w-full max-w-2xl">
        <form
          onSubmit={handleSubmit}
          className="bg-brand-component border-brand-border rounded-lg border-t p-2 sm:p-4">
          <div className="bg-brand-background border-brand-border relative flex min-h-[40px] items-center space-x-1 rounded-lg border p-2">
            {/* Your AttachmentPopover if needed */}
            <AttachmentPopover onSelectAttachment={handleAttachmentSelect} />

            <div className="relative flex min-h-[24px] flex-grow items-center">
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder={`Message ${selectedModel.displayName}...`}
                disabled={!isConnected || isSubmitting}
                className={cn(
                  "text-brand-text placeholder:text-brand-text-muted min-h-[24px] w-full resize-none border-none bg-transparent px-0 py-2 leading-6 focus-visible:outline-none",
                  !isConnected || isSubmitting
                    ? "cursor-not-allowed opacity-50"
                    : ""
                )}
                rows={1}
                style={{
                  maxHeight: `${MAX_TEXTAREA_HEIGHT_PX}px`,
                  lineHeight: 1.5
                }}
              />
              {showExpandButton && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsFullScreenInputOpen(true)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-text"
                  disabled={isSubmitting}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  <span className="sr-only">Expand to fullscreen</span>
                </Button>
              )}
            </div>

            <div className="flex h-full items-center justify-center space-x-1">
              {/* Model selector button */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={isSubmitting}
                onClick={() => setIsDrawerOpen(true)}
                title={`Current model: ${selectedModel.displayName}`}
                className="text-brand-text-muted hover:text-brand-text hover:bg-brand-sidebar h-8 w-8">
                <CurrentIcon />
                <span className="sr-only">Select AI model</span>
              </Button>
              <Button
                type="submit"
                size="icon"
                className="bg-brand-primary text-brand-primaryForeground hover:bg-brand-primary/90 h-8 w-8"
                disabled={!message.trim() || !isConnected || isSubmitting}>
                {isSubmitting ? (
                  <Loader className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
                <span className="sr-only">Send message</span>
              </Button>
            </div>
          </div>
        </form>
        <p className="text-brand-text-muted mt-2 text-center text-[10px] sm:text-xs">
          AI can make mistakes. Consider checking important information.
        </p>
      </motion.div>
      <FullscreenTextInputDialog
        isOpen={isFullScreenInputOpen}
        onOpenChange={setIsFullScreenInputOpen}
        initialValue={message}
        onSubmit={handleFullScreenSubmit}
      />
      <MobileModelSelectorDrawer
        isOpen={isDrawerOpen}
        onOpenChangeAction={setIsDrawerOpen}
      />
    </div>
  );
}

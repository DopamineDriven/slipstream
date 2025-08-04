// src/ui/chat/empty-chat-shell/index.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAIChatContext } from "@/context/ai-chat-context";
import { useModelSelection } from "@/context/model-selection-context";
import { providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import { AttachmentPopover } from "@/ui/chat/attachment-popover";
import { FullscreenTextInputDialog } from "@/ui/chat/fullscreen-text-input-dialog";
import { Logo } from "@/ui/logo";
import { motion } from "motion/react";
import { useSession } from "next-auth/react";
import {
  Button,
  Card,
  CardContent,
  Code,
  Expand,
  FileText,
  MessageSquare,
  Mic,
  SendMessage,
  Sparkles,
  Textarea,
  Tools
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

const MAX_TEXTAREA_HEIGHT_PX = 120;

export function ChatEmptyState() {
  const router = useRouter();
  const { data: session } = useSession();

  const { isConnected } = useAIChatContext();
  const { selectedModel, openDrawer } = useModelSelection();

  // Local state for the input
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFullScreenInputOpen, setIsFullScreenInputOpen] = useState(false);
  const [showExpandButton, setShowExpandButton] = useState(false);
  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const h = Math.min(ta.scrollHeight, MAX_TEXTAREA_HEIGHT_PX);
    ta.style.height = `${h}px`;
    setShowExpandButton(ta.scrollHeight >= 90);
  }, [message]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }
    };
  }, []);

  const handleSendMessage = useCallback(
    (messageText: string) => {
      if (!messageText.trim() || isSubmitting || !isConnected) return;

      setIsSubmitting(true);

      try {
        // Navigate to new chat with prompt as search param
        const params = new URLSearchParams({ prompt: messageText.trim() });
        router.push(`/chat/new-chat?${params.toString()}`);

        // Reset submitting state after a short delay
        submitTimeoutRef.current = setTimeout(() => {
          setIsSubmitting(false);
        }, 200);
      } catch (error) {
        console.error("Failed to navigate:", error);
        setIsSubmitting(false);
      }
    },
    [isSubmitting, router, isConnected]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement | HTMLTextAreaElement>) => {
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
      // TODO: Implement attachment logic here
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
        <h1 className="text-foreground mb-2 text-3xl font-bold">
          {`How may I help you today, ${session?.user?.name?.split(" ")[0] ?? "User"}?`}
        </h1>
        <p className="text-muted-foreground text-lg">
          {`Start a conversation with ${selectedModel.displayName}`}
        </p>
      </motion.div>

      {/* Suggested Prompts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="hidden md:mb-8 md:grid md:w-full md:max-w-2xl md:grid-cols-2 md:gap-4">
        {suggestedPrompts.map((item, idx) => (
          <Card
            key={idx}
            className="hover:bg-accent/50 bg-card cursor-pointer border transition-colors"
            onClick={() => handlePromptClick(item.prompt)}>
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <item.icon className="text-primary mt-0.5 size-5 flex-shrink-0" />
                <div>
                  <h3 className="text-foreground mb-1 font-medium">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground text-sm">{item.prompt}</p>
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
        <form onSubmit={handleSubmit}>
          <div className="group bg-background focus-within:ring-ring/20 rounded-lg border transition-colors focus-within:ring-1 focus-within:ring-offset-0">
            <div className="p-3 pb-2">
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
                  "min-h-[60px] w-full resize-none border-none bg-transparent p-0 text-base leading-6 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
                  !isConnected || isSubmitting ? "cursor-not-allowed" : ""
                )}
                rows={3}
                style={{
                  maxHeight: `${MAX_TEXTAREA_HEIGHT_PX}px`
                }}
              />
              {showExpandButton && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title="Expand to fullscreen"
                  onClick={() => setIsFullScreenInputOpen(true)}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                  disabled={isSubmitting}>
                  <Expand className="size-4" />
                  <span className="sr-only">Expand to fullscreen</span>
                </Button>
              )}
            </div>
            <div className="bg-muted/20 flex items-center justify-between border-t px-3 py-2">
              <div className="flex items-center space-x-2">
                <AttachmentPopover
                  onSelectAttachment={handleAttachmentSelect}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Tools and settings"
                  className="text-muted-foreground hover:text-foreground hover:bg-accent h-8">
                  <Tools className="size-4" />
                  <span className="sr-only">Tools</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Voice to text"
                  className="text-muted-foreground hover:text-foreground hover:bg-accent h-8">
                  <Mic className="size-4" />
                  <span className="sr-only">Voice input</span>
                </Button>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isSubmitting}
                  onClick={openDrawer}
                  title={`Select model`}
                  className="text-muted-foreground hover:text-foreground hover:bg-accent h-8">
                  <CurrentIcon className="size-5" />
                  <span className="sr-only">{`Select model (current: ${selectedModel.displayName})`}</span>
                </Button>
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  title="Submit prompt"
                  className="text-muted-foreground hover:text-foreground hover:bg-accent h-8"
                  onClick={e => {
                    e.preventDefault();
                    handleSendMessage(message.trim());
                  }}
                  disabled={!message.trim() || !isConnected || isSubmitting}>
                  <SendMessage className="size-5" />
                  <span className="sr-only">{`Submit Prompt`}</span>
                </Button>
              </div>
            </div>
          </div>
        </form>
        <p className="text-muted-foreground mt-2 text-center text-xxs">
          AI can make mistakes. Consider checking important information.
        </p>
      </motion.div>
      <FullscreenTextInputDialog
        isOpen={isFullScreenInputOpen}
        onOpenChange={setIsFullScreenInputOpen}
        initialValue={message}
        onSubmit={handleFullScreenSubmit}
      />
    </div>
  );
}

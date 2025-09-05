"use client";

import type { AttachmentPreview } from "@/hooks/use-asset-metadata";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAIChatContext } from "@/context/ai-chat-context";
import { useAssetUpload } from "@/context/asset-context";
import { useModelSelection } from "@/context/model-selection-context";
import { useAssets } from "@/hooks/use-assets";
import { providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import { AttachmentPopover } from "@/ui/chat/attachment-popover";
import { AttachmentPreviewComponent } from "@/ui/chat/attachment-preview";
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
  Tools,
  UploadProgress
} from "@t3-chat-clone/ui";

const suggestedPrompts = [
  {
    icon: Code,
    title: "AI Coding Starter",
    prompt:
      "What's the best way to get started with AI-assisted programming? Suggest tools, languages, and simple projects."
  },
  {
    icon: FileText,
    title: "Templatize",
    prompt:
      "Help me draft up a professional email template that I can send to clients about project updates."
  },
  {
    icon: MessageSquare,
    title: "Brainstorm Ideas",
    prompt:
      "Generate creative marketing ideas for novel AI integrations into everyday products."
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
  const assetUpload = useAssetUpload(); // clean upload layer

  // Local input state
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFullScreenInputOpen, setIsFullScreenInputOpen] = useState(false);
  const [showExpandButton, setShowExpandButton] = useState(false);
  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // UI-only assets (previews, thumbnails, local metadata)
  const assets = useAssets({
    max: 10,
    allowedTypes: ["image/*", "application/pdf", "text/markdown", "text/plain"]
  });

  // Track latest attachments for pre/post diffs
  const attachmentsRef = useRef<AttachmentPreview[]>(assets.attachments);
  useEffect(() => {
    attachmentsRef.current = assets.attachments;
  }, [assets.attachments]);

  // Track upload status for previews using AssetProvider as source of truth
  const getStatusText = useCallback(
    (attachment: AttachmentPreview): string => {
      const t = assetUpload.getByPreviewId(attachment.id);
      if (t) {
        switch (t.status) {
          case "UPLOADING":
            return `Uploading ${Math.max(0, t.progress ?? 0)}%`;
          case "READY":
            return "Ready";
          case "FAILED":
            return "Failed";
          case "REQUESTED":
          default:
            return "Pending";
        }
      }
      // Fallback to local preview status if not tracked yet
      switch (attachment.status) {
        case "uploading":
          return `Uploading ${assetUpload.uploadProgress}%`;
        case "uploaded":
          return "Ready";
        case "error":
          return "Failed";
        default:
          return "Pending";
      }
    },
    [assetUpload]
  );

  // Auto-resize textarea
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
        const params = new URLSearchParams({ prompt: messageText.trim() });
        router.replace(`/chat/new-chat?${params.toString()}`, {
          scroll: false
        });
        assets.clear();
        submitTimeoutRef.current = setTimeout(() => {
          setIsSubmitting(false);
        }, 200);
      } catch (err) {
        console.error("Failed to navigate:", err);
        setIsSubmitting(false);
        assets.clear();
      }
    },
    [isSubmitting, isConnected, router, assets]
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

  // Helper: register only newly added attachments (origin-aware)
  const registerNewlyAdded = useCallback(
    (beforeIds: Set<string>, origin: "UPLOAD" | "PASTED" | "SCREENSHOT") => {
      // Empty shell starts a new chat; use "new-chat"
      const convId = "new-chat";
      setTimeout(() => {
        const after = attachmentsRef.current;
        const newlyAdded = after.filter(a => !beforeIds.has(a.id));
        if (newlyAdded.length > 0) {
          assetUpload.registerAssets(newlyAdded, convId, origin);
        }
      }, 0);
    },
    [assetUpload]
  );

  // Paste flow: add previews → register delta
  const handleEnhancedPaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const beforeIds = new Set(attachmentsRef.current.map(a => a.id));
      await assets.handlePaste(e);
      registerNewlyAdded(beforeIds, "PASTED");
    },
    [assets, registerNewlyAdded]
  );

  // Popover flow: add previews → register delta
  const handleFilesFromPopover = useCallback(
    async (files: File[]) => {
      const beforeIds = new Set(attachmentsRef.current.map(a => a.id));
      for (const file of files) {
        await assets.addFile(file);
      }
      registerNewlyAdded(beforeIds, "UPLOAD");
    },
    [assets, registerNewlyAdded]
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
        {assets.attachments.length > 0 && (
          <div className="mb-1.5">
            <div className="relative">
              <AttachmentPreviewComponent
                attachments={assets.attachments}
                onRemove={assets.remove}
                thumbnails={assets.thumbnails}
                metadata={assets.metadata}
                getStatusText={getStatusText}
                getStatusColor={assets.getStatusColor}
                formatFileSize={assets.formatFileSize}
              />
              {assetUpload.isUploading && (
                <div className="bg-background absolute -top-2 -right-2 rounded-full border p-1 shadow-lg">
                  <UploadProgress
                    progress={assetUpload.uploadProgress}
                    size="sm"
                    showPercentage={false}
                  />
                </div>
              )}
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="group bg-background focus-within:ring-ring/20 rounded-lg border transition-colors focus-within:ring-1 focus-within:ring-offset-0">
            <div className="p-3 pb-2">
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={e => setMessage(e.target.value)}
                onPaste={handleEnhancedPaste}
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
                style={{ maxHeight: `${MAX_TEXTAREA_HEIGHT_PX}px` }}
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
                <AttachmentPopover onFilesSelected={handleFilesFromPopover} />
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
                  title="Select model"
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
                  disabled={!message.trim() || !isConnected || isSubmitting}>
                  <SendMessage className="size-5" />
                  <span className="sr-only">Submit Prompt</span>
                </Button>
              </div>
            </div>
          </div>
        </form>
        <p className="text-muted-foreground text-xxs mt-2 text-center">
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

"use client";

import type { AttachmentPreview } from "@/hooks/use-asset-metadata";
import type { Properties } from "csstype";
import type { User } from "next-auth";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAssetUpload } from "@/context/asset-context";
import { useModelSelection } from "@/context/model-selection-context";
import { useAssets } from "@/hooks/use-assets";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import { AttachmentPopover } from "@/ui/chat/attachment-popover";
import { AttachmentPreviewComponent } from "@/ui/chat/attachment-preview";
import { FullscreenTextInputDialog } from "@/ui/chat/fullscreen-text-input-dialog";
import { MobileModelSelectorDrawer } from "@/ui/chat/mobile-model-selector-drawer";
import { motion } from "motion/react";
import {
  Button,
  ChevronDown,
  Expand,
  Loader,
  Mic,
  SendMessage,
  Textarea,
  Tools,
  UploadProgress
} from "@t3-chat-clone/ui";

const MAX_TEXTAREA_HEIGHT_PX = 120;
const INITIAL_TEXTAREA_HEIGHT_PX = 24;
type QuoteDraft = {
  messageId: string;
  excerpt: string;
  kind: "text" | "code";
  language?: string;
  selector: { exact: string; prefix?: string; suffix?: string };
};

interface UnifiedChatInputProps {
  user?: User;
  conversationId?: string;
  onUserMessage?: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  isConnected: boolean;
  activeConversationId: string | null;
}

export function ChatInput({
  user: _user,
  conversationId,
  onUserMessage,
  disabled = false,
  activeConversationId,
  isConnected,
  placeholder,
  className
}: UnifiedChatInputProps) {
  const { selectedModel, openDrawer } = useModelSelection();
  const assetUpload = useAssetUpload(); // Upload layer
  const [quotes, setQuotes] = useState<QuoteDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExpandButton, setShowExpandButton] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFullScreenInputOpen, setIsFullScreenInputOpen] = useState(false);
  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const CurrentIcon = providerMetadata[selectedModel.provider].icon;
  const isMobile = useIsMobile();
  const isLockedRef = useRef(false);

  // Use the assets hook for UI layer (previews, metadata)
  const assets = useAssets({
    max: 10,
    allowedTypes: ["image/*", "application/pdf", "text/markdown", "text/plain"]
  });

  // Helper to get real status text for display
  const attachmentsRef = useRef<AttachmentPreview[]>(assets.attachments);
  useEffect(() => {
    attachmentsRef.current = assets.attachments;
  }, [assets.attachments]);

  // Track upload status - keep simplified UI status for basic display
  // Simple status text for previews (no per-item task map anymore)
  const getStatusText = useCallback(
    (attachment: AttachmentPreview): string => {
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
    [assetUpload.uploadProgress]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<QuoteDraft>).detail;
      if (!detail) return;
      setQuotes(prev => {
        // dedupe identical quotes
        const key = JSON.stringify(detail);
        const has = prev.some(q => JSON.stringify(q) === key);
        return has ? prev : [...prev, detail];
      });
    };
    window.addEventListener("chat:quote", handler as EventListener);
    return () =>
      window.removeEventListener("chat:quote", handler as EventListener);
  }, []);

  const removeQuote = (i: number) =>
    setQuotes(prev => prev.filter((_, idx) => idx !== i));

  const jumpToOriginal = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("quote-flash");
    setTimeout(() => el.classList.remove("quote-flash"), 1600);
  };

  const formatAsMarkdown = (q: QuoteDraft) => {
    if (q.kind === "code") {
      const lang = q.language ?? "";
      return `\`\`\`${lang}\n${q.excerpt}\n\`\`\``;
    }
    // blockquote each line
    return q.excerpt
      .split("\n")
      .map(l => `> ${l}`)
      .join("\n");
  };

  // Monitor scroll state
  useEffect(() => {
    const checkScrollState = () => {
      const chatFeed = document.querySelector(
        "[data-chat-feed]"
      ) as HTMLDivElement | null;
      if (!chatFeed) return;

      const distanceFromBottom =
        chatFeed.scrollHeight - (chatFeed.scrollTop + chatFeed.clientHeight);
      setShowScrollButton(distanceFromBottom > 100);
    };

    const chatFeed = document.querySelector("[data-chat-feed]");
    if (chatFeed) {
      chatFeed.addEventListener("scroll", checkScrollState, { passive: true });
      checkScrollState(); // Initial check
    }

    return () => {
      if (chatFeed) {
        chatFeed.removeEventListener("scroll", checkScrollState);
      }
    };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    ta.style.height = "auto";
    const h = Math.min(ta.scrollHeight, MAX_TEXTAREA_HEIGHT_PX);
    ta.style.height = `${h}px`;
    setShowExpandButton(ta.scrollHeight >= 90);
  }, [message]);

  const handleSend = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isLockedRef.current === true) return;

      const trimmedMessage = message.trim();
      if (!trimmedMessage || disabled || isSubmitting || !isConnected) return;
      isLockedRef.current = true;
      setIsSubmitting(true);
      const quotedMarkdown = quotes.map(formatAsMarkdown).join("\n\n");
      const composed = quotedMarkdown
        ? `${quotedMarkdown}\n\n${trimmedMessage}`
        : trimmedMessage;
      try {
        console.log(
          `[ChatInput] Sending message in conversation: ${activeConversationId ?? conversationId}`
        );

        // Call parent's handler if provided
        onUserMessage?.(composed);

        // Clear message immediately for better UX
        setMessage("");
        setQuotes([]);
        assets.clear();

        // Reset textarea height
        if (textareaRef.current) {
          textareaRef.current.style.height = `${INITIAL_TEXTAREA_HEIGHT_PX}px`;
        }
        setShowExpandButton(false);

        // Reset submitting state after a short delay
        submitTimeoutRef.current = setTimeout(() => {
          setIsSubmitting(false);
          isLockedRef.current = false;
        }, 300);
      } catch (error) {
        console.error("Failed to send message:", error);
        setIsSubmitting(false);
      }
    },
    [
      quotes,
      isSubmitting,
      message,
      onUserMessage,
      disabled,
      isConnected,
      activeConversationId,
      conversationId,
      assets
    ]
  );

  const handleFullscreenSubmit = useCallback((fullText: string) => {
    setMessage(fullText);
    setIsFullScreenInputOpen(false);
  }, []);

  const registerNewlyAdded = useCallback(
    (
      beforeIds: Set<string>,
      origin: "UPLOAD" | "PASTED" | "SCREENSHOT" = "UPLOAD"
    ) => {
      const convId = activeConversationId ?? "new-chat";
      // wait a tick for React state to flush
      setTimeout(() => {
        const after = attachmentsRef.current;
        const newlyAdded = after.filter(a => !beforeIds.has(a.id));
        if (newlyAdded.length > 0) {
          assetUpload.registerAssets(newlyAdded, convId, origin);
        }
      }, 0);
    },
    [assetUpload, activeConversationId]
  );

  // Enhanced paste handler that works with both layers
  const handleEnhancedPaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const beforeIds = new Set(attachmentsRef.current.map(a => a.id));
      await assets.handlePaste(e);
      registerNewlyAdded(beforeIds, "PASTED");
      // await assets.handlePaste(e);

      // // Then register any new attachments with the upload layer
      // if (assets.attachments.length > 0) {
      //   const convId = activeConversationId ?? "new-chat";
      //   // Just register - context handles everything
      //   assetUpload.registerAssets(assets.attachments, convId, "PASTED");
      // }
    },
    [assets, registerNewlyAdded]
  );

  // // Handle files selected from attachment popover
  // const handleFilesFromPopover = useCallback(
  //   async (files: File[]) => {
  //     // Add files to the assets UI layer
  //     for (const file of files) {
  //       await assets.addFile(file);
  //     }

  //     // Register with upload layer if we have attachments
  //     if (assets.attachments.length > 0) {
  //       const convId = activeConversationId ?? "new-chat";
  //       // Just register - context handles everything
  //       assetUpload.registerAssets(assets.attachments, convId, "UPLOAD");
  //     }
  //   },
  //   [assets, assetUpload, activeConversationId]
  // );
  // Popover files → add previews → register new ones with AssetProvider
  const handleFilesFromPopover = useCallback(
    async (files: File[]) => {
      const beforeIds = new Set(attachmentsRef.current.map(a => a.id));
      for (const file of files) {
        // addFile likely sets state asynchronously; we diff after
        await assets.addFile(file);
      }
      registerNewlyAdded(beforeIds, "UPLOAD");
    },
    [assets, registerNewlyAdded]
  );

  const handleScrollToBottom = () => {
    window.chatScrollToBottom?.();
  };

  const effectivePlaceholder = useMemo(
    () => placeholder ?? `Shoot ${selectedModel.displayName} a message...`,
    [placeholder, selectedModel.displayName]
  );

  const isDisabled = !isConnected || isSubmitting || disabled;

  const onKeydownCb = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (isMobile) return;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    },
    [isMobile]
  );

  return (
    <>
      <div className={cn("bg-background border-t px-4", className)}>
        {quotes.length > 0 && (
          <div className="mx-auto w-full max-w-3xl pt-3">
            <div className="bg-muted/40 rounded-lg border p-2">
              <div className="flex flex-wrap gap-2">
                {quotes.map((q, i) => (
                  <div
                    key={i}
                    className="bg-background flex items-start gap-2 rounded-md border px-2 py-1 shadow-sm">
                    <button
                      type="button"
                      className="text-muted-foreground max-w-[48ch] truncate font-mono text-xs"
                      title="Jump to original"
                      onClick={() => jumpToOriginal(q.messageId)}>
                      {q.kind === "code" ? "``` " : "❝ "}
                      {q.excerpt.replace(/\s+/g, " ").slice(0, 120)}
                      {q.excerpt.length > 120 ? "…" : ""}
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground ml-1 text-xs"
                      onClick={() => removeQuote(i)}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mx-auto w-full max-w-3xl">
          {/* Attachment previews */}
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
          {/* Scroll to bottom button */}
          <div className="relative">
            <div className="pointer-events-none absolute top-[-40px] flex w-full items-center justify-center">
              <Button
                variant="secondary"
                size="icon"
                onClick={handleScrollToBottom}
                className={cn(
                  "bg-background border-border pointer-events-auto h-7 w-7 rounded-full border shadow-lg hover:opacity-75 hover:shadow-xl",
                  "transition-all duration-200 ease-[cubic-bezier(0.31,0.1,0.08,0.96)]",
                  showScrollButton
                    ? "animate-floating-bob pointer-events-auto translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-2 opacity-0"
                )}
                style={{ "--bob-multiplier": 0.7 }}
                aria-label="Scroll to bottom">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={handleSend} ref={formRef}>
              <div className="group bg-background focus-within:ring-ring/20 rounded-lg border transition-colors focus-within:ring-1 focus-within:ring-offset-0">
                <div className="p-3 pb-2">
                  <Textarea
                    ref={textareaRef}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onPaste={handleEnhancedPaste}
                    onKeyDown={onKeydownCb}
                    placeholder={effectivePlaceholder}
                    disabled={isDisabled}
                    className={cn(
                      "min-h-[60px] w-full resize-none border-none bg-transparent p-0 text-base leading-6 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
                      isDisabled ? "cursor-not-allowed" : ""
                    )}
                    rows={2}
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

                {/* Controls Row - matching empty-chat-shell exactly */}
                <div className="bg-muted/20 flex items-center justify-between border-t px-3 py-2">
                  <div className="flex items-center space-x-2">
                    <AttachmentPopover
                      onFilesSelected={handleFilesFromPopover}
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
                      disabled={!message.trim() || isDisabled}>
                      {isSubmitting ? (
                        <Loader className="h-5 w-5 animate-spin" />
                      ) : (
                        <SendMessage className="size-5" />
                      )}
                      <span className="sr-only">{`Submit Prompt`}</span>
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
      <FullscreenTextInputDialog
        isOpen={isFullScreenInputOpen}
        onOpenChange={setIsFullScreenInputOpen}
        initialValue={message}
        onSubmit={handleFullscreenSubmit}
      />
      <MobileModelSelectorDrawer />
    </>
  );
}

declare module "react" {
  export interface CSSProperties extends Properties<string | number> {
    "--bob-multiplier"?: number;
  }
}

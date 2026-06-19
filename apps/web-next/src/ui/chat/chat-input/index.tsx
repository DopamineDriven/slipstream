"use client";

import type { AttachmentPreview } from "@/hooks/use-asset-metadata";
import type { User } from "@/utils/auth-client";
import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  SubmitEvent as ReactSubmitEvent,
  RefObject
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAssetUpload } from "@/context/asset-context";
import { useCookiesCtx } from "@/context/cookie-context";
import { useImageGen } from "@/context/image-gen-context";
import { useModelSelection } from "@/context/model-selection-context";
import { usePathnameContext } from "@/context/pathname-context";
import { useAssets } from "@/hooks/use-assets";
import { providerMetadata } from "@/lib/models";
import { cn } from "@/lib/utils";
import { AttachmentPreviewComponent } from "@/ui/chat/attachment-preview";
import { ChatInputImageGenSettingsDrawer } from "@/ui/chat/chat-input/image-gen-controls";
import { FullscreenTextInputDialog } from "@/ui/chat/fullscreen-text-input-dialog";
import { motion } from "motion/react";
import type { AIChatRequestImgGenFields } from "@slipstream/types";
import {
  Button,
  Camera,
  Expand,
  FileText,
  ImageGen,
  ImageIcon,
  Loader,
  Mic,
  Plus,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SendMessage,
  Textarea,
  Tools,
  UploadProgress
} from "@slipstream/ui";

const MAX_TEXTAREA_HEIGHT_PX = 144;
const INITIAL_TEXTAREA_HEIGHT_PX = 48;
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
  onUserMessage?: (payload: {
    content: string;
    attachments?: AttachmentPreview[];
    batchId?: string;
    imgGenEnabled?: boolean;
    imgGenFields?: AIChatRequestImgGenFields;
  }) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  isConnected: boolean;
  activeConversationId: string | null;
  handlePromptConsumed: () => void;
  initialPrompt?: string | null;
  autoSubmitInitialPrompt?: boolean;
  children?: ReactNode;
}

const ATTACHMENT_OPTIONS = [
  { id: "file", label: "Files", icon: FileText },
  { id: "camera", label: "Camera", icon: Camera },
  { id: "photo", label: "Photos", icon: ImageIcon }
] as const;

export function ChatInput({
  user: _user,
  conversationId,
  onUserMessage,
  disabled = false,
  activeConversationId,
  isConnected,
  placeholder,
  className,
  handlePromptConsumed,
  initialPrompt,
  children,
  autoSubmitInitialPrompt = true
}: UnifiedChatInputProps) {
  const router = useRouter();

  const [openAttach, setOpenAttach] = useState(false);

  const { selectedModel, openDrawer } = useModelSelection();

  const assetUpload = useAssetUpload();

  const [quotes, setQuotes] = useState<QuoteDraft[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showExpandButton, setShowExpandButton] = useState(false);
  const [isImageSettingsOpen, setIsImageSettingsOpen] = useState(false);

  const [message, setMessage] = useState("");
  const imgGen = useImageGen();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [isFullScreenInputOpen, setIsFullScreenInputOpen] = useState(false);

  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  const CurrentIcon = providerMetadata[selectedModel.provider].icon;
  const { get } = useCookiesCtx();
  const isMobile = get("viewport") === "mobile";

  const isLockedRef = useRef(false);

  const { isHome } = usePathnameContext();

  const assets = useAssets({
    max: 10,
    allowedTypes: [
      "image/*",
      "application/text",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/markdown",
      "text/plain"
    ]
  });

  const attachmentsRef = useRef<AttachmentPreview[]>(assets.attachments);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const photoRef = useRef<HTMLInputElement | null>(null);

  const camRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    attachmentsRef.current = assets.attachments;
  }, [assets.attachments]);

  useEffect(() => {
    if (!imgGen.supported || !imgGen.enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsImageSettingsOpen(false);
    }
  }, [imgGen.enabled, imgGen.supported]);

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

  const attachmentsReadyForSend = useMemo(() => {
    if (assets.attachments.length === 0) return true;
    return assets.attachments.every(attachment => {
      const task = assetUpload.getByPreviewId(attachment.id);
      if (!task) return false;
      const hasResolvedUrl = task.cdnUrl != null || task.publicUrl != null;
      return task.status === "READY" && hasResolvedUrl;
    });
  }, [assetUpload, assets.attachments]);

  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }
    };
  }, []);

  const handleImageSettingsClick = useCallback(() => {
    if (!imgGen.supported) return;
    if (!imgGen.enabled) {
      imgGen.setEnabled(true);
      setIsImageSettingsOpen(true);
      return;
    }
    setIsImageSettingsOpen(prev => !prev);
  }, [imgGen]);

  const handleToggleImageMode = useCallback(() => {
    if (!imgGen.supported) return;
    if (imgGen.enabled) {
      imgGen.setEnabled(false);
      setIsImageSettingsOpen(false);
      return;
    }
    imgGen.setEnabled(true);
  }, [imgGen]);

  // Consume an initial prompt passed from parent (or recovered from sessionStorage)
  useEffect(() => {
    const propPrompt = initialPrompt?.trim();
    let prompt: string | null = propPrompt ?? null;
    if (!prompt) {
      try {
        const stored = sessionStorage.getItem("chat.initialPrompt");
        if (stored) prompt = stored.trim();
      } catch (err) {
        console.log(err);
      }
    }
    if (!prompt) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessage(prompt);
    if (autoSubmitInitialPrompt) {
      if (isHome) router.replace("/chat/new-chat", { scroll: false });
      requestAnimationFrame(() => formRef.current?.requestSubmit());
    }
    try {
      sessionStorage.removeItem("chat.initialPrompt");
    } catch (err) {
      console.log(err);
    } finally {
      handlePromptConsumed();
    } // eslint-disable-next-line
  }, [initialPrompt]);

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
    (e: ReactSubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isLockedRef.current === true) return;

      const trimmedMessage = message.trim();

      if (
        !trimmedMessage ||
        disabled ||
        isSubmitting ||
        !isConnected ||
        !attachmentsReadyForSend
      )
        return;

      isLockedRef.current = true;
      setIsSubmitting(true);
      const quotedMarkdown = quotes.map(formatAsMarkdown).join("\n\n");
      const composed =
        quotedMarkdown ?
          `${quotedMarkdown}\n\n${trimmedMessage}`
        : trimmedMessage;
      if (isHome) {
        try {
          sessionStorage.setItem("chat.initialPrompt", composed);
          // Persist any current attachments for optimistic display across navigation
          const optimistic = attachmentsRef.current;
          if (optimistic.length > 0) {
            const batchId = assetUpload.getBatchId();
            const payload = optimistic.map(a => {
              const info = assetUpload.getByPreviewId(a.id);
              return {
                id: a.id,
                filename: a.filename,
                mime: a.mime,
                size: a.size,
                width: a.width,
                height: a.height,
                draftId: info?.draftId ?? null,
                cdnUrl: info?.cdnUrl ?? null,
                publicUrl: info?.publicUrl ?? null
              };
            });
            sessionStorage.setItem(
              "chat.initialAttachments",
              JSON.stringify(payload)
            );
            if (batchId) {
              sessionStorage.setItem("chat.initialAttachmentsBatchId", batchId);
            }
          }
        } catch (err) {
          console.log(err);
        }
        router.push(`/chat/new-chat`, { scroll: false });
        setIsSubmitting(false);
        isLockedRef.current = false;
        return;
      }
      try {
        console.log(
          `[ChatInput] Sending message in conversation: ${activeConversationId ?? conversationId}`
        );

        const optimistic = attachmentsRef.current;
        const batchId =
          optimistic.length > 0 ? assetUpload.getBatchId() : undefined;

        onUserMessage?.({
          content: composed,
          attachments: optimistic,
          batchId,
          imgGenEnabled: imgGen.enabled || undefined,
          imgGenFields: imgGen.enabled ? imgGen.fields : undefined
        });

        setMessage("");
        setQuotes([]);
        assets.clear();

        assetUpload.finalizeCurrentBatch();

        if (textareaRef.current) {
          textareaRef.current.style.height = `${INITIAL_TEXTAREA_HEIGHT_PX}px`;
        }
        setShowExpandButton(false);

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
      router,
      isHome,
      imgGen.enabled,
      imgGen.fields,
      assetUpload,
      onUserMessage,
      disabled,
      isConnected,
      attachmentsReadyForSend,
      activeConversationId,
      conversationId,
      assets
    ]
  );

  const handleFullscreenSubmit = useCallback((fullText: string) => {
    setMessage(fullText);
    setIsFullScreenInputOpen(false);
  }, []);

  const handleEnhancedPaste = useCallback(
    async (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
      const created = await assets.handlePaste(e);
      if (created && created.length > 0) {
        const convId = activeConversationId ?? "new-chat";
        const enriched = created.map(a => ({
          ...a,
          metadata: assets.metadata[a.id] ?? a.metadata,
          size: assets.metadata[a.id]?.byteSize ?? a.size
        }));
        assetUpload.registerAssets(enriched, convId, "PASTED");
      }
    },
    [assets, assetUpload, activeConversationId]
  );

  const handleFilesFromPopover = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const convId = activeConversationId ?? "new-chat";
      const batchId = assetUpload.getBatchId();

      const created: AttachmentPreview[] = [];
      for (const f of files) {
        const added = await assets.addFile(f);
        if (added) created.push(added);
      }
      if (created.length) {
        const enriched = created.map(a => ({
          ...a,
          metadata: assets.metadata[a.id] ?? a.metadata,
          size: assets.metadata[a.id]?.byteSize ?? a.size
        }));
        assetUpload.registerAssets(enriched, convId, "UPLOAD", batchId);
      }
      setOpenAttach(false);
    },
    [assets, assetUpload, activeConversationId]
  );

  const onInputChange = useCallback(
    (list: FileList | null) => {
      if (!list?.length) return;
      handleFilesFromPopover(Array.from(list));
    },
    [handleFilesFromPopover]
  );

  const clickAndReset = (ref: RefObject<HTMLInputElement | null>) => {
    const el = ref.current;
    if (!el) return;
    el.value = "";
    el.click();
  };
  const fileMemo = useMemo(
    () =>
      (
        selectedModel.provider === "openai" ||
        selectedModel.provider === "anthropic" ||
        selectedModel.provider === "gemini" ||
        selectedModel.provider === "grok"
      ) ?
        ".md,.txt,.pdf,.docx,.xlsx,.pptx,application/text,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf,text/markdown,application/*,text/*"
      : ".pdf,.docx,application/*,text/*",
    [selectedModel.provider]
  );

  const effectivePlaceholder = useMemo(
    () => placeholder ?? `Shoot ${selectedModel.displayName} a message...`,
    [placeholder, selectedModel.displayName]
  );

  const isDisabled = !isConnected || isSubmitting || disabled;
  const isSendDisabled =
    !message.trim() || isDisabled || !attachmentsReadyForSend;

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
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        hidden={true}
        aria-hidden="true"
        tabIndex={-1}
        accept={fileMemo}
        onChange={e => {
          onInputChange(e.target.files);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={photoRef}
        type="file"
        multiple
        hidden={true}
        aria-hidden="true"
        tabIndex={-1}
        className="hidden"
        accept="image/*"
        onChange={e => {
          onInputChange(e.target.files);
          e.currentTarget.value = "";
        }}
      />
      <input
        hidden={true}
        ref={camRef}
        type="file"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        accept="image/*"
        capture="environment"
        onChange={e => {
          onInputChange(e.target.files);
          e.currentTarget.value = "";
        }}
      />
      <div className={cn("w-full px-4", className)}>
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
          transition={{ duration: 0.5 }}
          className="mx-auto w-full max-w-2xl">
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
          <div className="relative">
            {children}
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
                      "min-h-15 w-full resize-none border-none bg-transparent p-0 text-base leading-6 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
                      isDisabled ? "cursor-not-allowed" : ""
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
                    <Popover open={openAttach} onOpenChange={setOpenAttach}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Attach"
                          className="text-muted-foreground hover:text-foreground hover:bg-accent h-8 sm:h-auto sm:w-auto">
                          <Plus className="size-4" />
                          <span className="sr-only">Attach</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-48 p-2"
                        side="top"
                        align="center">
                        <div className="space-y-1">
                          {ATTACHMENT_OPTIONS.map(opt => (
                            <Button
                              key={opt.id}
                              variant="ghost"
                              className="hover:bg-accent w-full justify-start"
                              onClick={() => {
                                setOpenAttach(false);
                                requestAnimationFrame(() => {
                                  if (opt.id === "file") clickAndReset(fileRef);
                                  if (opt.id === "photo")
                                    clickAndReset(photoRef);
                                  if (opt.id === "camera")
                                    clickAndReset(camRef);
                                });
                              }}>
                              <opt.icon className="mr-2 size-4" />
                              {opt.label}
                            </Button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title={
                        imgGen.supported ? "Image settings" : (
                          "Image settings unavailable for selected model"
                        )
                      }
                      className="text-muted-foreground hover:text-foreground hover:bg-accent h-8"
                      onClick={handleImageSettingsClick}>
                      <Tools className="size-4" />
                      <span className="sr-only">Image settings</span>
                    </Button>
                    <Button
                      type="button"
                      variant={imgGen.enabled ? "default" : "ghost"}
                      size="icon"
                      title={
                        imgGen.supported ?
                          imgGen.enabled ?
                            "Disable image generation"
                          : "Enable image generation"
                        : "Selected model does not support image generation"
                      }
                      disabled={!imgGen.supported}
                      className={cn(
                        imgGen.enabled ?
                          "hover:bg-accent text-foreground h-8"
                        : "hover:bg-accent text-muted-foreground hover:text-foreground h-8"
                      )}
                      onClick={handleToggleImageMode}>
                      <ImageGen className="size-4" />
                      <span className="sr-only">Toggle Image Generation</span>
                    </Button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Voice to text"
                      className="text-muted-foreground hover:text-foreground hover:bg-accent h-8">
                      <Mic className="size-4" />
                      <span className="sr-only">Voice Input</span>
                    </Button>
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
                      title={
                        attachmentsReadyForSend ? "Submit prompt" : (
                          "Waiting for attachments"
                        )
                      }
                      className="text-muted-foreground hover:text-foreground hover:bg-accent h-8"
                      disabled={isSendDisabled}>
                      {isSubmitting ?
                        <Loader className="h-5 w-5 animate-spin" />
                      : <SendMessage className="size-5" />}
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
      <ChatInputImageGenSettingsDrawer
        open={isImageSettingsOpen}
        onOpenChangeAction={setIsImageSettingsOpen}
        isMobile={isMobile}
      />
    </>
  );
}

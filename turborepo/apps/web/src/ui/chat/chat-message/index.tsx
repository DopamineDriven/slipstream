// src/ui/chat-message/index.tsx
"use client";

import type { User } from "next-auth";
import type { JSX, ReactNode } from "react";
import { memo, useEffect, useRef, useState } from "react";
import { providerMetadata } from "@/lib/models";
import { processMarkdownToReact } from "@/lib/processor";
import { cn } from "@/lib/utils";
import { UIMessage } from "@/types/shared";
import { AnimatedCopyButton } from "@/ui/atoms/animated-copy-button";
import { motion } from "motion/react";
import type {
  AllModelsUnion,
  AnthropicModelIdUnion,
  GeminiModelIdUnion,
  GrokModelIdUnion,
  OpenAiModelIdUnion,
  Provider
} from "@t3-chat-clone/types";
import {
  defaultModelIdByProvider,
  getDisplayNameByModelId
} from "@t3-chat-clone/types";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Check,
  PenLine,
  Textarea,
  User as UserIcon,
  X
} from "@t3-chat-clone/ui";

interface ChatMessageProps {
  message: UIMessage;
  onUpdateMessage?: (messageId: string, newText: string) => void;
  className?: string;
  user: User;
  isStreaming?: boolean;
}

// Global cache for processed markdown
const markdownCache = new Map<string, ReactNode>();

function getModelDisplayName(toProvider: Provider, modelId: string | null) {
  const model = (modelId ??
    defaultModelIdByProvider[toProvider]) as AllModelsUnion;

  return toProvider === "anthropic"
    ? getDisplayNameByModelId(toProvider, model as AnthropicModelIdUnion)
    : toProvider === "gemini"
      ? getDisplayNameByModelId(toProvider, model as GeminiModelIdUnion)
      : toProvider === "grok"
        ? getDisplayNameByModelId(toProvider, model as GrokModelIdUnion)
        : getDisplayNameByModelId(toProvider, model as OpenAiModelIdUnion);
}

// Lightweight markdown processor for streaming

/**
 * Lightweight markdown processor for streaming messages
 * Supports:
 * - Headings (# to ######)
 * - Bold (**text**)
 * - Italic (*text*)
 * - Inline code (`code`)
 * - Code blocks (```language)
 * - Links ([text](url))
 * - Blockquotes (> text)
 * - Horizontal rules (---, ***, ___)
 * - Tables (with header separator)
 * - Unordered lists (-, *, +)
 * - Ordered lists (1., 2., etc.)
 */
function processStreamingMarkdown(content: string): ReactNode {
  const blocks = content.split("\n\n");

  return (
    <>
      {blocks.map((block, i) => {
        if (!block.trim()) return null;

        // Handle horizontal rules
        if (/^[-*_]{3,}$/.test(block.trim())) {
          return <hr key={i} className="border-brand-border my-4" />;
        }

        // Handle code blocks
        if (block.startsWith("```")) {
          const lines = block.split("\n");
          const language = lines?.[0]?.slice(3) ?? "text";
          const code = lines.slice(1, -1).join("\n");

          return (
            <pre
              key={i}
              lang={language}
              className="my-2 overflow-x-auto rounded-md bg-slate-800 p-3">
              <code className={`text-sm text-slate-100 language-${language}`}>
                {code}
              </code>
            </pre>
          );
        }

        // Handle blockquotes
        if (block.startsWith(">")) {
          const quoteLines = block
            .split("\n")
            .map(line => line.replace(/^>\s?/, ""))
            .join("\n");

          const processedQuote = quoteLines
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.+?)\*/g, "<em>$1</em>")
            .replace(
              /`(.+?)`/g,
              '<code class="bg-slate-700 px-1 py-0.5 rounded text-xs">$1</code>'
            )
            .replace(
              /\[([^\]]+)\]\(([^)]+)\)/g,
              '<a href="$2" class="text-brand-primary hover:underline" target="_blank" rel="noopener noreferrer">$1</a>'
            )
            .replace(/\n/g, "<br>");

          return (
            <blockquote
              key={i}
              className="border-brand-primary/50 text-brand-text-muted my-3 border-l-4 pl-4">
              <p dangerouslySetInnerHTML={{ __html: processedQuote }} />
            </blockquote>
          );
        }

        // Handle tables
        if (block.includes("|") && block.split("\n").length > 2) {
          const lines = block.split("\n").filter(line => line.trim());

          // Check if it looks like a table (has header separator)
          // eslint-disable-next-line no-useless-escape
          if (lines.length >= 3 && lines?.[1]?.match(/^[\s\|:\-]+$/)) {
            const headers = lines?.[0]
              ?.split("|")
              .map(h => h.trim())
              .filter(h => h);
            const rows = lines.slice(2).map(row =>
              row
                .split("|")
                .map(cell => cell.trim())
                .filter(cell => cell !== undefined)
            );

            return (
              <div key={i} className="my-3 overflow-x-auto">
                <table className="divide-brand-border min-w-full divide-y">
                  <thead>
                    <tr>
                      {headers?.map((header, j) => (
                        <th
                          key={j}
                          className="text-brand-text-muted px-3 py-2 text-left text-xs font-medium tracking-wider uppercase">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-brand-border divide-y">
                    {rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((cell, k) => (
                          <td
                            key={k}
                            className="text-brand-text px-3 py-2 text-sm whitespace-nowrap">
                            <span
                              dangerouslySetInnerHTML={{
                                __html: cell
                                  .replace(
                                    /\*\*(.+?)\*\*/g,
                                    "<strong>$1</strong>"
                                  )
                                  .replace(/\*(.+?)\*/g, "<em>$1</em>")
                                  .replace(
                                    /`(.+?)`/g,
                                    '<code class="bg-slate-700 px-1 py-0.5 rounded text-xs">$1</code>'
                                  )
                              }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
        }

        // Handle headings
        const headingMatch = block.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch?.[1]?.length ?? 0;
          const text = headingMatch[2];
          const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
          const sizeClasses = [
            "text-2xl font-bold", // h1
            "text-xl font-bold", // h2
            "text-lg font-semibold", // h3
            "text-base font-semibold", // h4
            "text-sm font-medium", // h5
            "text-xs font-medium" // h6
          ];

          return (
            <HeadingTag
              key={i}
              className={`${sizeClasses?.[level - 1]} text-brand-text my-2`}>
              {text}
            </HeadingTag>
          );
        }

        // Handle lists (both unordered and ordered)
        // eslint-disable-next-line no-useless-escape
        if (block.match(/^[\*\-\+]\s/) || block.match(/^\d+\.\s/)) {
          const lines = block.split("\n");
          const isOrderedStr = lines?.[0] ?? "";
          const isOrdered = /^\d+\./.test(isOrderedStr);

          const ListTag = isOrdered ? "ol" : "ul";
          const listClass = isOrdered ? "list-decimal" : "list-disc";

          const processListItem = (line: string) => {
            // Check for sub-items (2+ spaces or tab)
            const indentMatch = line.match(/^(\s+)/);
            const currentIndent = indentMatch
              ? Math.floor((indentMatch?.[1]?.length ?? 0) / 2)
              : 0;

            const cleanedItem = line
              .trim()
              // eslint-disable-next-line no-useless-escape
              .replace(/^[\*\-\+]\s+/, "")
              .replace(/^\d+\.\s+/, "");

            // Handle task list items (- [ ] or - [x])
            const taskMatch = cleanedItem.match(/^\[([ x])\]\s+(.+)$/);
            if (taskMatch) {
              const isChecked = taskMatch[1] === "x";
              const taskContent = (taskMatch[2] ?? "")
                .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                .replace(/\*(.+?)\*/g, "<em>$1</em>")
                .replace(
                  /`(.+?)`/g,
                  '<code class="bg-slate-700 px-1 py-0.5 rounded text-xs">$1</code>'
                );

              return {
                content: `<span class="flex items-center gap-2">
                  <input type="checkbox" ${isChecked ? "checked" : ""} disabled class="rounded border-brand-border" />
                  <span>${taskContent}</span>
                </span>`,
                indent: currentIndent,
                isTask: true
              };
            }

            const processedItem = cleanedItem
              .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
              .replace(/\*(.+?)\*/g, "<em>$1</em>")
              .replace(
                /`(.+?)`/g,
                '<code class="bg-slate-700 px-1 py-0.5 rounded text-xs">$1</code>'
              );

            return {
              content: processedItem,
              indent: currentIndent,
              isTask: false
            };
          };

          const items = lines
            .filter(line => line.trim())
            .map(line => processListItem(line));

          return (
            <ListTag
              key={i}
              className={`${listClass} text-brand-text my-2 list-inside space-y-1`}>
              {items.map((item, j) => (
                <li
                  key={j}
                  className={item.indent > 0 ? `ml-${item.indent * 4}` : ""}
                  dangerouslySetInnerHTML={{ __html: item.content }}
                />
              ))}
            </ListTag>
          );
        }

        // Handle paragraphs with inline formatting
        const processedText = block
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(
            /`(.+?)`/g,
            '<code class="bg-slate-700 px-1 py-0.5 rounded text-sm">$1</code>'
          )
          .replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            '<a href="$2" class="text-brand-primary hover:underline" target="_blank" rel="noopener noreferrer">$1</a>'
          )
          // eslint-disable-next-line no-regex-spaces
          .replace(/  \n/g, "<br>") // Two spaces at end of line = line break
          .replace(/\n/g, " "); // Regular line breaks become spaces

        return (
          <p
            key={i}
            className="text-brand-text mb-2 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: processedText }}
          />
        );
      })}
    </>
  );
}

export const ChatMessage = memo(function ChatMessage({
  message,
  onUpdateMessage,
  className,
  user,
  isStreaming = false
}: ChatMessageProps) {
  const isUser = message.senderType === "USER";
  const [renderedContent, setRenderedContent] = useState<ReactNode>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const processingRef = useRef(false);

  // Get provider and model display name
  const toProvider = message.provider.toLowerCase() as Provider;
  const displayName = getModelDisplayName(toProvider, message.model);

  useEffect(() => {
    // User messages are plain text - no processing needed
    if (isUser) {
      setRenderedContent(message.content);
      return;
    }

    // For streaming messages, use lightweight processor
    if (isStreaming) {
      setRenderedContent(processStreamingMarkdown(message.content));
      return;
    }

    // For completed messages, check cache first
    const cacheKey = `${message.id}-${message.content.length}`;
    const cached = markdownCache.get(cacheKey);

    if (cached) {
      setRenderedContent(cached);
      return;
    }

    // Prevent duplicate processing
    if (processingRef.current) return;
    processingRef.current = true;
    

    // Process with full markdown processor
    processMarkdownToReact(message.content)
      .then(processed => {
        // Cache the result
        markdownCache.set(cacheKey, processed);
        setRenderedContent(processed);

        // Limit cache size
        if (markdownCache.size > 50) {
          const firstKey = markdownCache.keys().next().value;
          if (firstKey) markdownCache.delete(firstKey);
        }
      })
      .catch(error => {
        console.error("Markdown processing error:", error);
        setRenderedContent(
          <div className="text-red-500">
            Error rendering content. Raw text shown below:
            <pre className="mt-1 text-xs whitespace-pre-wrap">
              {message.content}
            </pre>
          </div>
        );
      })
      .finally(() => {
        processingRef.current = false;
      });
  }, [message.content, message.id, isStreaming, isUser]);

  // Auto-resize textarea when editing
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isEditing]);

  const handleEdit = () => {
    setEditText(message.content);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText(message.content);
  };

  const handleSaveEdit = () => {
    if (onUpdateMessage && editText.trim() !== message.content) {
      onUpdateMessage(message.id, editText.trim());
    }
    setIsEditing(false);
  };

  // Loading skeleton for AI messages
  if (!renderedContent && !isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "group relative flex items-start space-x-2 py-3",
          className
        )}>
        <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-gray-300 sm:h-8 sm:w-8" />
        <div className="max-w-[75%] flex-1 space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-gray-300"></div>
          <div className="h-4 w-1/2 animate-pulse rounded bg-gray-300"></div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "group relative flex items-start space-x-2 py-3 sm:space-x-3",
        isUser ? "justify-end" : "",
        className
      )}>
      {!isUser && (
        <>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center sm:h-8 sm:w-8">
            {(() => {
              const ProviderIcon = providerMetadata[toProvider]?.icon;
              return <ProviderIcon className="size-4" />;
            })()}
          </div>
          <div className="bg-brand-component text-brand-text prose dark:prose-invert prose-sm max-w-[85%] rounded-lg p-2 shadow-sm sm:max-w-[75%] sm:p-3">
            {renderedContent}
            <div className="text-brand-text-muted/80 mt-1.5 flex items-center justify-between text-xs">
              <span className="flex-grow">
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit"
                })}{" "}
                · {displayName}
              </span>
              {!isStreaming && (
                <AnimatedCopyButton
                  textToCopy={message.content}
                  className={cn(
                    "text-brand-text-muted hover:text-brand-text h-6 w-6 flex-shrink-0",
                    "opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                    "pointer-events-none group-hover:pointer-events-auto"
                  )}
                  initialIconSize={12}
                  aria-label="Copy AI response"
                />
              )}
            </div>
          </div>
        </>
      )}

      {isUser && (
        <>
          <div className="relative flex items-center">
            {!isEditing && (
              <div className="absolute top-1/2 right-full z-10 mr-2 flex -translate-y-1/2 items-center space-x-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleEdit}
                  className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component h-7 w-7"
                  aria-label="Edit message">
                  <PenLine className="size-3.5" />
                </Button>
                <AnimatedCopyButton
                  textToCopy={message.content}
                  className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component h-7 w-7"
                  initialIconSize={14}
                  aria-label="Copy message"
                />
              </div>
            )}
            <div
              className={cn(
                "max-w-full rounded-lg p-2 shadow-sm sm:p-3",
                isEditing
                  ? "bg-brand-background border-brand-primary border"
                  : "bg-brand-primary text-brand-primaryForeground"
              )}>
              {isEditing ? (
                <div className="min-w-[200px] space-y-2 sm:min-w-[250px]">
                  <Textarea
                    ref={textareaRef}
                    value={editText}
                    onChange={e => {
                      setEditText(e.target.value);
                      if (textareaRef.current) {
                        textareaRef.current.style.height = "auto";
                        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
                      }
                    }}
                    className="bg-brand-background text-brand-text border-brand-border focus:ring-brand-ring min-h-[60px] w-full text-sm"
                    rows={3}
                  />
                  <div className="flex justify-end space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelEdit}
                      className="text-brand-text-muted">
                      <X className="mr-1 h-4 w-4" /> Cancel
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSaveEdit}
                      className="bg-brand-primary hover:bg-brand-primary/90 text-brand-primaryForeground">
                      <Check className="mr-1 h-4 w-4" /> Save & Submit
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="prose dark:prose-invert max-w-[85%]  text-brand-text prose-sm">
                    {renderedContent}
                  </div>
                  <div className="text-brand-primary-foreground/80 mt-1.5 text-xs">
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour12: false,
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
          <Avatar className="h-7 w-7 shrink-0 sm:h-8 sm:w-8">
            {user?.image ? (
              <AvatarImage src={user?.image} alt="User Avatar" />
            ) : (
              <AvatarFallback>
                <UserIcon className="size-4" />
              </AvatarFallback>
            )}
          </Avatar>
        </>
      )}
    </motion.div>
  );
});

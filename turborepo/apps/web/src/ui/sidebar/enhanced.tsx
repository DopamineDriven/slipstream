"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  deleteConversationAction,
  updateConversationTitleAction
} from "@/app/actions/sidebar-actions";
import { useAiChat } from "@/hooks/use-ai-chat";
import { cn } from "@/lib/utils";
import { SidebarProps } from "@/types/ui";
import { NativeTruncatedText } from "@/ui/atoms/native-truncated-text";
import { Logo } from "@/ui/logo";
import { SidebarDropdownMenu } from "@/ui/sidebar/drop-menu";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "motion/react";
import { User } from "next-auth";
import {
  Button,
  Check,
  CirclePlus,
  SquarePen as Edit3,
  EmptyChatHistory,
  Input,
  Search,
  Trash as Trash2,
  X
} from "@t3-chat-clone/ui";

interface EnhancedSidebarProps {
  className?: string;
  sidebarData: SidebarProps[];
  user: User;
}

export function EnhancedSidebar({
  className = "",
  sidebarData,
  user
}: EnhancedSidebarProps) {
  const [conversations, setConversations] =
    useState<SidebarProps[]>(sidebarData);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const pathname = usePathname();
  const router = useRouter();

  // Ref for virtual scrolling
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Listen for new conversations from the active chat
  const { conversationId: activeConversationId, title: activeTitle } =
    useAiChat(user.id);

  useEffect(() => {
    if (!activeConversationId || activeConversationId === "new-chat") return;
    if (!activeTitle) return;

    // Check if this conversation already exists
    const exists = conversations.some(conv => conv.id === activeConversationId);

    if (!exists) {
      // Add new conversation to the top of the list
      setConversations(prev => [
        {
          id: activeConversationId,
          updatedAt: new Date(),
          title: activeTitle
        },
        ...prev
      ]);
    }
  }, [activeConversationId, activeTitle, conversations]);

  // Handle title editing
  const handleEditStart = (conv: SidebarProps) => {
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const handleEditSave = async () => {
    if (!editingId || !editingTitle.trim()) return;

    try {
      await updateConversationTitleAction(editingId, editingTitle.trim());

      // Update local state
      setConversations(prev =>
        prev.map(conv =>
          conv.id === editingId ? { ...conv, title: editingTitle.trim() } : conv
        )
      );

      setEditingId(null);
      setEditingTitle("");
    } catch (error) {
      console.error("Failed to update title:", error);
    }
  };

  // Handle conversation deletion
  const handleDelete = async (convId: string) => {
    setDeletingId(convId);

    try {
      await deleteConversationAction(convId);

      // Remove from local state
      setConversations(prev => prev.filter(conv => conv.id !== convId));

      // If we're currently viewing this conversation, redirect to home
      if (pathname === `/chat/${convId}`) {
        router.push("/");
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    } finally {
      setDeletingId(null);
    }
  };

  // Filter conversations based on search
  const filteredConversations = useMemo(() => {
    if (!debouncedSearchQuery) return conversations;

    const lowerQuery = debouncedSearchQuery.toLowerCase();
    return conversations.filter(conv =>
      conv.title.toLowerCase().includes(lowerQuery)
    );
  }, [conversations, debouncedSearchQuery]);

  // Helper to determine if a conversation is active
  const isActiveConversation = (convId: string) => {
    return pathname === `/chat/${convId}`;
  };

  // Setup virtualizer
  const virtualizer = useVirtualizer({
    count: filteredConversations.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 68, // Estimated height of each conversation item
    overscan: 5
  });

  return (
    <motion.div
      initial={{ x: -300 }}
      animate={{ x: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className={cn(
        `bg-brand-sidebar text-brand-text border-brand-border flex h-full flex-col space-y-4 border-r p-4`,
        className
      )}>
      <Link href="/" className="appearance-none">
        <div className="flex items-center justify-between px-1 py-0.5">
          <div className="flex items-center">
            <Logo className="text-foreground size-12" />
          </div>
        </div>
      </Link>

      <Link href="/" className="appearance-none">
        <Button
          variant="outline"
          className="bg-brand-component hover:bg-brand-primary/20 border-brand-border text-brand-text w-full justify-start">
          <CirclePlus className="mr-2 h-5 w-5" /> New Chat
        </Button>
      </Link>

      <div className="relative">
        <Search className="text-brand-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          type="search"
          placeholder="Search your threads..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="bg-brand-component border-brand-border focus:ring-brand-border text-brand-text placeholder:text-brand-text-muted pr-3 pl-10 text-sm"
        />
      </div>

      <div className="flex-1 overflow-hidden">
        {filteredConversations.length > 0 && (
          <div className="mb-2 flex items-center justify-between px-2 py-1">
            <h3 className="text-brand-text-muted text-xs font-medium tracking-wider uppercase">
              Recent
            </h3>
            <span className="text-brand-text-muted text-xs">
              {filteredConversations.length} conversations
            </span>
          </div>
        )}

        <div
          ref={scrollContainerRef}
          className="h-full overflow-auto"
          style={{
            contain: "strict"
          }}>
          {filteredConversations.length > 0 ? (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative"
              }}>
              {virtualizer.getVirtualItems().map(virtualItem => {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const thread = filteredConversations[virtualItem.index]!;
                return (
                  <div
                    key={thread.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`
                    }}>
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="group relative pb-2">
                      {editingId === thread.id ? (
                        <div className="flex items-center gap-2 px-3 py-2">
                          <Input
                            value={editingTitle}
                            onChange={e => setEditingTitle(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") handleEditSave();
                              if (e.key === "Escape") handleEditCancel();
                            }}
                            className="h-8 flex-1 text-sm"
                            autoFocus
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={handleEditSave}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={handleEditCancel}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="group relative">
                          <Link href={`/chat/${thread.id}`} passHref>
                            <div
                              role="button"
                              className={cn(
                                `flex h-auto min-h-[44px] w-full items-center justify-start rounded-md px-3 py-2 pr-20 transition-colors`,
                                isActiveConversation(thread.id)
                                  ? "bg-brand-primary/20 text-brand-text"
                                  : "text-brand-text-muted hover:bg-brand-component hover:text-brand-text"
                              )}>
                              <div className="flex w-full min-w-0 flex-col items-start text-left">
                                <NativeTruncatedText
                                  text={thread?.title ?? "Untitled"}
                                  className="w-full text-left text-sm leading-tight font-medium"
                                  baseChars={20}
                                  maxExtraChars={4}
                                />
                                <span className="text-brand-text-muted mt-0.5 flex-shrink-0 text-xs">
                                  {new Date(
                                    thread.updatedAt
                                  ).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </Link>
                          <div className="absolute top-1/2 right-2 flex -translate-y-1/2 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="hover:bg-brand-primary/20 h-8 w-8"
                              onClick={() => handleEditStart(thread)}>
                              <Edit3 className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="hover:bg-destructive/20 hover:text-destructive h-8 w-8"
                              onClick={() => handleDelete(thread.id)}
                              disabled={deletingId === thread.id}>
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <EmptyChatHistory className="text-brand-text-muted mx-auto size-12" />
                <h3 className="text-accent-foreground mt-1 text-sm font-semibold">
                  {searchQuery ? "No matching chats" : "Empty Chat History"}
                </h3>
                <p className="text-brand-text-muted mt-1 text-sm">
                  {searchQuery
                    ? "Try a different search term"
                    : "Get started by creating a new chat."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      <SidebarDropdownMenu user={user} />
    </motion.div>
  );
}

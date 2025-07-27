"use client";

import type { SidebarProps } from "@/types/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { redirect, usePathname, useRouter } from "next/navigation";
import { useConversations } from "@/hooks/use-conversations";
import { cn } from "@/lib/utils";
import { NativeTruncatedText } from "@/ui/atoms/native-truncated-text";
import { useSidebar } from "@/ui/atoms/sidebar";
import { Logo } from "@/ui/logo";
import { SidebarDropdownMenu } from "@/ui/sidebar/drop-menu";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "motion/react";
import { useSession } from "next-auth/react";
import {
  Button,
  Check,
  CirclePlus,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SquarePen as Edit3,
  EmptyChatHistory,
  Input,
  EllipsisHorizontal as MoreHorizontal,
  Search,
  Trash as Trash2,
  X
} from "@t3-chat-clone/ui";
import { SidebarSkeleton } from "./skeleton";
import { useAIChatContext } from "@/context/ai-chat-context";

interface EnhancedSidebarProps {
  className?: string;
}

export function EnhancedSidebar({ className = "" }: EnhancedSidebarProps) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const { conversations, updateCache, deleteConversation, updateTitle } =
    useConversations(userId);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const pathname = usePathname();
  const router = useRouter();
  const { state: sidebarState, isMobile, setOpen } = useSidebar();
  const effectiveState = isMobile ? "expanded" : sidebarState;
  // Ref for virtual scrolling
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Listen for new conversations from the active chat
  const { activeConversationId, title: activeTitle } =
    useAIChatContext()

  useEffect(() => {
    if (!activeConversationId || activeConversationId === "new-chat") return;
    if (!activeTitle || !conversations) return;

    // Check if this conversation already exists
    const exists = conversations.some(conv => conv.id === activeConversationId);

    if (!exists) {
      // ✅ Use SWR mutate instead of setConversations
      const newConversation = {
        id: activeConversationId,
        updatedAt: new Date(),
        title: activeTitle
      };

      updateCache(current =>
        current ? [newConversation, ...current] : [newConversation]
      );
    }
  }, [activeConversationId, activeTitle, conversations, updateCache]);

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
      await updateTitle(editingId, editingTitle.trim());

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
      await deleteConversation(convId);

      // Remove from local state

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
    return conversations?.filter(conv =>
      conv.title.toLowerCase().includes(lowerQuery)
    );
  }, [conversations, debouncedSearchQuery]);

  // Helper to determine if a conversation is active
  const isActiveConversation = (convId: string) => {
    return pathname === `/chat/${convId}`;
  };

  // Setup virtualizer
  const virtualizer = useVirtualizer({
    count: filteredConversations?.length ?? 0,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 68, // Estimated height of each conversation item
    overscan: 5
  });
  const handleSearchClick = () => {
    if (effectiveState === "collapsed") {
      // Clear any existing timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      setOpen(true);
      // Focus the input after sidebar opens
      searchTimeoutRef.current = setTimeout(() => {
        searchInputRef.current?.focus();
        searchTimeoutRef.current = null;
      }, 200); // Small delay to allow sidebar animation
    }
  };

  useEffect(() => {
    const searchTimeoutRefInner = searchTimeoutRef.current;
    return () => {
      if (searchTimeoutRefInner) {
        clearTimeout(searchTimeoutRefInner);
      }
    };
  }, []);

  if (status === "loading") return <SidebarSkeleton />;
  if (status === "unauthenticated" || !session?.user?.id) {
    redirect("/api/auth/signin");
  }
  return (
    <div
      className={cn(
        "bg-background flex h-full flex-col transition-all duration-200",
        effectiveState === "collapsed" ? "w-14 items-center p-2" : "w-80 p-4",
        className
      )}>
      <Link href="/" className="mb-4 appearance-none">
        <div
          className={cn(
            "flex items-center py-0.5",
            effectiveState === "collapsed"
              ? "justify-center px-0"
              : "justify-between px-1"
          )}>
          <div className="flex items-center">
            <Logo
              className={cn(
                "text-foreground",
                effectiveState === "collapsed" ? "size-10" : "size-12"
              )}
            />
            <span
              className={cn(
                "ml-2 font-semibold",
                effectiveState === "collapsed" && "sr-only"
              )}>
              Chat
            </span>
          </div>
        </div>
      </Link>

      <Link href="/" className="w-full appearance-none">
        <Button
          variant="outline"
          className={cn(
            "transition-all",
            effectiveState === "collapsed"
              ? "size-10 justify-center p-0"
              : "w-full justify-start"
          )}>
          <CirclePlus
            className={cn(
              effectiveState === "collapsed" ? "m-0 size-4" : "mr-2 size-5"
            )}
          />
          <span className={cn(effectiveState === "collapsed" && "sr-only")}>
            New Chat
          </span>
        </Button>
      </Link>

      {effectiveState === "collapsed" ? (
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground mb-4 h-10 w-10"
          onClick={handleSearchClick}
          title="Search conversations">
          <Search className="h-4 w-4" />
          <span className="sr-only">Search conversations</span>
        </Button>
      ) : (
        <div className="relative mb-4">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            ref={searchInputRef}
            type="search"
            placeholder="Search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pr-3 pl-10 text-sm"
          />
        </div>
      )}

      <div
        className={cn(
          "flex-1 overflow-hidden",
          effectiveState === "collapsed" && "hidden"
        )}>
        {filteredConversations && filteredConversations.length > 0 && (
          <div className="mb-2 flex items-center justify-between px-2 py-1">
            <h3 className="text-accent-foreground text-xs font-medium tracking-wider uppercase">
              Recent
            </h3>
            <span className="text-accent-foreground text-xs">
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
          {filteredConversations && filteredConversations.length > 0 ? (
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
                    <motion.div className="group relative pb-2">
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
                          <div
                            className={cn(
                              "absolute top-1/2 right-2 flex -translate-y-1/2 transition-opacity",
                              isMobile
                                ? "opacity-100"
                                : "opacity-0 group-hover:opacity-100"
                            )}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="hover:bg-primary/10 h-8 w-8"
                                  onClick={e => e.stopPropagation()}>
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">More options</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleEditStart(thread);
                                  }}>
                                  <Edit3 className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleDelete(thread.id);
                                  }}
                                  className="text-destructive focus:text-destructive"
                                  disabled={deletingId === thread.id}>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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
                <EmptyChatHistory className="text-accent-foreground mx-auto size-12" />
                <h3 className="text-accent-foreground mt-1 text-sm font-semibold">
                  {searchQuery ? "No matching chats" : "Empty Chat History"}
                </h3>
                <p className="text-accent-foreground/80 mt-1 text-sm">
                  {searchQuery
                    ? "Try a different search term"
                    : "Get started by creating a new chat."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      <SidebarDropdownMenu user={session?.user} />
    </div>
  );
}

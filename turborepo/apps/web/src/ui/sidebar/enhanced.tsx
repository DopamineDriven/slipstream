"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  deleteConversationAction,
  getSideBarDataAction,
  updateConversationTitleAction
} from "@/app/actions/sidebar-actions";
import { useAiChat } from "@/hooks/use-ai-chat";
import { cn } from "@/lib/utils";
import { NativeTruncatedText } from "@/ui/atoms/native-truncated-text";
import { Logo } from "@/ui/logo";
import { SidebarDropdownMenu } from "@/ui/sidebar/drop-menu";
import { motion, useInView } from "motion/react";
import { useSession } from "next-auth/react";
import {
  Button,
  Check,
  CirclePlus,
  SquarePen as Edit3,
  EmptyChatHistory,
  Input,
  ScrollArea,
  Search,
  Trash as Trash2,
  X
} from "@t3-chat-clone/ui";

// Simplified conversation type - just what we need
interface SimplifiedConversation {
  id: string;
  title: string;
  updatedAt: Date;
}

interface EnhancedSidebarProps {
  className?: string;
}

export function EnhancedSidebar({ className = "" }: EnhancedSidebarProps) {
  const { data: session } = useSession();
  const [conversations, setConversations] = useState<SimplifiedConversation[]>(
    []
  );
  const [_isLoading, _setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const pathname = usePathname();
  const router = useRouter();

  // Track conversations we've seen to avoid duplicates
  const seenConversationsRef = useRef(new Set<string>());

  // Ref for infinite scroll trigger
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(loadMoreRef, {
    once: false,
    amount: "some"
  });

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const hydrateSidebar = useCallback(async () => {
    try {
      const data = await getSideBarDataAction(0, 20);
      setConversations(data.conversations);
      setTotalCount(data.totalCount);
      setHasMore(data.hasMore);
      // Update our seen set
      seenConversationsRef.current = new Set(data.conversations.map(c => c.id));
    } catch (error) {
      console.error("Failed to fetch sidebar data:", error);
    }
  }, []);

  // Load more conversations
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const currentLength = conversations.length;
      const data = await getSideBarDataAction(currentLength, 20);

      // Append new conversations
      setConversations(prev => [...prev, ...data.conversations]);
      setHasMore(data.hasMore);

      // Update seen set
      data.conversations.forEach(c => seenConversationsRef.current.add(c.id));
    } catch (error) {
      console.error("Failed to load more conversations:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [conversations.length, hasMore, isLoadingMore]);

  // Trigger load more when sentinel is in view
  useEffect(() => {
    console.log(isInView);
    if (isInView && hasMore && !isLoadingMore) {
      loadMore();
    }
  }, [isInView, hasMore, isLoadingMore, loadMore]);

  // Initial fetch
  useEffect(() => {
    hydrateSidebar();
  }, [hydrateSidebar]);

  const { conversationId: activeConversationId, title: activeTitle } =
    useAiChat(session?.user?.id);

  useEffect(() => {
    if (!activeConversationId || activeConversationId === "new-chat") return;
    if (!activeTitle) return;

    // Check if this is a new conversation we haven't seen
    if (!seenConversationsRef.current.has(activeConversationId)) {
      // Add to seen set
      seenConversationsRef.current.add(activeConversationId);

      // Add to conversations list
      setConversations(prev => [
        {
          id: activeConversationId,
          updatedAt: new Date(Date.now()),
          title: activeTitle
        },
        ...prev
      ]);

      // Increment total count
      setTotalCount(prev => prev + 1);
    }
  }, [activeConversationId, activeTitle]);
  // Handle title editing
  const handleEditStart = (conv: SimplifiedConversation) => {
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
      seenConversationsRef.current.delete(convId);

      // Decrement total count
      setTotalCount(prev => Math.max(0, prev - 1));

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

  // Filter conversations based on search - now using memoized filtering
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

  // if (isLoading) {
  //   return <SidebarSkeleton />;
  // }

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
          className="bg-brand-component border-brand-border focus:ring-brand-border text-brand-text placeholder:text-brand-text-muted pl-10"
        />
      </div>
      <ScrollArea className="flex-grow" ref={containerRef}>
        <div className="space-y-2">
          {filteredConversations.length > 0 ? (
            <>
              <div className="flex items-center justify-between px-2 py-1">
                <h3 className="text-brand-text-muted text-xs font-medium tracking-wider uppercase">
                  Recent
                </h3>
                {totalCount > 0 && (
                  <span className="text-brand-text-muted text-xs">
                    {conversations.length} of {totalCount}
                  </span>
                )}
              </div>
              {filteredConversations.map((thread, idx) => (
                <motion.div
                  key={thread.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="group relative">
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
                          <div
                            className="flex w-full min-w-0 flex-col items-start text-left"
                            ref={
                              idx === filteredConversations.length - 1
                                ? loadMoreRef
                                : undefined
                            }>
                            <NativeTruncatedText
                              text={thread?.title ?? "Untitled"}
                              className="w-full text-left text-sm leading-tight font-medium"
                              baseChars={20}
                              maxExtraChars={4}
                            />
                            <span className="text-brand-text-muted mt-0.5 flex-shrink-0 text-xs">
                              {new Date(thread.updatedAt).toLocaleDateString()}
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
              ))}
            </>
          ) : (
            <div className="py-8 text-center align-middle">
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
          )}

          {isLoadingMore && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center py-4">
              <div className="text-brand-text-muted flex items-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="h-4 w-4 rounded-full border-2 border-current border-t-transparent"
                />
                <span className="text-sm">Loading more...</span>
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>
      <SidebarDropdownMenu user={session?.user ?? undefined} />
    </motion.div>
  );
}

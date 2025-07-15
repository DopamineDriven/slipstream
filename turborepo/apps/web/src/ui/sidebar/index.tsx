"use client";

import type { Conversation } from "@prisma/client";
import type { User } from "next-auth";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SidebarDropdownMenu } from "@/ui/sidebar/drop-menu";
import { motion } from "motion/react";
import {
  Button,
  CirclePlus,
  DropdownMenuItem,
  Input,
  LogOut,
  ScrollArea,
  Search,
  Settings,
  SquarePen,
  Trash
} from "@t3-chat-clone/ui";
import { Logo } from "../logo";

/**
 * Conversation has the following shape
 *
 *```ts
 * type Conversation =  {
    id: string;
    userId: string;
    userKeyId: string | null;
    title: string | null;
    createdAt: Date;
    updatedAt: Date;
    branchId: string | null;
    parentId: string | null;
    isShared: boolean;
    shareToken: string | null;
}
    ```
 */

interface SidebarProps {
  chatThreads?: Conversation[];
  onNewChat?: () => void;
  onSelectChat?: (id: string) => void;
  onUpdateChatTitleAction?: (conversationId: string, newTitle: string) => void;
  onDeleteChatAction?: (threadId: string) => void;
  onOpenSettings?: () => void;
  className?: string;
  user?: User;
}

export function Sidebar({
  chatThreads,
  user: userProfile,
  // TODO implement route handling logic
  onNewChat = () => console.log("New Chat"),
  // TODO implement route handling logic
  onSelectChat = id => console.log("Select Chat:", id),
  // TODO IMPLEMENT DYNAMIC HANDLING OF TITLE RETURNED BY FIRST CHUNK OF WEBSOCKET RESPONSE (listen using websocket context provider and parse out title during ai_chat_chunk event if a placeholder title -- "new chat" is temprarily set)
  onUpdateChatTitleAction: _onUpdateChatTitleAction,
  onOpenSettings: _openSettings,
  className = ""
}: SidebarProps) {
  const _x = onSelectChat;

  return (
    <motion.div
      initial={{ x: -300 }}
      animate={{ x: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className={cn(
        `bg-brand-sidebar text-brand-text border-brand-border flex h-full flex-col space-y-4 border-r p-4`,
        className
      )}>
      <div className="flex items-center justify-between px-1 py-0.5">
        <div className="flex items-center">
          <Logo className="text-foreground size-12" />
        </div>
      </div>
      <Button
        variant="outline"
        className="bg-brand-component hover:bg-brand-primary/20 border-brand-border text-brand-text w-full justify-start"
        onClick={onNewChat}>
        <CirclePlus className="mr-2 h-5 w-5" /> New Chat
      </Button>

      <div className="relative">
        <Search className="text-brand-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          type="search"
          placeholder="Search your threads..."
          className="bg-brand-component border-brand-border focus:ring-brand-ring text-brand-text placeholder:text-brand-text-muted pl-10"
        />
      </div>

      <ScrollArea className="flex-grow">
        <div className="space-y-2">
          {chatThreads ? (
            chatThreads.map(thread => (
              <Link key={thread.id} href={`/chat/${thread.id}`} passHref scroll={false}>
                <div
                  role="button"
                  className="text-foreground hover:bg-background/30 hover:text-foreground/90 flex min-w-0 grow items-center">
                  <div className="truncate">
                    <span className="">{thread.title ?? "Untitled"}</span>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="text-center align-middle">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-brand-text-muted mx-auto size-12">
                <path d="M12 6V2H8" />
                <path d="m8 18-4 4V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2Z" />
                <path d="M2 12h2" />
                <path d="M9 11v2" />
                <path d="M15 11v2" />
                <path d="M20 12h2" />
              </svg>
              <h3 className="text-accent-foreground mt-1 text-sm font-semibold">
                Empty Chat History
              </h3>
              <p className="text-brand-text-muted mt-1 text-sm">
                Get started by creating a new chat.
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
      <SidebarDropdownMenu user={userProfile} />
    </motion.div>
  );
}

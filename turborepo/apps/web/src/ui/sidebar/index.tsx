"use client";

import type { User } from "next-auth";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  ChevronDown,
  CirclePlus,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  LogOut,
  MessageSquareText,
  Search,
  Settings
} from "@t3-chat-clone/ui";
import Link from "next/link";
import { motion } from "motion/react";
import type { ChatThread } from "@/types/ui";
import { mockChatThreads } from "@/lib/mock";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/ui/atoms/scroll-area";

interface SidebarProps {
  chatThreads?: ChatThread[];
  onNewChat?: () => void;
  onSelectChat?: (id: string) => void;
  onOpenSettings?: () => void; // Kept for potential future use, but we'll link directly
  className?: string;
  user?: User;
}

export function Sidebar({
  chatThreads = mockChatThreads,
  user: userProfile,
  onNewChat = () => console.log("New Chat"),
  onSelectChat = id => console.log("Select Chat:", id),
  onOpenSettings: _openSettings,
  className = ""
}: SidebarProps) {
  return (
    <motion.div
      initial={{ x: -300 }}
      animate={{ x: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className={cn(
        `bg-brand-sidebar text-brand-text border-brand-border flex h-full flex-col space-y-4 border-r p-4`,
        className
      )}>
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
          {chatThreads.map(thread => (
            <Button
              key={thread.id}
              variant="ghost"
              className="text-brand-text-muted hover:bg-brand-component hover:text-brand-text h-auto w-full justify-start py-2"
              onClick={() => onSelectChat(thread.id)}>
              <MessageSquareText className="mr-2 h-4 w-4 shrink-0" />
              <span className="flex-1 text-left break-words whitespace-normal">
                {thread.title}
              </span>
              <span className="text-brand-text-muted ml-auto shrink-0 self-start text-xs">
                {thread.lastMessageAt}
              </span>
            </Button>
          ))}
        </div>
      </ScrollArea>

      <div className="border-brand-border mt-auto border-t pt-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="hover:bg-brand-component w-full items-center justify-between p-2">
              <div className="flex items-center space-x-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={userProfile?.image ?? "/placeholder.svg"}
                    alt={userProfile?.name ?? "user image"}
                  />
                  <AvatarFallback>
                    {userProfile?.name?.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left">
                  <p className="text-brand-text text-sm font-medium">
                    {userProfile?.name}
                  </p>
                  <p className="text-brand-text-muted text-xs">{"Free"} Plan</p>
                </div>
              </div>
              <ChevronDown className="text-brand-text-muted h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="bg-brand-component border-brand-border text-brand-text w-56"
            side="top"
            align="start">
            <DropdownMenuLabel className="text-brand-text-muted">
              My Account
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-brand-border" />
            <Link href="/settings" passHref>
              <DropdownMenuItem className="hover:!bg-brand-primary/20 cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
            </Link>
            <DropdownMenuItem className="hover:!bg-brand-primary/20 cursor-pointer text-red-400 hover:!text-red-300">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}

"use client";

import type { ChatThread } from "@/types/ui";
import type { User } from "next-auth";
import Image from "next/image";
import Link from "next/link";
import { mockChatThreads } from "@/lib/mock";
import { shimmer } from "@/lib/shimmer";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import {
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
  ScrollArea,
  Search,
  Settings
} from "@t3-chat-clone/ui";

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
  const dropDownMap = [
    {
      name: "settings-sidebar",
      Component: () => (
        <Link href="/settings" passHref>
          <DropdownMenuItem className="hover:!bg-brand-primary/20 cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
        </Link>
      )
    },
    {
      name: "signout-sidebar",
      Component: () => (
        <Link href="/api/auth/signout" passHref>
          <DropdownMenuItem className="hover:!bg-brand-primary/20 cursor-pointer text-red-400 hover:!text-red-300">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign Out</span>
          </DropdownMenuItem>
        </Link>
      )
    }
  ];
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
              className="hover:bg-brand-component w-full items-center justify-between">
              <div className="group block shrink-0 p-2">
                <div className="flex items-center select-none">
                  <Image
                    className="inline-block size-10 rounded-full"
                    src={userProfile?.image ?? "/placeholder.svg"}
                    alt={userProfile?.name ?? "user image"}
                    width={36}
                    height={36}
                    placeholder="blur"
                    blurDataURL={shimmer([36, 36])}
                  />
                  <div className="ml-2.5 inline-block align-middle">
                    <p className="text-foreground text-sm leading-snug font-normal">
                      {userProfile?.name ?? "Username"}
                    </p>
                    <p className="text-secondary-foreground text-xs leading-snug">
                      {userProfile?.email ?? "user@email.com"}
                    </p>
                  </div>
                </div>
              </div>
              <ChevronDown className="text-secondary-foreground size-4 sm:size-5" />
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
            {dropDownMap.map(({ Component, name }) => (
              <Component key={name} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}

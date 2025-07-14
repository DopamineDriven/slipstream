"use client";

import type { Conversation } from "@prisma/client";
import type { User } from "next-auth";
import Image from "next/image";
import Link from "next/link";
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
  ScrollArea,
  Search,
  Settings
} from "@t3-chat-clone/ui";

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
  onOpenSettings?: () => void;
  className?: string;
  user?: User;
}

export function Sidebar({
  chatThreads,
  user: userProfile,
  onNewChat = () => console.log("New Chat"),
  onSelectChat = id => console.log("Select Chat:", id),
  onOpenSettings: _openSettings,
  className = ""
}: SidebarProps) {
  const _x = onSelectChat;
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
          {chatThreads ? (
            chatThreads.map(thread => (
              <Link key={thread.id} href={`/chat/${thread.id}`} passHref>
                <div
                  role="button"
                  className="text-foreground hover:bg-background/30 hover:text-foreground/90 flex min-w-0 grow items-center">
                  <div className="truncate">
                    <span className="">{thread.title ?? "No title set"}</span>
                  </div>
                  {/* <span className="text-brand-text-muted ml-auto shrink-0 self-start text-xs">
                  {new Date(thread.updatedAt).toISOString()}
                </span> */}
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
                  <div className="ml-2.5 inline-block text-left align-middle">
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

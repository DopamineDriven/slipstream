"use client";

import type { Conversation } from "@prisma/client";
import type { User } from "next-auth";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { NativeTruncatedText } from "@/ui/atoms/native-truncated-text";
import { Logo } from "@/ui/logo";
import { SidebarDropdownMenu } from "@/ui/sidebar/drop-menu";
import { motion } from "motion/react";
import { Button, CirclePlus, ScrollArea } from "@t3-chat-clone/ui";

interface SidebarProps {
  chatThreads?: Conversation[];
  onUpdateChatTitleAction?: (conversationId: string, newTitle: string) => void;
  onDeleteChatAction?: (threadId: string) => void;
  onOpenSettings?: () => void;
  className?: string;
  user?: User;
}

export function Sidebar({
  chatThreads,
  user: userProfile, // this can be simplified to useSession via next-auth/react
  onUpdateChatTitleAction: _onUpdateChatTitleAction,
  className = ""
}: SidebarProps) {
  return (
    <motion.div
      onLoadStart={e => e}
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
      <Link href="/">
        <Button
          variant="outline"
          className="bg-brand-component hover:bg-brand-primary/20 border-brand-border text-brand-text w-full justify-start">
          <CirclePlus className="mr-2 h-5 w-5" /> New Chat
        </Button>
      </Link>

      <ScrollArea className="flex-grow">
        <div className="space-y-2">
          {chatThreads && chatThreads.length > 0 ? (
            <>
              <div className="px-2 py-1">
                <h3 className="text-brand-text-muted text-xs font-medium tracking-wider uppercase">
                  Recent
                </h3>
              </div>
              {chatThreads.map(thread => (
                <div key={thread.id} className="group relative">
                  <Link href={`/chat/${thread.id}`} passHref>
                    <div
                      role="button"
                      className="text-brand-text-muted hover:bg-brand-component hover:text-brand-text flex h-auto min-h-[44px] w-full items-center justify-start rounded-md px-3 py-2 pr-10 transition-colors">
                      <div className="flex w-full min-w-0 flex-col items-start text-left">
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
                </div>
              ))}
            </>
          ) : (
            <div className="py-8 text-center align-middle">
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

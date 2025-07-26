"use client";

import type { User } from "next-auth";
import type { JSX } from "react";
import Image from "next/image";
import Link from "next/link";
import { shimmer } from "@/lib/shimmer";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/ui/atoms/sidebar";
import {
  Button,
  ChevronDown,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LogOut,
  Settings
} from "@t3-chat-clone/ui";

const dropDownMap = [
  {
    name: "settings-sidebar",
    Component: () => (
      <Link href="/settings" passHref>
        <DropdownMenuItem className="hover:!bg-brand-primary/20 cursor-pointer">
          <Settings className="mr-2 size-4" />
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
          <LogOut className="mr-2 size-4" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </Link>
    )
  }
] satisfies {
  name: string;
  Component: () => JSX.Element;
}[];

export function SidebarDropdownMenu({ user: userProfile }: { user?: User }) {
  const { state: sidebarState, isMobile } = useSidebar();
  // On mobile, always use expanded state
  const effectiveState = isMobile ? "expanded" : sidebarState;

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map(n => n.substring(0,1))
      .join("");
  };
  return (
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
                  alt={getInitials(userProfile?.name)}
                  width={36}
                  height={36}
                  placeholder="blur"
                  blurDataURL={shimmer([36, 36])}
                />
                <div
                  className={cn(
                    "ml-2.5 text-left align-middle",
                    effectiveState === "collapsed" ? "hidden" : "inline-block"
                  )}>
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
  );
}

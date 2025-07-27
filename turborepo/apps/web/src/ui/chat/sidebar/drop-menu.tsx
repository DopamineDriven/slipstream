"use client";

import type { User } from "next-auth";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/ui/atoms/sidebar";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LogOut,
  Settings
} from "@t3-chat-clone/ui";

export function SidebarDropdownMenu({ user: userProfile }: { user?: User }) {
  const { state: sidebarState, isMobile } = useSidebar();
  // On mobile, always use expanded state
  const effectiveState = isMobile ? "expanded" : sidebarState;

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map(n => n.substring(0, 1))
      .join("");
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start text-left",
            effectiveState === "collapsed" && "h-12 w-12 justify-center p-0"
          )}>
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={userProfile?.image ?? ""}
                alt={userProfile?.name ?? ""}
              />
              <AvatarFallback>{getInitials(userProfile?.name)}</AvatarFallback>
            </Avatar>
            <div
              className={cn(
                "flex flex-col",
                effectiveState === "collapsed" && "hidden"
              )}>
              <span className="text-sm font-medium">{userProfile?.name}</span>
              <span className="text-muted-foreground text-xs">
                {userProfile?.email}
              </span>
            </div>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm leading-none font-medium">
              {userProfile?.name}
            </p>
            <p className="text-muted-foreground text-xs leading-none">
              {userProfile?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <Link href="/settings" passHref>
          <DropdownMenuItem className="hover:!bg-brand-primary/20 cursor-pointer">
            <Settings className="mr-2 size-4" />
            <span>Settings</span>
          </DropdownMenuItem>
        </Link>
        <DropdownMenuSeparator />
        <Link href="/api/auth/signout" passHref>
          <DropdownMenuItem className="hover:!bg-brand-primary/20 cursor-pointer text-red-400 hover:!text-red-300">
            <LogOut className="mr-2 size-4" />
            <span>Sign Out</span>
          </DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

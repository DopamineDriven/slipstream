"use client";

import type { JSX } from "react";
import type { BaseSVGProps } from "@t3-chat-clone/ui";
import {
  ArrowLeft,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  LogOut,
  Settings
} from "@t3-chat-clone/ui";
import { useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { mockUserProfile } from "@/lib/mock"; // For avatar

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/ui/atoms/tooltip";
import { User } from "next-auth";

const ThemeToggle = dynamic(
  () => import("@/ui/theme").then(d => d.ThemeToggle),
  { ssr: false }
);
type UtilityIds = "back" | "theme" | "signout" | "sections";

type SectionIds =
  | "account"
  | "apiKeys"
  | "customization"
  | "history"
  | "models"
  | "attachments"
  | "contactUs";

interface SettingsSectionConfigForToolbar {
  id: SectionIds;
  action: () => void;
  type: "section";
  title: string;
  icon: ({ ...svg }: BaseSVGProps) => JSX.Element;
  component: JSX.Element | (({ user }: { user?: User | undefined; }) => JSX.Element);
}

interface MobileSettingsToolbarProps {
  sections: SettingsSectionConfigForToolbar[] | readonly SettingsSectionConfigForToolbar[];
  onNavigate: (sectionId: SectionIds) => void;
  activeSection: SectionIds; // To highlight active icon if needed
  className?: string;
}

interface BaseToolBarItemProps {
  id: UtilityIds;
  title: string;
  type: "utility";
  icon: ({ ...svg }: BaseSVGProps) => JSX.Element;
}

interface UtilityProps extends Omit<BaseToolBarItemProps, "id"> {
  id: Exclude<UtilityIds, "sections">;
}

export function MobileSettingsToolbar({
  sections,
  onNavigate,
  activeSection,
  className
}: MobileSettingsToolbarProps) {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    // Apply theme based on system preference during initial load
    if (!resolvedTheme) {
      if (prefersDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    } else {
      // Apply theme based on resolvedTheme once it's available
      if (resolvedTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [resolvedTheme]);

  const user = mockUserProfile;

  const themeProps = {
    id: "theme",
    title: "Toggle Theme",
    type: "utility",
    icon: Settings
  } as const;

  const backProps = {
    id: "back",
    title: "Back to Chat",
    type: "utility",
    icon: ArrowLeft
  } as const;

  const signoutProps = {
    id: "signout",
    title: "Sign Out",
    type: "utility",
    icon: LogOut
  } as const;

  const toolBarItemUtils = [
    themeProps,
    backProps,
    signoutProps
  ] satisfies UtilityProps[];

  const toolbarItems = [
    ...toolBarItemUtils,
    ...(sections.map(s => ({
      ...s,
      action: () => onNavigate(s.id)
    })) satisfies SettingsSectionConfigForToolbar[])
  ];

  return (
    <TooltipProvider delayDuration={0}>
      <motion.div
        initial={{ x: "-100%" }}
        animate={{ x: 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className={cn(
          "bg-brand-component/80 border-brand-border fixed top-1/2 left-2 z-40 flex -translate-y-1/2 flex-col items-center space-y-2 rounded-full border p-2 shadow-lg backdrop-blur-sm",
          className
        )}>
        {toolbarItems.map(item => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              {item.id === "back" ? (
                <Button
                  variant="ghost"
                  size="icon"
                  asChild
                  className="text-brand-text-muted hover:bg-brand-primary/20 hover:text-brand-text h-10 w-10 rounded-full">
                  <Link href={"/"} aria-label={item.title}>
                    <item.icon className="h-5 w-5" />
                  </Link>
                </Button>
              ) : item.id === "theme" ? (
                <ThemeToggle className="text-brand-text-muted hover:bg-brand-primary/20 hover:text-brand-text h-10 w-10 rounded-full" />
              ) : item.id === "signout" ? (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-10 rounded-full",
                    "text-red-500 hover:bg-red-500/10 hover:text-red-400"
                  )}
                  aria-label={item.title}>
                  <Link href="/api/auth/signout">
                    <item.icon className="size-5" />
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={item.action}
                  className={cn(
                    "size-10 rounded-full",
                    "hover:bg-brand-primary/20 hover:text-brand-text",
                    activeSection === item.id
                      ? "bg-brand-primary/20 text-brand-primary"
                      : "text-brand-text-muted"
                  )}
                  aria-label={item.title}>
                  <item.icon className="size-5" />
                </Button>
              )}
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="bg-brand-component text-brand-text border-brand-border">
              {item.title}
            </TooltipContent>
          </Tooltip>
        ))}
        <div className="mt-auto pt-2">
          {/* Ensure avatar is at the bottom */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-10 w-10 cursor-pointer">
                <AvatarImage
                  src={user.image || "/user.svg?width=40&height=40&query=AR"}
                  alt={user.name}
                />
                <AvatarFallback>
                  {`${user.name.split(` `)[0]?.slice(0, 1).toUpperCase()} ${user.name.split(` `)[1]?.slice(0, 1).toUpperCase()}`}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="bg-brand-component text-brand-text border-brand-border">
              {user.name}
            </TooltipContent>
          </Tooltip>
        </div>
      </motion.div>
    </TooltipProvider>
  );
}

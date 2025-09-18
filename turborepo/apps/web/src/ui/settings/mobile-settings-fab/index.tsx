"use client";

import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { User } from "next-auth";
import { useTheme } from "next-themes";
import type { BaseSVGProps } from "@slipstream/ui";
import {
  ArrowLeft,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  LogOut,
  Menu,
  Settings,
  TooltipProvider,
  X
} from "@slipstream/ui";

const ThemeToggle = dynamic(
  () => import("@/ui/theme-toggle").then(d => d.ThemeToggle),
  { ssr: false }
);

type UtilityIds = "back" | "theme" | "signout" | "sections";

type SectionIds = "account" | "apiKeys" | "customization" | "contactUs";
interface SettingsSectionConfigForFAB {
  id: SectionIds;
  type: "section";
  title: string;
  icon: ({ ...svg }: BaseSVGProps) => JSX.Element;
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

type UtilityConditional<T extends Exclude<UtilityIds, "sections">> =
  T extends "theme" ? UtilityProps : UtilityProps & { href: string };

interface MobileSettingsFABProps {
  sections:
    | SettingsSectionConfigForFAB[]
    | readonly SettingsSectionConfigForFAB[];
  onNavigate: (sectionId: string) => void;
  activeSection: string;
  user?: User;
  className?: string;
}

export function MobileSettingsFAB({
  sections,
  onNavigate,
  user,
  activeSection,
  className
}: MobileSettingsFABProps) {
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

  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>(null);

  // Handle scroll to auto-hide when scrolling
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // If expanded and user scrolls, collapse it
      if (isExpanded) {
        setIsExpanded(false);
      }

      // Hide FAB when scrolling down, show when scrolling up
      if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }

      lastScrollY.current = currentScrollY;

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Show FAB again after scroll stops
      scrollTimeoutRef.current = setTimeout(() => {
        setIsVisible(true);
      }, 150);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [isExpanded]);
  const themeProps = {
    id: "theme",
    title: "Toggle Theme",
    type: "utility",
    icon: Settings
  } as const satisfies UtilityConditional<"theme">;

  const backProps = {
    id: "back",
    title: "Back to Chat",
    type: "utility",
    href: "/",
    icon: ArrowLeft
  } as const satisfies UtilityConditional<"back">;

  const signoutProps = {
    id: "signout",
    title: "Sign Out",
    type: "utility",
    href: "/api/auth/signout",
    icon: LogOut
  } as const satisfies UtilityConditional<"signout">;

  const toolBarItemUtils = [themeProps, backProps, signoutProps];

  const handleNavigate = (sectionId: string) => {
    onNavigate(sectionId);
    setIsExpanded(false); // Collapse after navigation
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className={cn("fixed right-4 bottom-4 z-50", className)}>
        <AnimatePresence>
          {isVisible && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative">
              {/* Expanded Menu */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0, opacity: 0, y: 20 }}
                    transition={{ duration: 0.2 }}
                    className="bg-brand-component/95 border-brand-border absolute right-0 bottom-16 min-w-[200px] rounded-2xl border p-3 shadow-xl backdrop-blur-md">
                    {/* User Profile */}
                    <div className="border-brand-border mb-3 flex items-center gap-3 border-b p-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={
                            user?.image ??
                            "/placeholder.svg?width=32&height=32&query=AR"
                          }
                          alt={user?.name ?? user?.id}
                        />
                        <AvatarFallback className="text-xs">
                          {`${user?.name?.split(` `)[0]?.slice(0, 1).toUpperCase()} ${user?.name?.split(` `)[1]?.slice(0, 1).toUpperCase()}`}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-brand-text-emphasis truncate text-sm font-medium">
                          {user?.name ?? "User Name"}
                        </p>
                        <p className="text-brand-text-muted text-xs">
                          Free Plan
                        </p>
                      </div>
                    </div>

                    {/* Settings Sections */}
                    <div className="mb-3 space-y-1">
                      {sections.map(section => (
                        <Button
                          key={section.id}
                          variant="ghost"
                          size="sm"
                          onClick={() => handleNavigate(section.id)}
                          className={cn(
                            "h-8 w-full justify-start px-2 text-xs",
                            activeSection === section.id
                              ? "bg-brand-primary/20 text-brand-primary"
                              : "text-brand-text-muted hover:bg-brand-primary/10 hover:text-brand-text"
                          )}>
                          <section.icon className="mr-2 h-3 w-3" />
                          {section.title}
                        </Button>
                      ))}
                    </div>

                    {/* Utility Actions */}
                    <div className="border-brand-border space-y-1 border-t pt-2">
                      {toolBarItemUtils.map(item => (
                        <div key={item.id}>
                          {item.id !== "theme" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                              className={cn(
                                "h-8 w-full justify-start px-2 text-xs",
                                item.id === "signout"
                                  ? "text-red-500 hover:bg-red-500/10 hover:text-red-400"
                                  : "text-brand-text-muted hover:bg-brand-primary/10 hover:text-brand-text"
                              )}>
                              <Link href={item.href}>
                                <item.icon className="mr-2 h-3 w-3" />
                                {item.title}
                              </Link>
                            </Button>
                          ) : (
                            <div className="flex items-center justify-between px-2 py-1">
                              <div className="flex items-center">
                                <item.icon className="text-brand-text-muted mr-2 h-3 w-3" />
                                <span className="text-brand-text-muted text-xs">
                                  {item.title}
                                </span>
                              </div>
                              <ThemeToggle className="h-6 w-6" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* FAB Button */}
              <motion.button
                onClick={() => setIsExpanded(!isExpanded)}
                className={cn(
                  "bg-brand-primary text-brand-primary-foreground size-12 rounded-full shadow-lg",
                  "flex items-center justify-center",
                  "hover:bg-brand-primary/90 active:scale-95",
                  "transition-colors duration-200"
                )}
                whileTap={{ scale: 0.95 }}>
                <motion.div
                  animate={{ rotate: isExpanded ? 45 : 0 }}
                  transition={{ duration: 0.2 }}>
                  {isExpanded ? (
                    <X className="h-5 w-5" />
                  ) : (
                    <Menu className="h-5 w-5" />
                  )}
                </motion.div>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}

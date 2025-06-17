"use client";

import { Button, Icon } from "@t3-chat-clone/ui";
import Link from "next/link";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { SettingsLayout } from "@/ui/settings/settings-layout";
import { UserProfileCard } from "@/ui/settings/user-profile-card";
import type { User } from "next-auth";

export function SettingsPage({user}: {user?: User}) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="bg-brand-background text-brand-text flex h-screen flex-col">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        // Header: fixed padding, shrinks if necessary, bottom margin
        className="mb-8 flex shrink-0 items-center justify-between px-2 pt-2 sm:px-4 sm:pt-4 md:px-6 md:pt-6 lg:p-8 lg:pt-8">
        <Button
          variant="ghost"
          asChild
          className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
          <Link href="/">
            <Icon.ArrowLeft className="mr-1 size-4 sm:mr-2" />{" "}
            <span className="hidden sm:inline">Back to </span>Chat
          </Link>
        </Button>
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
            {theme === "dark" ? <Icon.Sun /> : <Icon.Moon />}
            <span className="sr-only">Toggle theme</span>
          </Button>
          <Button
            variant="outline"
            className="border-red-400/50 text-red-400 hover:border-red-300/50 hover:bg-red-400/10 hover:text-red-300">
            <Icon.LogOut className="mr-1 h-4 w-4 sm:mr-2" />{" "}
            <span className="hidden sm:inline">Sign </span>Out
          </Button>
        </div>
      </motion.header>

      {/* Main content area: takes remaining space, uses grid for columns, hides its own overflow (children will scroll) */}
      <div className="flex-1 gap-4 overflow-hidden px-2 pb-2 sm:gap-6 sm:px-4 sm:pb-4 md:gap-8 md:px-6 md:pb-6 lg:grid lg:grid-cols-12 lg:px-8 lg:pb-8">
        <div className="lg:col-span-4 lg:overflow-y-auto xl:col-span-3">
          {/* Left column: scrollable if content overflows */}
          <UserProfileCard user={{messageUsage: {current: 4, limit: 20}, plan: "Free", ...user}} />
        </div>
        <div className="lg:col-span-8 lg:overflow-y-auto xl:col-span-9">
          {/* Right column: scrollable if content overflows */}
          <SettingsLayout />
        </div>
      </div>
    </div>
  );
}

"use client";

import type { User } from "next-auth";
import { ArrowLeft, LogOut, Button } from "@t3-chat-clone/ui";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "motion/react";
import { SettingsLayout } from "@/ui/settings/settings-layout";
import { UserProfileCard } from "@/ui/settings/user-profile-card";

const ThemeToggle = dynamic(
  () => import("@/ui/theme-toggle").then(d => d.ThemeToggle),
  { ssr: false }
);
export function SettingsPage({ user }: { user?: User }) {
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
            <ArrowLeft className="mr-1 size-4 sm:mr-2" />{" "}
            <span className="hidden sm:inline">Back to </span>Chat
          </Link>
        </Button>
        <div className="flex items-center space-x-2">
          <ThemeToggle className="text-brand-text-muted cursor-pointer hover:text-brand-text hover:bg-brand-component" />

            <Link href="/api/auth/signout" className="p-2.5 my-auto align-middle text-brand-text-muted hover:text-brand-text hover:bg-brand-component inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0">
              <LogOut className="mr-1 size-5 sm:mr-2 hover:bg-accent hover:text-accent-foreground" />{" "}
              <span className="hidden sm:inline">Sign </span>Out
            </Link>
        </div>
      </motion.header>

      {/* Main content area: takes remaining space, uses grid for columns, hides its own overflow (children will scroll) */}
      <div className="flex-1 gap-4 overflow-hidden px-2 pb-2 sm:gap-6 sm:px-4 sm:pb-4 md:gap-8 md:px-6 md:pb-6 lg:grid lg:grid-cols-12 lg:px-8 lg:pb-8">
        <div className="lg:col-span-4 lg:overflow-y-auto xl:col-span-3">
          {/* Left column: scrollable if content overflows */}
          <UserProfileCard
            user={{
              messageUsage: { current: 4, limit: 20 },
              plan: "Free",
              ...user
            }}
          />
        </div>
        <div className="lg:col-span-8 lg:overflow-y-auto xl:col-span-9">
          {/* Right column: scrollable if content overflows */}
          <SettingsLayout />
        </div>
      </div>
    </div>
  );
}

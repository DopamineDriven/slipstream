"use client";

import type { KeyboardShortcut } from "@/types/ui";
import type { User } from "next-auth";
import { cn } from "@/lib/utils";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Progress
} from "@slipstream/ui";
import { motion } from "motion/react";

export interface UserProfileCardProps {
  user?: User;
  shortcuts?: KeyboardShortcut[];
  className?: string;
}

const mockKeyboardShortcuts = [
  { action: "Search", keys: ["Ctrl", "K"] },
  { action: "New Chat", keys: ["Shift", "O"] },
  { action: "Toggle Sidebar", keys: ["Ctrl", "B"] }
] satisfies KeyboardShortcut[];

export function UserProfileCard({
  user,
  shortcuts = mockKeyboardShortcuts,
  className = ""
}: UserProfileCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className={cn(
        `bg-brand-sidebar border-brand-border space-y-6 rounded-lg border p-4 sm:p-6`,
        className
      )}>
      <div className="flex flex-col items-center text-center">
        <Avatar className="border-brand-primary mb-3 h-20 w-20 border-2 sm:mb-4 sm:h-24 sm:w-24">
          <AvatarImage
            src={user?.image ?? "/placeholder.svg"}
            alt={user?.name ?? "user avatar"}
          />
          <AvatarFallback className="text-2xl sm:text-3xl">
            {`${user?.name?.split(` `)[0]?.slice(0, 1).toUpperCase()} ${user?.name?.split(` `)[1]?.slice(0, 1).toUpperCase()}`}
          </AvatarFallback>
        </Avatar>
        <h2 className="text-brand-text-emphasis text-lg font-semibold sm:text-xl">
          {user?.name}
        </h2>
        <p className="text-brand-text-muted text-xs sm:text-sm">
          {user?.email}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="bg-brand-component border-brand-border hover:bg-brand-primary/20 text-brand-text mt-2">
          {"Free"} Plan
        </Button>
      </div>

      <div>
        <label
          htmlFor="message-usage"
          className="text-brand-text-muted text-sm font-medium">
          Message Usage
        </label>
        <p className="text-brand-text-muted mb-1 text-xs">
          Resets today at 7:00 PM
        </p>
        <Progress
          id="message-usage"
          value={(4 / 20) * 100}
          className="[&>div]:bg-brand-primary h-2 w-full"
        />
        <p className="text-brand-text-muted mt-1 text-xs">
          {20 - 4} messages remaining
        </p>
      </div>

      <div>
        <h3 className="text-md text-brand-text-emphasis mb-2 font-semibold">
          Keyboard Shortcuts
        </h3>
        <ul className="space-y-1">
          {shortcuts.map((shortcut, index) => (
            <li
              key={index}
              className="text-brand-text-muted flex items-center justify-between text-sm">
              <span>{shortcut.action}</span>
              <div className="flex space-x-1">
                {shortcut.keys.map((key, kIndex) => (
                  <kbd
                    key={kIndex}
                    className="bg-brand-component border-brand-border rounded border px-1.5 py-0.5 text-[10px] sm:text-xs">
                    {key}
                  </kbd>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

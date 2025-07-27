"use client";

import type { Variants } from "motion/react";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";

const pulseVariants = {
  loading: {
    opacity: [0.5, 1, 0.5],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
} satisfies Variants;

const staggerContainer = {
  loading: {
    transition: {
      staggerChildren: 0.1
    }
  }
} satisfies Variants;

const chatItemVariants = {
  loading: {
    opacity: [0.3, 0.7, 0.3],
    transition: {
      duration: 1.2,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
} satisfies Variants;

export function SidebarSkeleton({
  className = "",
  ...rest
}: Omit<ComponentPropsWithRef<typeof motion.div>, "variants" | "animate">) {
  return (
    <motion.div
      {...rest}
      variants={staggerContainer}
      animate="loading"
      className={cn(
        "bg-brand-sidebar text-brand-text border-brand-border flex h-full flex-col space-y-2 border-r p-2 sm:space-y-4 sm:p-4",
        className
      )}>
      {Array.from({ length: 3 }).map((_, i) =>
        i === 0 ? (
          <div
            key={`pulsevariant-skeleton-${i}`}
            className="flex items-center justify-between px-1 py-0.5">
            <motion.div
              variants={pulseVariants}
              className="bg-brand-component h-12 w-12 rounded-md"
            />
          </div>
        ) : (
          <motion.div
            key={`pulsevariant-skeleton-${i}`}
            variants={pulseVariants}
            className="bg-brand-component border-brand-border h-10 w-full rounded-md border"
          />
        )
      )}
      {/* Chat Threads Section */}
      <div className="flex-grow space-y-2">
        {/* "Recent" Header Skeleton */}
        <div className="px-2 py-1">
          <motion.div
            variants={pulseVariants}
            className="bg-brand-component h-3 w-16 rounded"
          />
        </div>

        {/* Chat Thread Items Skeleton */}
        <motion.div variants={staggerContainer} className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div
              key={`chat-item-skeleton-${i}`}
              variants={chatItemVariants}
              className="bg-brand-component h-16 w-full rounded-md p-3">
              <div className="space-y-2">
                {/* Chat title skeleton */}
                <div className="bg-brand-sidebar h-3 w-full max-w-[80%] rounded" />
                {/* Date skeleton */}
                <div className="bg-brand-sidebar h-2 w-20 rounded" />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* User Profile Dropdown Skeleton */}
      <div className="border-brand-border border-t pt-4">
        <motion.div
          variants={pulseVariants}
          className="bg-brand-component flex w-full items-center justify-between rounded-md p-3">
          <div className="flex items-center space-x-3">
            {/* Avatar skeleton */}
            <div className="bg-brand-sidebar h-10 w-10 rounded-full" />
            {/* User info skeleton */}
            <div className="space-y-1">
              <div className="bg-brand-sidebar h-3 w-20 rounded" />
              <div className="bg-brand-sidebar h-2 w-24 rounded" />
            </div>
          </div>
          {/* Chevron skeleton */}
          <div className="bg-brand-sidebar h-4 w-4 rounded" />
        </motion.div>
      </div>
    </motion.div>
  );
}

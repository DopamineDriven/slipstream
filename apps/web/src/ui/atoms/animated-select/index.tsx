"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import * as Select from "@radix-ui/react-select";
import { motion } from "motion/react";
import { ChevronDown as ChevronDownIcon } from "@slipstream/ui";

export interface AnimatedSelectItem<T extends string = string> {
  value: T;
  label: string;
  pixelSize?: string;
}

export function AnimatedSelect<T extends string = string>({
  items,
  value,
  onValueChange,
  placeholder = "...",
  renderItem,
  triggerClassName,
  contentClassName,
  ariaLabel
}: {
  items: readonly AnimatedSelectItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  placeholder?: ReactNode;
  renderItem?: (item: AnimatedSelectItem<T>, isSelected: boolean) => ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = items.find(i => i.value === value);
  const handleValueChange = (nextValue: string) => {
    const nextItem = items.find(item => item.value === nextValue);
    if (nextItem) {
      onValueChange(nextItem.value);
    }
  };

  return (
    <Select.Root
      open={open}
      onOpenChange={setOpen}
      value={value}
      onValueChange={handleValueChange}>
      <Select.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-8.75 w-50 items-center justify-between gap-1.25 rounded-[0.3125rem] border-[1px_solid_#1d2628] bg-[hsl(190,21%,5%)] p-[0_0.9375rem] text-base leading-none text-[hsl(0,0%,96%)] focus:[box-shadow:0_0_0_2px_#0f1115]",
          triggerClassName
        )}
        asChild>
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{ willChange: "transform" }}>
          <Select.Value placeholder={placeholder}>
            {current
              ? renderItem
                ? (
                    <>
                      <span className="sr-only">{current.label}</span>
                      {renderItem(current, true)}
                    </>
                  )
                : current.label
              : null}
          </Select.Value>
          <Select.Icon>
            <ChevronDownIcon />
          </Select.Icon>
        </motion.button>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content position="popper" sideOffset={4} asChild>
          <motion.div
            className={cn(
              "z-[80] max-h-72 min-w-(--radix-select-trigger-width) overflow-hidden rounded-[0.3125rem] border-[1px_solid_#1d2628] bg-[hsl(190,21%,5%)] text-[hsl(0,0%,96%)] shadow-xl",
              contentClassName
            )}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.2,
              scale: {
                type: "spring",
                visualDuration: 0.3,
                bounce: 0.5
              }
            }}
            style={{ willChange: "transform, opacity" }}>
            <Select.Viewport className="max-h-72 p-1.25">
              {items.map(item => {
                const isSelected = value === item.value;
                return (
                  <Select.Item
                    key={item.value}
                    value={item.value}
                    textValue={item.label}
                    className="item relative flex h-6.25 cursor-pointer items-center rounded-[0.1875rem] pr-8.75 pl-6.25 text-base select-none data-disabled:pointer-events-none data-highlighted:bg-[hsl(220,17%,7%)] data-highlighted:text-[hsl(0,0%,96%)] data-highlighted:outline-0"
                    asChild>
                    <motion.div
                      initial={{
                        backgroundColor: "#0b1011"
                      }}
                      whileHover={{
                        backgroundColor: "#9911ff"
                      }}
                      transition={{
                        duration: 0.1,
                        ease: "linear"
                      }}
                      style={{
                        willChange: "background-color"
                      }}>
                      {renderItem ? (
                        <Select.ItemText>
                          <span className="sr-only">{item.label}</span>
                        </Select.ItemText>
                      ) : null}
                      {renderItem ? (
                        renderItem(item, isSelected)
                      ) : (
                        <Select.ItemText>{item.label}</Select.ItemText>
                      )}
                    </motion.div>
                  </Select.Item>
                );
              })}
            </Select.Viewport>
          </motion.div>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import * as Select from "@radix-ui/react-select";
import { motion } from "motion/react";
import { ChevronDown as ChevronDownIcon } from "@slipstream/ui";

export function AnimatedSelect({
  values,
  placeholder = "..."
}: {
  values: string[];
  placeholder?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  return (
    <Select.Root
      open={open}
      onOpenChange={setOpen}
      value={value}
      onValueChange={setValue}>
      <Select.Trigger
        className="inline-flex h-8.75 w-50 items-center justify-between gap-1.25 rounded-[0.3125rem] border-[1px_solid_#1d2628] bg-[hsl(190,21%,5%)] p-[0_0.9375rem] text-base leading-none text-[hsl(0,0%,96%)] focus:[box-shadow:0_0_0_2px_#0f1115]"
        asChild>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{ willChange: "transform" }}>
          <Select.Value placeholder={placeholder} />
          <Select.Icon>
            <ChevronDownIcon />
          </Select.Icon>
        </motion.button>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content asChild>
          <motion.div
            className="overflow-hidden rounded-[0.3125rem] border-[1px_solid_#1d2628] bg-[hsl(190,21%,5%)] text-[hsl(0,0%,96%)]"
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
            <Select.Viewport className="p-1.25">
              {values.map(val => (
                <Select.Item
                  key={val}
                  value={val.toLowerCase()}
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
                    <Select.ItemText>{val}</Select.ItemText>
                  </motion.div>
                </Select.Item>
              ))}
            </Select.Viewport>
          </motion.div>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

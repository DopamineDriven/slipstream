```tsx
"use client";

import { useCallback, useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as Select from "@radix-ui/react-select";
import * as Popover from "@radix-ui/react-popover";
import {
  useImageGenSettings,
  type UnifiedAspectRatioOption,
} from "@/context/image-gen-settings-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { parseAndScaleRatio } from "@/lib/scale-ratio";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { ChevronDown, Check, SlidersHorizontal } from "lucide-react";

const SHAPE_CONTAINER_SIZE = { sm: 16, md: 20, lg: 24 };

function AspectRatioShape({
  ratio,
  isSelected,
  className,
  size = "sm",
}: {
  ratio: UnifiedAspectRatioOption;
  isSelected?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const { w, h } = parseAndScaleRatio(ratio.value);
  const containerSize = SHAPE_CONTAINER_SIZE[size];
  const aspectRatio = w / h;

  let shapeW: number;
  let shapeH: number;

  if (aspectRatio >= 1) {
    shapeW = containerSize;
    shapeH = containerSize / aspectRatio;
  } else {
    shapeH = containerSize;
    shapeW = containerSize * aspectRatio;
  }

  const offsetX = (containerSize - shapeW) / 2;
  const offsetY = (containerSize - shapeH) / 2;

  return (
    <svg
      viewBox={`0 0 ${containerSize} ${containerSize}`}
      width={containerSize}
      height={containerSize}
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <rect
        x={offsetX}
        y={offsetY}
        width={shapeW}
        height={shapeH}
        rx={Math.min(shapeW, shapeH) * 0.12}
        className={cn(
          "transition-colors",
          isSelected ? "fill-foreground" : "fill-muted-foreground/50"
        )}
      />
    </svg>
  );
}

function SettingsSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  renderOption,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  renderOption?: (option: { value: T; label: string }, isSelected: boolean) => React.ReactNode;
}) {
  const layoutId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select.Root value={value} onValueChange={onChange} open={isOpen} onOpenChange={setIsOpen}>
        <Select.Trigger asChild>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2",
              "bg-muted text-foreground outline-none",
              "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            <Select.Value>
              {renderOption ? (
                renderOption(current, true)
              ) : (
                <span className="text-sm">{current.label}</span>
              )}
            </Select.Value>
            <Select.Icon asChild>
              <motion.div
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <ChevronDown className="size-4 text-muted-foreground" />
              </motion.div>
            </Select.Icon>
          </motion.button>
        </Select.Trigger>
        <AnimatePresence>
          {isOpen && (
            <Select.Portal>
              <Select.Content position="popper" sideOffset={4} asChild>
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className={cn(
                    "z-100 max-h-60 min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg",
                    "border border-border bg-popover text-popover-foreground shadow-md"
                  )}
                >
                  <Select.Viewport className="p-1">
                    {options.map((option, index) => {
                      const isSelected = value === option.value;
                      return (
                        <Select.Item
                          key={option.value}
                          value={option.value}
                          asChild
                        >
                          <motion.div
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{
                              type: "spring",
                              stiffness: 400,
                              damping: 25,
                              delay: index * 0.03,
                            }}
                            className={cn(
                              "relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none",
                              "hover:bg-transparent focus:bg-transparent"
                            )}
                          >
                            {isSelected && (
                              <motion.div
                                layoutId={layoutId}
                                className="absolute inset-0 rounded-md bg-accent"
                                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                              />
                            )}
                            <span className="relative z-10 flex items-center gap-2">
                              {renderOption ? (
                                renderOption(option, isSelected)
                              ) : (
                                <Select.ItemText>
                                  <span className="text-sm">{option.label}</span>
                                </Select.ItemText>
                              )}
                            </span>
                            <Select.ItemIndicator className="relative z-10 ml-auto">
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                              >
                                <Check className="size-4" />
                              </motion.div>
                            </Select.ItemIndicator>
                          </motion.div>
                        </Select.Item>
                      );
                    })}
                  </Select.Viewport>
                </motion.div>
              </Select.Content>
            </Select.Portal>
          )}
        </AnimatePresence>
      </Select.Root>
    </div>
  );
}

function SettingsContent() {
  const {
    settings,
    updateSettings,
    aspectRatios,
    qualities,
    supportsOutputFormat,
    supportsBackground,
    outputFormats,
    backgrounds,
  } = useImageGenSettings();

  const handleAspectRatioChange = useCallback(
    (value: string) => updateSettings({ aspectRatio: value }),
    [updateSettings]
  );

  const handleQualityChange = useCallback(
    (value: string) => updateSettings({ quality: value }),
    [updateSettings]
  );

  const handleOutputFormatChange = useCallback(
    (value: string) => updateSettings({ outputFormat: value }),
    [updateSettings]
  );

  const handleBackgroundChange = useCallback(
    (value: string) => updateSettings({ background: value }),
    [updateSettings]
  );

  return (
    <div className="flex flex-col gap-4">
      <SettingsSelect
        label="Aspect Ratio"
        value={settings.aspectRatio}
        options={aspectRatios}
        onChange={handleAspectRatioChange}
        renderOption={(option, isSelected) => (
          <div className="flex items-center gap-2">
            <AspectRatioShape ratio={option} isSelected={isSelected} />
            <span className="text-sm">{option.label}</span>
          </div>
        )}
      />

      <SettingsSelect
        label="Quality"
        value={settings.quality}
        options={qualities}
        onChange={handleQualityChange}
      />

      {supportsOutputFormat && outputFormats && (
        <SettingsSelect
          label="Format"
          value={settings.outputFormat ?? "png"}
          options={outputFormats}
          onChange={handleOutputFormatChange}
        />
      )}

      {supportsBackground && backgrounds && (
        <SettingsSelect
          label="Background"
          value={settings.background ?? "auto"}
          options={backgrounds}
          onChange={handleBackgroundChange}
        />
      )}
    </div>
  );
}

export function ImageGenSettingsButton({ className }: { className?: string }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center justify-center rounded-lg p-2",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
              "transition-colors",
              className
            )}
            aria-label="Image generation settings"
          >
            <SlidersHorizontal className="size-5" />
          </button>
        </DrawerTrigger>
        <DrawerContent>
          <div className="mx-auto mt-4 h-1 w-12 rounded-full bg-muted" />
          <div className="p-4 pb-8">
            <h3 className="mb-4 text-sm font-medium">Image Settings</h3>
            <SettingsContent />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className={cn(
            "flex items-center justify-center rounded-lg p-2",
            "text-muted-foreground hover:bg-muted hover:text-foreground",
            open && "bg-muted text-foreground",
            className
          )}
          aria-label="Image generation settings"
        >
          <SlidersHorizontal className="size-5" />
        </motion.button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" sideOffset={8} align="start" asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{
              duration: 0.2,
              scale: { type: "spring", stiffness: 500, damping: 30, bounce: 0.4 },
            }}
            className={cn(
              "z-50 w-64 rounded-xl p-4",
              "border border-border bg-popover text-popover-foreground shadow-lg"
            )}
          >
            <h3 className="mb-4 text-sm font-medium">Image Settings</h3>
            <SettingsContent />
          </motion.div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export { AspectRatioShape };

```

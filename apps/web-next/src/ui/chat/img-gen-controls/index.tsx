"use client";

import type { TargetAndTransition } from "motion/react";
import { useCallback, useState } from "react";
import { ImageGenCostSlider } from "@/ui/chat/img-gen-controls/cost-slider";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import type {
  AIChatRequestImgGenFields,
  ImageGenProviders,
  Unenumerate
} from "@slipstream/types";
import { modelIdsByProviderImgGen } from "@slipstream/types";
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Tools,
  X
} from "@slipstream/ui";

interface ImageGenControlsProps {
  settings: AIChatRequestImgGenFields;
  onSettingsChange: (settings: AIChatRequestImgGenFields) => void;
  disabled?: boolean;
  provider: ImageGenProviders;
  model: Unenumerate<
    (typeof modelIdsByProviderImgGen)[keyof typeof modelIdsByProviderImgGen]
  >;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const dialogOpenState: TargetAndTransition = {
  opacity: 1,
  filter: "blur(0px)",
  rotateX: 0,
  rotateY: 0,
  z: 0,
  transition: {
    delay: 0.2,
    duration: 0.5,
    ease: [0.17, 0.67, 0.51, 1],
    opacity: {
      delay: 0.2,
      duration: 0.5,
      ease: "easeOut"
    }
  }
};

const dialogInitialState: TargetAndTransition = {
  opacity: 0,
  filter: "blur(10px)",
  z: -100,
  rotateY: 25,
  rotateX: 5,
  transformPerspective: 500,
  transition: {
    duration: 0.3,
    ease: [0.67, 0.17, 0.62, 0.64]
  }
};

export function ImageGenControls({
  settings,
  onSettingsChange,
  disabled = false,
  open: controlledOpen,
  model,
  provider,
  onOpenChange: controlledOnOpenChange
}: ImageGenControlsProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const _handleCountChange = useCallback(
    (value: number) => {
      onSettingsChange({ ...settings, n: value });
    },
    [settings, onSettingsChange]
  );

  const handlePartialImagesChange = useCallback(
    (value: number[]) => {
      onSettingsChange({ ...settings, output_partial_images: value[0] });
    },
    [settings, onSettingsChange]
  );

  const handleSizeChange = useCallback(
    (value: string) => {
      onSettingsChange({
        ...settings,
        output_size: value satisfies AIChatRequestImgGenFields["output_size"]
      });
    },
    [settings, onSettingsChange]
  );

  const handleQualityChange = useCallback(
    (value: string) => {
      onSettingsChange({
        ...settings,
        output_quality:
          value satisfies AIChatRequestImgGenFields["output_quality"]
      });
    },
    [settings, onSettingsChange]
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Image generation settings"
          className="text-muted-foreground hover:text-foreground hover:bg-accent h-8"
          disabled={disabled}>
          <Tools className="size-4" />
          <span className="sr-only">Image generation settings</span>
        </Button>
      </Dialog.Trigger>

      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
                <motion.div
                  className="bg-background border-border pointer-events-auto w-full max-w-md rounded-lg border p-6 shadow-lg"
                  initial={dialogInitialState}
                  animate={dialogOpenState}
                  exit={dialogInitialState}
                  style={{ transformPerspective: 500 }}>
                  <div className="mb-6 flex items-center justify-between">
                    <Dialog.Title className="text-lg font-semibold">
                      Image Generation Settings
                    </Dialog.Title>
                    <Dialog.Close asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8">
                        <X className="size-4" />
                        <span className="sr-only">Close</span>
                      </Button>
                    </Dialog.Close>
                  </div>

                  <Dialog.Description className="sr-only">
                    Configure advanced image generation parameters including
                    count, size, quality, and partial image rendering.
                  </Dialog.Description>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label
                        htmlFor="count-slider"
                        className="text-sm font-medium">
                        Count
                      </Label>
                      <ImageGenCostSlider
                        value={settings?.n ?? 0}
                        model={model}
                        provider={provider}
                        min={1}
                        max={10}
                        costPerImage={0.04}
                      />
                      <p className="text-muted-foreground text-xs">
                        Number of images to generate (1-10)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="size-select"
                        className="text-sm font-medium">
                        Size
                      </Label>
                      <Select
                        value={settings.output_size}
                        onValueChange={handleSizeChange}>
                        <SelectTrigger id="size-select" className="w-full">
                          <SelectValue placeholder="Select size" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="sm">Small</SelectItem>
                          <SelectItem value="md">Medium</SelectItem>
                          <SelectItem value="lg">Large</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-muted-foreground text-xs">
                        Output image size (provider-specific)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="quality-select"
                        className="text-sm font-medium">
                        Quality
                      </Label>
                      <Select
                        value={settings.output_quality}
                        onValueChange={handleQualityChange}>
                        <SelectTrigger id="quality-select" className="w-full">
                          <SelectValue placeholder="Select quality" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-muted-foreground text-xs">
                        Output image quality
                      </p>
                    </div>

                    {settings.output_partial_images && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor="partial-slider"
                            className="text-sm font-medium">
                            Partial Images
                          </Label>
                          <span className="text-muted-foreground text-sm">
                            {settings.output_partial_images}
                          </span>
                        </div>
                        <Slider
                          id="partial-slider"
                          min={0}
                          max={3}
                          step={1}
                          value={[settings.output_partial_images]}
                          onValueChange={handlePartialImagesChange}
                          className="w-full"
                        />
                        <p className="text-muted-foreground text-xs">
                          Progressive generation steps (0-3, requires streaming)
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useCookiesCtx } from "@/context/cookie-context";
import { useImageGen } from "@/context/image-gen-context";
import { AnimatedSelect } from "@/ui/atoms/animated-select";
import { AspectRatioShape } from "@/ui/atoms/aspect-ratio-shape";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle
} from "@/ui/atoms/drawer";
import {
  Button,
  ImageGen,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Tools
} from "@slipstream/ui";

function ImageGenSettingsForm() {
  const imgGen = useImageGen();

  if (!imgGen.settings) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-sm font-medium">
          Aspect Ratio
        </span>
        <AnimatedSelect
          ariaLabel="Select image aspect ratio"
          items={imgGen.aspectRatios}
          value={imgGen.settings.aspectRatio}
          onValueChange={value => imgGen.updateSettings({ aspectRatio: value })}
          triggerClassName="w-full"
          contentClassName="z-[70] w-(--radix-select-trigger-width)"
          renderItem={(item, isSelected) => (
            <div className="flex items-center gap-3">
              <AspectRatioShape
                ratio={item}
                isSelected={isSelected}
                size="md"
              />
              <div className="flex items-center gap-2">
                <span>{item.label}</span>
                {item.pixelSize ? (
                  <span className="text-[0.8125rem] opacity-70">
                    {item.pixelSize}
                  </span>
                ) : null}
              </div>
            </div>
          )}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-sm font-medium">
          Quality
        </span>
        <AnimatedSelect
          ariaLabel="Select image quality"
          items={imgGen.qualities}
          value={imgGen.settings.quality}
          onValueChange={value => imgGen.updateSettings({ quality: value })}
          triggerClassName="w-full"
          contentClassName="z-[70] w-(--radix-select-trigger-width)"
        />
      </div>
    </div>
  );
}

export function ChatInputImageGenControls() {
  const { get } = useCookiesCtx();
  const imgGen = useImageGen();
  const isMobile = get("viewport") === "mobile";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!imgGen.supported || !imgGen.enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
  }, [imgGen.enabled, imgGen.supported]);

  const handleSettingsClick = useCallback(() => {
    if (!imgGen.supported) return;
    if (!imgGen.enabled) {
      imgGen.setEnabled(true);
      setOpen(true);
      return;
    }
    setOpen(prev => !prev);
  }, [imgGen]);

  const handleToggleImageMode = useCallback(() => {
    if (!imgGen.supported) return;
    if (imgGen.enabled) {
      imgGen.setEnabled(false);
      setOpen(false);
      return;
    }
    imgGen.setEnabled(true);
    setOpen(true);
  }, [imgGen]);

  const imageButtonTitle = imgGen.supported
    ? imgGen.enabled
      ? "Disable image generation"
      : "Enable image generation"
    : "Selected model does not support image generation";

  return (
    <>
      {imgGen.supported ? (
        isMobile ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Image settings"
            className="text-muted-foreground hover:text-foreground hover:bg-accent h-8"
            onClick={handleSettingsClick}>
            <Tools className="size-4" />
            <span className="sr-only">Image settings</span>
          </Button>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Image settings"
                className="text-muted-foreground hover:text-foreground hover:bg-accent h-8"
                onClick={handleSettingsClick}>
                <Tools className="size-4" />
                <span className="sr-only">Image settings</span>
              </Button>
            </PopoverAnchor>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={10}
              className="w-88 rounded-[1.75rem] p-5 shadow-xl">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <h3 className="text-foreground text-[1.125rem] font-semibold">
                    Image Settings
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Tune image generation for the active model.
                  </p>
                </div>
                <ImageGenSettingsForm />
              </div>
            </PopoverContent>
          </Popover>
        )
      ) : null}

      <Button
        type="button"
        variant={imgGen.enabled ? "default" : "ghost"}
        size="icon"
        title={imageButtonTitle}
        disabled={!imgGen.supported}
        className={
          imgGen.enabled
            ? "hover:bg-accent text-foreground h-8"
            : "hover:bg-accent text-muted-foreground hover:text-foreground h-8"
        }
        onClick={handleToggleImageMode}>
        <ImageGen className="size-4" />
        <span className="sr-only">Toggle Image Generation</span>
      </Button>

      <Drawer open={isMobile ? open : false} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[80vh] rounded-t-[1.75rem] px-4 pb-6">
          <DrawerHeader className="px-1 pt-5 text-left">
            <DrawerTitle className="text-lg">Image Settings</DrawerTitle>
            <DrawerDescription>
              Tune image generation for the active model.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-1">
            <ImageGenSettingsForm />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

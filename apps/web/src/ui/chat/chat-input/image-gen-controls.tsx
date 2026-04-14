"use client";

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
          contentClassName="w-full"
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
          contentClassName="w-full"
        />
      </div>
    </div>
  );
}

export function ChatInputImageGenSettingsDrawer({
  open,
  onOpenChange,
  isMobile
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      direction={isMobile ? "bottom" : "right"}>
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-[1.75rem] data-[vaul-drawer-direction=bottom]:px-4 data-[vaul-drawer-direction=bottom]:pb-6 data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:max-w-md data-[vaul-drawer-direction=right]:px-4 data-[vaul-drawer-direction=right]:pb-6">
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
  );
}

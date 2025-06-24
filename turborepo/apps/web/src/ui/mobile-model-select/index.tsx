"use client";

import { Button, Icon, ScrollArea } from "@t3-chat-clone/ui";
import Image from "next/image";
import type { Model } from "@/types/ui"; // Assuming Model type is in lib/types.ts
import { availableModels } from "@/lib/mock";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle
} from "@/ui/atoms/drawer";

interface MobileModelSelectorDrawerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectedModel: Model;
  onSelectModel: (model: Model) => void;
}

export function MobileModelSelectorDrawer({
  isOpen,
  onOpenChange,
  selectedModel,
  onSelectModel
}: MobileModelSelectorDrawerProps) {
  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-brand-component border-brand-border text-brand-text">
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle className="text-brand-text-emphasis">
              Select Model
            </DrawerTitle>
            <DrawerDescription className="text-brand-text-muted">
              Choose the AI model for your chat.
            </DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="max-h-[60vh] p-4">
            <div className="space-y-2">
              {availableModels.map(model => (
                <Button
                  key={model.id}
                  variant={
                    selectedModel.id === model.id ? "default" : "outline"
                  }
                  className={`h-auto w-full justify-start py-3 text-left ${
                    selectedModel.id === model.id
                      ? "bg-brand-primary text-brand-primaryForeground"
                      : "bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text"
                  }`}
                  onClick={() => {
                    onSelectModel(model);
                    onOpenChange(false);
                  }}>
                  <div className="flex w-full items-center">
                    {model.icon && (
                      <Image
                        src={model.icon || "/placeholder.svg"}
                        alt={model.name}
                        width={20}
                        height={20}
                        className="mr-3 rounded-sm"
                      />
                    )}
                    <span className="flex-grow">{model.name}</span>
                    {selectedModel.id === model.id && (
                      <Icon.Check className="ml-auto h-5 w-5" />
                    )}
                  </div>
                </Button>
              ))}
            </div>
          </ScrollArea>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button
                variant="outline"
                className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text">
                Cancel
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

"use client";

import { formatShortcut } from "@/hooks/use-keyboard-shortcuts";
import { usePlatformDetection } from "@/hooks/use-platform-detection";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/ui/atoms/tooltip";
import { BaseSVGProps, Button, PanelLeftClose } from "@t3-chat-clone/ui";

interface SidebarToggleButtonProps {
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
  variant?: "ghost" | "outline" | "default";
  size?: "sm" | "default" | "lg" | "icon";
}
function PanelLeft({ role = "img", ...svg }: BaseSVGProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      role={role}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...svg}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

export function SidebarToggleButton({
  isOpen,
  onToggle,
  className,
  variant = "ghost",
  size = "icon"
}: SidebarToggleButtonProps) {
  const { isMac } = usePlatformDetection();

  const shortcutText = formatShortcut(
    {
      key: "s",
      ctrlKey: !isMac,
      metaKey: isMac,
      shiftKey: true,
      callback: onToggle,
      description: "Toggle sidebar"
    },
    isMac
  );

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size={size}
            onClick={onToggle}
            className={cn(
              "text-brand-text-muted hover:text-brand-text hover:bg-brand-component",
              className
            )}
            aria-label={`${isOpen ? "Close" : "Open"} sidebar`}>
            {isOpen ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <PanelLeft className="h-5 w-5" />
            )}
            <span className="sr-only">{isOpen ? "Close" : "Open"} sidebar</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="bg-brand-component text-brand-text border-brand-border">
          <div className="flex flex-col items-center gap-1">
            <span>{isOpen ? "Close" : "Open"} sidebar</span>
            <kbd className="bg-brand-sidebar border-brand-border rounded border px-1.5 py-0.5 text-xs">
              {shortcutText}
            </kbd>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

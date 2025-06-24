"use client";

import type { JSX } from "react";
import type { BaseSVGProps } from "@t3-chat-clone/ui";
import { Button } from "@t3-chat-clone/ui";
import { memo, useCallback } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/ui/atoms/tooltip";

type SectionIds =
  | "account"
  | "apiKeys"
  | "customization"
  | "history"
  | "models"
  | "attachments"
  | "contactUs";

type SettingsNavUIProps = {
  id: SectionIds;
  title: string;
  icon: ({ ...svg }: BaseSVGProps) => JSX.Element;
};

interface SettingsSectionUI {
  sections: SettingsNavUIProps[] | readonly SettingsNavUIProps[];
}

interface SettingsSectionUISingleton {
  section: SettingsNavUIProps;
}

interface SettingsNavigationPropsOriginal extends SettingsSectionUI {
  activeSection: string;
  onNavigate: (sectionId: string) => void;
  isCollapsed: boolean;
  className?: string;
}

interface SettingsWorkupProps extends SettingsSectionUISingleton {
  isActive: boolean;
  onNavigate: (sectionId: string) => void;
  isCollapsed: boolean;
}

const SettingsWorkup = memo(
  ({ section, onNavigate, isActive, isCollapsed }: SettingsWorkupProps) => {
    const Icon = section.icon;

    const handleNavigate = useCallback(() => {
      return onNavigate(section.id);
    }, [onNavigate, section]);

    if (isCollapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              onClick={handleNavigate}
              className={cn(
                "relative h-10 w-full justify-center px-2 py-2 text-sm",
                isActive
                  ? "bg-brand-primary/20 text-brand-primary hover:bg-brand-primary/25"
                  : "text-brand-text-muted hover:bg-brand-component hover:text-brand-text"
              )}
              aria-label={section.title}>
              <Icon
                className={cn("size-5", isActive ? "text-brand-primary" : "")}
              />
              {isActive && (
                <motion.div
                  layoutId="activeSettingsTabIndicator"
                  className="bg-brand-primary absolute top-0 bottom-0 left-0 w-1 rounded-r-full"
                  initial={false}
                  animate={{ opacity: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 30
                  }}
                />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            className="bg-brand-component text-brand-text border-brand-border">
            {section.title}
          </TooltipContent>
        </Tooltip>
      );
    } else
      return (
        <Button
          variant="ghost"
          onClick={handleNavigate}
          className={cn(
            "relative h-auto w-full justify-start px-3 py-2 text-sm",
            isActive
              ? "bg-brand-primary/20 text-brand-primary hover:bg-brand-primary/25"
              : "text-brand-text-muted hover:bg-brand-component hover:text-brand-text"
          )}>
          <Icon
            className={cn("mr-2 size-4", isActive ? "text-brand-primary" : "")}
          />
          {section.title}
          {isActive && (
            <motion.div
              layoutId="activeSettingsTabIndicator"
              className="bg-brand-primary absolute top-0 bottom-0 left-0 w-1 rounded-r-full"
              initial={false}
              animate={{ opacity: 1 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30
              }}
            />
          )}
        </Button>
      );
  }
);
SettingsWorkup.displayName = "SettingsWorkup";

export function SettingsNavigation({
  activeSection,
  isCollapsed,
  onNavigate,
  sections,
  className
}: SettingsNavigationPropsOriginal) {
  return (
    <TooltipProvider delayDuration={0}>
      <nav className={cn("space-y-1", className)}>
        {sections.map(section => {
          const isActive = activeSection === section.id;
          return (
            <motion.div key={section.id} layout>
              <SettingsWorkup
                isActive={isActive}
                onNavigate={onNavigate}
                section={section}
                isCollapsed={isCollapsed}
              />
            </motion.div>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}

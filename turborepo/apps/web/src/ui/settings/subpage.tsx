"use client";

import type { User as UserProps } from "next-auth";
import type React from "react";
import {
  ArrowLeft,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  History,
  KeyRound,
  LogOut,
  MessageCircleQuestion,
  Palette,
  PanelLeftClose,
  PanelRightClose,
  Paperclip,
  User
} from "@t3-chat-clone/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useMediaQuery } from "@/hooks/use-media-query"; // Assuming you have this hook
import { cn } from "@/lib/utils";
import { MobileSettingsToolbar } from "@/ui/settings/mobile-settings-toolbar";
import { AccountSettingsSection } from "@/ui/settings/sections/account-settings-toolbar";
import { ApiKeysSettingsSection } from "@/ui/settings/sections/api-keys-tab";
import { AttachmentsSettingsSection } from "@/ui/settings/sections/attachment-settings-section";
import { ContactUsSettingsSection } from "@/ui/settings/sections/contact-us-settings-section";
import { CustomizationSettingsSection } from "@/ui/settings/sections/customization-settings-section";
import { HistorySettingsSection } from "@/ui/settings/sections/history-settings-section";
import { ModelsSettingsSection } from "@/ui/settings/sections/models-settings-section";
import { SettingsNavigation } from "@/ui/settings/settings-navigation";
import { ThemeToggle } from "@/ui/theme-toggle";

const settingsSectionsConfig = [
  {
    id: "account",
    title: "Account",
    icon: User,
    component: AccountSettingsSection,
    action: () => {},
    type: "section"
  },
  {
    id: "apiKeys",
    title: "API Keys",
    icon: KeyRound,
    component: ApiKeysSettingsSection,
    action: () => {},
    type: "section"
  },
  {
    id: "customization",
    title: "Customization",
    icon: Palette,
    component: CustomizationSettingsSection,
    action: () => {},
    type: "section"
  },
  {
    id: "history",
    title: "History & Sync",
    icon: History,
    component: HistorySettingsSection,
    action: () => {},
    type: "section"
  },
  {
    id: "models",
    title: "Models",
    icon: KeyRound,
    component: ModelsSettingsSection,
    action: () => {},
    type: "section"
  },
  {
    id: "attachments",
    title: "Attachments",
    icon: Paperclip,
    component: AttachmentsSettingsSection,
    action: () => {},
    type: "section"
  },
  {
    id: "contactUs",
    title: "Contact Us",
    icon: MessageCircleQuestion,
    component: ContactUsSettingsSection,
    action: () => {},
    type: "section"
  }
] as const;

const LEFT_COLUMN_WIDTH_DESKTOP = "20dvw";
const LEFT_COLUMN_WIDTH_COLLAPSED = "w-16"; // approx <5dvw on mobile, e.g. 64px
const RIGHT_COLUMN_WIDTH_DESKTOP = "w-20"; // approx 80px

type SettingsSectionUnion = (typeof settingsSectionsConfig)[number]["id"];

export default function SettingsPage({ user }: { user?: UserProps }) {
  const [activeSection, setActiveSection] = useState<SettingsSectionUnion>(
    settingsSectionsConfig[0].id
  );
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isNavigatingRef = useRef(false);

  const isSmallScreen = !useMediaQuery("(min-width: 640px)"); // Tailwind 'sm' breakpoint is 640px
  const [isLeftSidebarManuallyCollapsed, setIsLeftSidebarManuallyCollapsed] =
    useState(false);

  // Determine actual collapsed state based on screen size and manual toggle
  const isLeftSidebarEffectivelyCollapsed =
    isSmallScreen || isLeftSidebarManuallyCollapsed;

  const activeSectionTitle =
    settingsSectionsConfig.find(s => s.id === activeSection)?.title ??
    "Settings";

  const handleNavigation = useCallback(
    (sectionId: SettingsSectionUnion) => {
      setActiveSection(sectionId);
      isNavigatingRef.current = true;
      if (!sectionRefs.current) return;
      sectionRefs.current[sectionId]?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 1000);

      // If on small screen and sidebar was manually expanded (overlay), collapse it after navigation
      if (isSmallScreen && !isLeftSidebarManuallyCollapsed) {
        // This logic needs refinement if the "expanded" state on small screens is an overlay
        // For now, assuming the narrow bar is the primary small screen state.
      }
    },
    [isSmallScreen, isLeftSidebarManuallyCollapsed]
  );

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(
      entries => {
        if (isNavigatingRef.current) return;
        const visibleSection = entries.find(
          entry => entry.isIntersecting && entry.intersectionRatio >= 0.5
        );
        if (visibleSection)
          setActiveSection(visibleSection.target.id as SettingsSectionUnion);
        else {
          const slightlyVisibleSections = entries.filter(
            entry => entry.isIntersecting && entry.intersectionRatio > 0
          );
          if (slightlyVisibleSections.length > 0) {
            slightlyVisibleSections.sort(
              (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
            );
            setActiveSection(
              slightlyVisibleSections?.[0]?.target?.id as SettingsSectionUnion
            );
          }
        }
      },
      {
        root: scrollContainerRef.current,
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0],
        rootMargin: "0px 0px -50% 0px"
      }
    );
    const currentObserver = observerRef.current;
    if (!sectionRefs.current) return;
    Object.values(sectionRefs.current).forEach(ref => {
      if (ref) currentObserver.observe(ref);
    });
    return () => {
      if (currentObserver) currentObserver.disconnect();
    };
  }, []);

  return (
    <>
      <div className="bg-brand-background text-brand-text flex h-screen overflow-hidden">
        {/* Mobile Toolbar - shown only on small screens */}
        {isSmallScreen && (
          <MobileSettingsToolbar
            sections={settingsSectionsConfig}
            activeSection={activeSection}
            onNavigate={handleNavigation}
          />
        )}

        {/* Left Sidebar */}
        <AnimatePresence>
          {(!isSmallScreen ||
            (isSmallScreen && isLeftSidebarManuallyCollapsed)) && ( // Show if not small screen OR if small screen AND manually collapsed (icon bar)
            <motion.div
              key="left-sidebar"
              initial={{
                width: isLeftSidebarEffectivelyCollapsed
                  ? LEFT_COLUMN_WIDTH_COLLAPSED
                  : LEFT_COLUMN_WIDTH_DESKTOP
              }}
              animate={{
                width: isLeftSidebarEffectivelyCollapsed
                  ? LEFT_COLUMN_WIDTH_COLLAPSED
                  : `var(--left-sidebar-width, ${LEFT_COLUMN_WIDTH_DESKTOP})`
              }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              style={
                {
                  "--left-sidebar-width": LEFT_COLUMN_WIDTH_DESKTOP
                } as React.CSSProperties
              }
              className={cn(
                "bg-brand-sidebar border-brand-border z-20 flex h-full shrink-0 flex-col border-r p-3 sm:p-4",
                isSmallScreen ? "fixed" : "relative", // Fixed on small screens to overlay
                isLeftSidebarEffectivelyCollapsed
                  ? LEFT_COLUMN_WIDTH_COLLAPSED
                  : "w-[20dvw]"
              )}>
              <div
                className="mb-4 flex items-center"
                style={{
                  justifyContent: isLeftSidebarEffectivelyCollapsed
                    ? "center"
                    : "space-between"
                }}>
                {!isLeftSidebarEffectivelyCollapsed && (
                  <Button
                    variant="ghost"
                    asChild
                    className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component self-start">
                    <Link href="/">
                      <ArrowLeft className="mr-2 h-4 w-4" /> Back
                    </Link>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setIsLeftSidebarManuallyCollapsed(
                      !isLeftSidebarManuallyCollapsed
                    )
                  }
                  className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component">
                  {isLeftSidebarManuallyCollapsed ? (
                    <PanelRightClose />
                  ) : (
                    <PanelLeftClose />
                  )}
                </Button>
              </div>
              <SettingsNavigation
                sections={settingsSectionsConfig}
                activeSection={activeSection}
                onNavigate={handleNavigation}
                isCollapsed={isLeftSidebarEffectivelyCollapsed}
                className="flex-grow overflow-y-auto"
              />
              <div
                className={cn(
                  "border-brand-border mt-auto border-t pt-4",
                  isLeftSidebarEffectivelyCollapsed ? "flex justify-center" : ""
                )}>
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src={user?.image ?? "/user.svg?width=40&height=40&query=AR"}
                    alt={user?.name ?? "username"}
                  />
                  <AvatarFallback>
                    {user?.name?.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {!isLeftSidebarEffectivelyCollapsed && (
                  <div className="ml-3">
                    <p className="text-brand-text-emphasis text-sm font-medium">
                      {user?.name}
                    </p>
                    <p className="text-brand-text-muted text-xs">Free Plan</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Center Content Column */}
        <div
          className={cn(
            "flex flex-1 flex-col overflow-hidden",
            // Apply margin only if not small screen and corresponding sidebar is visible/expanded
            !isSmallScreen && !isLeftSidebarManuallyCollapsed && "ml-[20dvw]",
            !isSmallScreen && isLeftSidebarManuallyCollapsed && `ml-16`,
            !isSmallScreen && `mr-20` // Right sidebar margin for desktop
          )}>
          {/* Header for mobile */}
          {isSmallScreen && (
            <header className="border-brand-border bg-brand-background sticky top-0 z-10 flex h-14 items-center justify-between border-b p-3">
              <div className="flex-1">
                {/* Empty div to push title to center if needed or for menu button */}{" "}
              </div>
              <h1 className="text-brand-text-emphasis flex-1 text-center text-lg font-semibold">
                {activeSectionTitle}
              </h1>
              <div className="flex flex-1 justify-end">
                <ThemeToggle />
              </div>
            </header>
          )}

          <main
            ref={scrollContainerRef}
            className="relative flex-1 space-y-8 overflow-y-auto p-4 sm:space-y-10 sm:p-6 md:p-8">
            {settingsSectionsConfig.map(section => {
              const SectionComponent = section.component;
              return (
                <div
                  key={section.id}
                  id={section.id}
                  ref={el => {
                    if (!sectionRefs?.current?.[section.id]) {
                      undefined;
                    } else {
                      sectionRefs.current[section.id] = el;
                    }
                  }}
                  // Conditional padding/margin for sections
                  className="min-h-[80vh] scroll-mt-8 pt-8 pb-12">
                  <h2 className="text-brand-text-emphasis mb-4 text-2xl font-semibold sm:mb-6 sm:text-3xl">
                    {section.title}
                  </h2>
                  <SectionComponent />
                </div>
              );
            })}
          </main>
        </div>

        {/* Right Sidebar - hidden on small screens */}
        {!isSmallScreen && (
          <motion.div
            key="right-sidebar"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className={cn(
              "bg-brand-sidebar border-brand-border z-20 hidden h-full shrink-0 flex-col items-center border-l p-4 sm:flex",
              RIGHT_COLUMN_WIDTH_DESKTOP
            )}>
            <div className="mb-6">
              <AvatarImage
                src={user?.image ?? "/user.svg"}
                className="text-brand-text-muted h-8 w-8"
              />{" "}
              {/* Placeholder Logo */}
            </div>
            <ThemeToggle className="text-brand-text-muted hover:text-brand-text hover:bg-brand-component mb-auto" />
            <Button
              variant="ghost"
              className="flex h-auto w-full flex-col items-center py-2 text-red-400 hover:bg-red-400/10 hover:text-red-300">
              <LogOut className="mb-1 h-5 w-5" />
              <span className="text-xs">Sign Out</span>
            </Button>
          </motion.div>
        )}
      </div>
    </>
  );
}

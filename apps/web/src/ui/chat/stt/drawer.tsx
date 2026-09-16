"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labelledBy: string;
  describedBy?: string;
  children: ReactNode;
  side?: "right" | "bottom";
  className?: string;
}

export function Drawer({
  open,
  onOpenChange,
  labelledBy,
  describedBy,
  children,
  side = "right",
  className
}: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function finishClosing() {
    if (open) return;
    dialogRef.current?.close();
    if (previousFocus.current?.isConnected)
      previousFocus.current.focus({ preventScroll: true });
  }

  const offset = side === "right" ? { x: "100%" } : { y: "100%" };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
          )
        ).filter(
          element =>
            element.tabIndex >= 0 && element.getClientRects().length > 0
        );
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={event => {
        event.preventDefault();
        onOpenChange(false);
      }}
      // Unlike overflow-hidden, overflow-clip prevents autofocus from scrolling away the entrance transform.
      className="text-foreground fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-clip border-0 bg-transparent p-0 backdrop:bg-transparent">
      <AnimatePresence onExitComplete={finishClosing}>
        {open && (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 flex",
              side === "bottom" ? "items-end justify-center" : "justify-end"
            )}>
            <motion.div
              aria-hidden="true"
              className="pointer-events-auto absolute inset-0 bg-[color-mix(in_srgb,var(--background)_48%,transparent)] [@media(width<=767px)]:bg-[color-mix(in_srgb,var(--background)_65%,transparent)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              onPointerDown={() => onOpenChange(false)}
            />
            <motion.div
              key="drawer-panel"
              className={cn(
                "bg-background text-foreground pointer-events-auto relative flex min-h-0 shadow-[-24px_0_70px_color-mix(in_srgb,var(--background)_32%,transparent)]",
                side === "bottom"
                  ? "border-border h-auto max-h-[90dvh] w-[min(760px,calc(100%-32px))] overflow-y-auto rounded-t-[22px] rounded-b-none border border-b-0 [@media(width<=767px)]:w-full [@media(width<=767px)]:border-l-0"
                  : "h-full w-[min(var(--drawer-width,460px),100%)] border-l border-l-[color-mix(in_srgb,var(--foreground)_12%,transparent)] [@media(width<=767px)]:w-[min(var(--drawer-width,440px),100%)] [@media(width<=767px)]:border-l-0",
                className
              )}
              initial={offset}
              animate={{ x: 0, y: 0, opacity: 1 }}
              exit={offset}
              transition={{ type: "spring", stiffness: 340, damping: 38 }}>
              {children}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </dialog>
  );
}

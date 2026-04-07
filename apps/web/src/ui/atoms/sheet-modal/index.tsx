"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform
} from "motion/react";

const DISMISS_OFFSET = 92;
const DISMISS_VELOCITY = 840;
const SHEET_SPRING = { type: "spring" as const, stiffness: 400, damping: 40 };
const BACKDROP_TRANSITION = {
  type: "spring" as const,
  stiffness: 400,
  damping: 50
};

export default function SheetModal() {
  const [isOpen, setIsOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const y = useMotionValue(0);
  const sheetRef = useRef<HTMLElement>(null);
  const [hiddenY, setHiddenY] = useState(420);
  const backdropOpacity = useTransform(y, [0, hiddenY], [0.5, 0]);

  useEffect(() => {
    if (!isOpen) return;

    const nextHiddenY = Math.max(
      (sheetRef.current?.offsetHeight ?? 0) + 24,
      420
    );

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHiddenY(nextHiddenY);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const close = () => setIsOpen(false);

  return (
    <>
      <div className="container">
        <motion.button
          type="button"
          className="trigger"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(true)}
          data-primary-action>
          <ShareIcon />
          <span>Share</span>
        </motion.button>

        <AnimatePresence>
          {isOpen ? (
            <div className="sheet-root">
              <motion.button
                aria-label="Close sheet"
                type="button"
                onClick={close}
                className="backdrop"
                style={{
                  opacity: shouldReduceMotion ? 0.5 : backdropOpacity
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                transition={
                  shouldReduceMotion ? { duration: 0 } : BACKDROP_TRANSITION
                }
              />
              <motion.section
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label="Share options"
                className={`sheet ${shouldReduceMotion ? "" : "sheet-grab"}`}
                style={{ y }}
                initial={{
                  y: shouldReduceMotion ? 0 : hiddenY,
                  opacity: shouldReduceMotion ? 1 : 0.97
                }}
                animate={{ y: 0, opacity: 1 }}
                exit={{
                  y: shouldReduceMotion ? 0 : hiddenY,
                  opacity: shouldReduceMotion ? 1 : 0
                }}
                transition={shouldReduceMotion ? { duration: 0 } : SHEET_SPRING}
                drag={shouldReduceMotion ? false : "y"}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0.15, bottom: 0.8 }}
                dragMomentum
                dragTransition={{
                  bounceStiffness: 300,
                  bounceDamping: 30
                }}
                whileDrag={
                  shouldReduceMotion ? undefined : { cursor: "grabbing" }
                }
                onDragEnd={(_, info) => {
                  if (
                    info.offset.y > DISMISS_OFFSET ||
                    info.velocity.y > DISMISS_VELOCITY
                  ) {
                    close();
                  }
                }}>
                <div className="handle-row">
                  <div className="handle" />
                </div>
                <div className="close-row">
                  <button
                    type="button"
                    onClick={close}
                    className="close-btn"
                    aria-label="Close">
                    <CloseIcon />
                  </button>
                </div>
                <h3 className="sheet-title">Share</h3>
                <div className="contacts-row">
                  {CONTACTS.map(contact => (
                    <button
                      key={contact.name}
                      className="contact-btn"
                      onClick={close}
                      type="button">
                      <div
                        className="avatar"
                        style={{
                          backgroundColor: contact.color
                        }}>
                        {contact.initial}
                      </div>
                      <span className="contact-label">{contact.name}</span>
                    </button>
                  ))}
                </div>
                <div className="sheet-divider" />
                <div className="actions-list">
                  {ACTIONS.map(action => (
                    <button
                      key={action.label}
                      className="action-btn"
                      onClick={close}
                      type="button">
                      <action.Icon />
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              </motion.section>
            </div>
          ) : null}
        </AnimatePresence>
      </div>
      <StyleSheet />
    </>
  );
}

/** ==============   Icons   ================ */

const ShareIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
    <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
  </svg>
);

const CloseIcon = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 12 12"
    fill="none"
    aria-hidden="true">
    <path
      d="M10.546 1.354L1.354 10.546M10.546 10.546L1.354 1.354"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const ICON_PROPS: React.SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

const LinkIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const BookmarkIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
  </svg>
);

const MessageIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </svg>
);

const DownloadIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7,10 12,15 17,10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </svg>
);

/** ==============   Data   ================ */

const CONTACTS = [
  { name: "Alice", initial: "A", color: "#ff0088" },
  { name: "Ben", initial: "B", color: "#dd00ee" },
  { name: "Clara", initial: "C", color: "#0d63f8" },
  { name: "Dan", initial: "D", color: "#0cdcf7" }
];

const ACTIONS = [
  { label: "Copy Link", Icon: LinkIcon },
  { label: "Add to Reading List", Icon: BookmarkIcon },
  { label: "Send Message", Icon: MessageIcon },
  { label: "Save to Files", Icon: DownloadIcon }
];

/** ==============   Styles   ================ */

function StyleSheet() {
  return (
    <style>{`
            .container {
                width: 100%;
                min-height: 100dvh;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .trigger {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 10px 16px;
                font-size: 14px;
                font-weight: 500;
                font-family: inherit;
                color: #f5f5f5;
                background: #0b1011;
                border: 1px solid #1d2628;
                border-radius: 10px;
                cursor: pointer;
                user-select: none;
                -webkit-user-select: none;
                will-change: transform;
            }

            .sheet-root {
                position: fixed;
                inset: 0;
                z-index: 50;
                display: flex;
                align-items: flex-end;
                justify-content: center;
                padding: 0.5rem;
            }

            .backdrop {
                position: absolute;
                inset: 0;
                border: 0;
                background: #000;
                cursor: default;
            }

            .sheet {
                position: relative;
                width: 100%;
                max-width: 26rem;
                border-radius: 1.5rem;
                background: #0b1011;
                border: 1px solid #1d2628;
                padding: 0 1.25rem 1.5rem;
                touch-action: none;
                will-change: transform;
                box-shadow: 0 -4px 40px rgba(0, 0, 0, 0.4);
            }

            .sheet-grab {
                cursor: grab;
            }

            .handle-row {
                display: flex;
                justify-content: center;
                padding-top: 1rem;
                padding-bottom: 0.25rem;
            }

            .handle {
                height: 0.3rem;
                width: 2.5rem;
                border-radius: 9999px;
                background: rgba(255, 255, 255, 0.2);
            }

            .close-row {
                margin-bottom: 0.5rem;
                display: flex;
                justify-content: flex-end;
            }

            .close-btn {
                border: 0;
                height: 2rem;
                width: 2rem;
                border-radius: 9999px;
                background: rgba(255, 255, 255, 0.08);
                color: rgba(255, 255, 255, 0.5);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: background 150ms ease;
            }

            .close-btn:hover {
                background: rgba(255, 255, 255, 0.14);
            }

            .sheet-title {
                margin: 0 0 1rem;
                font-size: 1.4rem;
                line-height: 1.1;
                letter-spacing: -0.03em;
                color: #f5f5f5;
                font-weight: 600;
            }

            .contacts-row {
                display: flex;
                gap: 1rem;
                overflow-x: auto;
                padding-bottom: 0.25rem;
            }

            .contact-btn {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 0.4rem;
                background: none;
                border: 0;
                cursor: pointer;
                color: #f5f5f5;
                padding: 0;
                font-family: inherit;
                transition: transform 150ms ease;
            }

            .contact-btn:active {
                transform: scale(0.92);
            }

            .avatar {
                width: 3rem;
                height: 3rem;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.875rem;
                font-weight: 600;
                color: #f5f5f5;
            }

            .contact-label {
                font-size: 0.75rem;
                opacity: 0.6;
            }

            .sheet-divider {
                height: 1px;
                background: #1d2628;
                margin: 1rem 0;
            }

            .actions-list {
                display: flex;
                flex-direction: column;
                gap: 0.125rem;
            }

            .action-btn {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                padding: 0.75rem 0.5rem;
                border-radius: 0.625rem;
                background: none;
                border: 0;
                cursor: pointer;
                color: #f5f5f5;
                font-size: 0.9375rem;
                width: 100%;
                text-align: left;
                font-family: inherit;
                transition: background 150ms ease;
            }

            .action-btn:hover {
                background: rgba(255, 255, 255, 0.06);
            }

            .action-btn:active {
                transform: scale(0.98);
            }

            .action-btn svg {
                opacity: 0.7;
            }

            button:focus-visible {
                outline: 2px solid var(--accent);
                outline-offset: 2px;
            }

            @media (min-width: 640px) {
                .sheet-root {
                    padding: 0.75rem;
                }
            }
        `}</style>
  );
}

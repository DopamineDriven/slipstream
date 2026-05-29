"use client";

import { useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";

interface CreateButtonProps {
  menuSpring?: { stiffness: number; damping: number };
  clipPathDuration?: number;
  contentOffsetY?: number;
  contentScale?: number;
  staggerInterval?: number;
}

export default function CreateButton({
  menuSpring = { stiffness: 240, damping: 23 },
  clipPathDuration = 0.3,
  contentOffsetY = 40,
  contentScale = 0.9,
  staggerInterval = 0.05
}: CreateButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <MotionConfig
        transition={{
          type: "spring",
          ...menuSpring
        }}>
        <div style={container}>
          <motion.div style={wrapper}>
            <motion.button
              layoutId="wrapper"
              onClick={() => setIsOpen(!isOpen)}
              style={{
                ...triggerButton,
                clipPath: "inset(0)"
              }}>
              <span
                style={{
                  ...triggerCap,
                  top: -1,
                  left: -1,
                  borderRight: "none",
                  borderBottom: "none"
                }}
              />
              <span
                style={{
                  ...triggerCap,
                  top: -1,
                  right: -1,
                  borderLeft: "none",
                  borderBottom: "none"
                }}
              />
              <span
                style={{
                  ...triggerCap,
                  bottom: -1,
                  left: -1,
                  borderRight: "none",
                  borderTop: "none"
                }}
              />
              <span
                style={{
                  ...triggerCap,
                  bottom: -1,
                  right: -1,
                  borderLeft: "none",
                  borderTop: "none"
                }}
              />
              <motion.span
                layoutId="text"
                style={{
                  position: "relative",
                  willChange: "transform",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  letterSpacing: "var(--kicker-tracking-loose)",
                  textTransform: "uppercase",
                  fontVariationSettings: '"wght" 560'
                }}>
                Create new
              </motion.span>
              <motion.div
                layoutId="icon"
                style={{
                  ...iconCenter,
                  position: "relative",
                  rotate: 45,
                  willChange: "transform",
                  color: "var(--accent, var(--foreground))",
                  fontSize: "0.625rem"
                }}>
                <CloseIcon />
              </motion.div>
            </motion.button>

            <AnimatePresence mode="popLayout">
              {isOpen && (
                <motion.div
                  layoutId="wrapper"
                  key="wrapper"
                  style={expandedMenu}
                  initial={{
                    clipPath: "inset(0)"
                  }}
                  animate={{
                    clipPath: "inset(0)"
                  }}
                  exit={{
                    clipPath: "inset(0)"
                  }}
                  transition={{
                    type: "spring",
                    ...menuSpring,
                    clipPath: {
                      duration: clipPathDuration
                    }
                  }}>
                  <span
                    style={{
                      ...triggerCap,
                      top: -1,
                      left: -1,
                      borderRight: "none",
                      borderBottom: "none"
                    }}
                  />
                  <span
                    style={{
                      ...triggerCap,
                      top: -1,
                      right: -1,
                      borderLeft: "none",
                      borderBottom: "none"
                    }}
                  />
                  <span
                    style={{
                      ...triggerCap,
                      bottom: -1,
                      left: -1,
                      borderRight: "none",
                      borderTop: "none"
                    }}
                  />
                  <span
                    style={{
                      ...triggerCap,
                      bottom: -1,
                      right: -1,
                      borderLeft: "none",
                      borderTop: "none"
                    }}
                  />
                  <div style={menuHeader}>
                    <motion.span
                      layoutId="text"
                      style={{
                        willChange: "transform",
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        letterSpacing: "var(--kicker-tracking-loose)",
                        textTransform: "uppercase",
                        color: "var(--foreground-feint)",
                        fontVariationSettings: '"wght" 560'
                      }}>
                      Create new
                    </motion.span>
                    <motion.div
                      layoutId="icon"
                      key="icon"
                      onClick={() => setIsOpen(false)}
                      style={{
                        ...iconCenter,
                        cursor: "pointer",
                        padding: "0.5rem",
                        margin: "-0.5rem",
                        willChange: "transform",
                        color: "var(--foreground)",
                        fontSize: "0.625rem"
                      }}
                      initial={{ rotate: 45 }}
                      animate={{ rotate: 0 }}
                      exit={{ rotate: 45 }}>
                      <CloseIcon />
                    </motion.div>
                  </div>

                  <motion.div
                    key="grid"
                    style={buttonsGrid}
                    initial={{
                      opacity: 0,
                      y: contentOffsetY,
                      scale: contentScale
                    }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1
                    }}
                    exit={{
                      opacity: 0,
                      y: contentOffsetY,
                      scale: contentScale
                    }}
                    transition={{
                      type: "spring",
                      ...menuSpring
                    }}>
                    {MENU_ITEMS.map((item, i) => (
                      <GridItemButton
                        key={item.label}
                        item={item}
                        index={i}
                        staggerInterval={staggerInterval}
                      />
                    ))}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </MotionConfig>
    </>
  );
}

const ITEM_SPRING = { type: "spring" as const, stiffness: 500, damping: 35 };

function GridItemButton({
  item,
  index,
  staggerInterval
}: {
  item: { icon: React.FC; label: string };
  index: number;
  staggerInterval: number;
}) {
  const [hovered, setHovered] = useState(false);
  const col = index % 3;
  const row = Math.floor(index / 3);
  const dotted = "1px dotted var(--border)";

  return (
    <motion.div
      style={{
        ...gridItem,
        borderRight: col < 2 ? dotted : "none",
        borderBottom: row < 1 ? dotted : "none"
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        delay: index * staggerInterval + 0.1
      }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}>
      <motion.div
        style={gridItemHighlight}
        initial={false}
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={ITEM_SPRING}
      />
      <span style={gridItemIcon}>
        <item.icon />
      </span>
      <span style={gridItemLabel}>{item.label}</span>
    </motion.div>
  );
}

const CloseIcon = () => (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg">
    <path
      d="M10.546 1.354L1.354 10.546"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
    <path
      d="M10.546 10.546L1.354 1.354"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  </svg>
);

const FolderIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1.5rem"
    height="1.5rem"
    viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M4 20q-.825 0-1.412-.587T2 18V6q0-.825.588-1.412T4 4h5.175q.4 0 .763.15t.637.425L12 6h8q.825 0 1.413.588T22 8v10q0 .825-.587 1.413T20 20zm0-2h16V8h-8.825l-2-2H4zm0 0V6z"
    />
  </svg>
);

const NotebookIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1.5rem"
    height="1.5rem"
    viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M5 19h9v-4q0-.425.288-.712T15 14h4V5H5zm0 2q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h14q.825 0 1.413.588T21 5v9.175q0 .4-.15.763t-.425.637l-4.85 4.85q-.275.275-.637.425t-.763.15zm6-7H8q-.425 0-.712-.288T7 13t.288-.712T8 12h3q.425 0 .713.288T12 13t-.288.713T11 14m5-4H8q-.425 0-.712-.288T7 9t.288-.712T8 8h8q.425 0 .713.288T17 9t-.288.713T16 10M5 19V5z"
    />
  </svg>
);

const NotesIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1.5rem"
    height="1.5rem"
    viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M9 9v11h7v-3q0-.425.288-.712T17 16h3V9zM7 20V8.975q0-.825.6-1.4T9.025 7H20q.825 0 1.413.587T22 9v7.175q0 .4-.15.763t-.425.637l-3.85 3.85q-.275.275-.638.425t-.762.15H9q-.825 0-1.412-.587T7 20M2.025 6.25q-.15-.825.325-1.487t1.3-.813L14.5 2.025q.8-.15 1.45.338t.85 1.287l.175.775q.125.5-.15.8t-.65.35t-.712-.137T15 4.75L14.825 4L4 5.925l1.5 8.6q.075.425-.15.762t-.65.413t-.75-.162t-.4-.663z"
    />
  </svg>
);

const TrophyIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1.5rem"
    height="1.5rem"
    viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M11 19v-3.1q-1.225-.275-2.187-1.037T7.4 12.95q-1.875-.225-3.137-1.637T3 8V7q0-.825.588-1.412T5 5h2q0-.825.588-1.412T9 3h6q.825 0 1.413.588T17 5h2q.825 0 1.413.588T21 7v1q0 1.9-1.263 3.313T16.6 12.95q-.45 1.15-1.412 1.913T13 15.9V19h3q.425 0 .713.288T17 20t-.288.713T16 21H8q-.425 0-.712-.288T7 20t.288-.712T8 19zm-4-8.2V7H5v1q0 .95.55 1.713T7 10.8m5 3.2q1.25 0 2.125-.875T15 11V5H9v6q0 1.25.875 2.125T12 14m5-3.2q.9-.325 1.45-1.088T19 8V7h-2zm-5-1.3"
    />
  </svg>
);

const FlagIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1.5rem"
    height="1.5rem"
    viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M7 13v8q0 .425-.288.713T6 22t-.712-.288T5 21V4q0-.425.288-.712T6 3h13.525q.275 0 .488.125t.337.325t.162.438t-.062.487L19 8l1.45 3.625q.1.25.063.488t-.163.437t-.337.325t-.488.125zm0-2h11.05l-.9-2.25Q17 8.4 17 8t.15-.75l.9-2.25H7zm0 0V5z"
    />
  </svg>
);

const CalendarIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1.5rem"
    height="1.5rem"
    viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M5 22q-.825 0-1.412-.587T3 20V6q0-.825.588-1.412T5 4h1V3q0-.425.288-.712T7 2t.713.288T8 3v1h8V3q0-.425.288-.712T17 2t.713.288T18 3v1h1q.825 0 1.413.588T21 6v14q0 .825-.587 1.413T19 22zm0-2h14V10H5zM5 8h14V6H5zm0 0V6z"
    />
  </svg>
);

const MENU_ITEMS = [
  { icon: FolderIcon, label: "Project" },
  { icon: NotebookIcon, label: "Notebook" },
  { icon: NotesIcon, label: "Notes" },
  { icon: TrophyIcon, label: "Goal" },
  { icon: FlagIcon, label: "Milestone" },
  { icon: CalendarIcon, label: "Event" }
];

const container: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100dvh",
  fontFamily: "inherit"
};

const wrapper: React.CSSProperties = {
  position: "relative",
  fontSize: "1.5rem",
  lineHeight: "2rem"
};

const triggerButton: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
  backgroundColor: "var(--layer)",
  backgroundImage: `repeating-linear-gradient(
        var(--dossier-stripe-angle, 119deg),
        color-mix(in srgb, var(--foreground) 6%, transparent) 0,
        color-mix(in srgb, var(--foreground) 6%, transparent) 1px,
        transparent 1px,
        transparent 5px
    )`,
  color: "var(--foreground)",
  padding: "0.7rem 1.1rem",
  cursor: "pointer",
  willChange: "transform",
  border: "none",
  outline: "none",
  fontFamily: "inherit",
  fontSize: "inherit"
};

const triggerCap: React.CSSProperties = {
  position: "absolute",
  width: "10px",
  height: "10px",
  border: "1.5px solid var(--accent, var(--foreground))",
  pointerEvents: "none",
  zIndex: 1
};

const expandedMenu: React.CSSProperties = {
  position: "relative",
  backgroundColor: "var(--layer)",
  border: "1px dotted var(--border)",
  width: "min(22rem, 90vw)",
  color: "var(--foreground)",
  overflow: "hidden",
  willChange: "transform",
  boxShadow:
    "0 16px 48px color-mix(in srgb, var(--background) 70%, transparent)"
};

const menuHeader: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0.875rem 1.1rem",
  borderBottom: "1px dotted var(--border)",
  boxSizing: "border-box"
};

const iconCenter: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
};

const buttonsGrid: React.CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  overflow: "hidden",
  willChange: "transform"
};

const gridItem: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  gap: "0.55rem",
  padding: "1.1rem 0.5rem",
  backgroundColor: "var(--layer)",
  color: "var(--foreground-feint)"
};

const gridItemHighlight: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundColor:
    "var(--accent-light, color-mix(in srgb, var(--foreground) 8%, transparent))",
  pointerEvents: "none"
};

const gridItemIcon: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--foreground-feint)"
};

const gridItemLabel: React.CSSProperties = {
  position: "relative",
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  color: "var(--foreground)",
  lineHeight: 1,
  letterSpacing: "var(--kicker-tracking-tight, 0.1em)",
  textTransform: "uppercase",
  fontVariationSettings: '"wght" 540'
};

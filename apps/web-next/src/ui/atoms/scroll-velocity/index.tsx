"use client";

import { useEffect, useRef, useState } from "react";
import { ScrambleText } from "motion-plus/react";
import {
  AnimatePresence,
  motion,
  stagger,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  useVelocity,
  wrap
} from "motion/react";

/**
 * ==============   Constants   ================
 */

const PLANE_WIDTH = 320;
const PLANE_GAP = -80;
const TOTAL_PLANES = 26;

const images = Array.from(
  { length: 16 },
  (_, i) => `/photos/heritage/doge-404-${i}.jpg`
);

const labels = [
  "Wow",
  "Many Duplicate",
  "Very Clone",
  "Such Recursion",
  "Amaze",
  "Wow",
  "Many Duplicate",
  "Very Clone",
  "Such Recursion",
  "Amaze",
  "Wow",
  "Many Duplicate",
  "Very Clone",
  "Such Recursion",
  "Amaze",
  "Wow"
] as const;

const scrambleChars = "!@#$%^&*()_+-=[]{}|;:,.<>?/~`░▒▓█▀▄■□▪▫●○◆◇◈◊※†‡";

/**
 * ==============   Components   ================
 */

function Plane({
  index,
  scrollX,
  scrollVelocity,
  isHovered,
  onHoverStart,
  onHoverEnd
}: {
  index: number;
  scrollX: ReturnType<typeof useMotionValue<number>>;
  scrollVelocity: ReturnType<typeof useVelocity>;
  isHovered: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  const hoverOffset = useSpring(0, { stiffness: 400, damping: 25 });
  const planeWidth = PLANE_WIDTH + PLANE_GAP;
  const totalWidth = planeWidth * TOTAL_PLANES;
  const startPosition = index * planeWidth;

  const waveOffset = useSpring(0, { stiffness: 300, damping: 20, mass: 0.3 });

  useMotionValueEvent(scrollVelocity, "change", velocity => {
    const scroll = scrollX.get();
    const pos = startPosition + scroll;
    const centered = wrap(-totalWidth / 2, totalWidth / 2, pos);

    const normalizedPos = centered / (totalWidth / 2);
    const wavePhase = Math.sin(normalizedPos * Math.PI * 2);
    const waveAmount = (velocity / 50) * wavePhase * 5;

    waveOffset.set(waveAmount);
  });

  useEffect(() => {
    hoverOffset.set(isHovered ? -30 : 0);
  }, [isHovered, hoverOffset]);

  const transform = useTransform(() => {
    const scroll = scrollX.get();
    const wave = waveOffset.get();
    const hover = hoverOffset.get();

    const pos = startPosition + scroll;
    const centered = wrap(-totalWidth / 2, totalWidth / 2, pos);

    const yOffset = centered * -0.35 + wave + hover;
    const zOffset = centered * -1.2;

    return `translate3d(${centered}px, ${yOffset}px, ${zOffset}px) rotateY(-50deg)`;
  });

  const labelText = labels[index % labels.length];

  return (
    <motion.div
      className="absolute flex w-80 items-center justify-center text-5xl font-bold text-[oklch(97.015%_0.00011_271.152)] [box-shadow:0_25px_50px_-12px_rgba(0,0,0,0.25)] [transition:filter_0.2s_ease] transform-3d"
      style={{
        transform,
        zIndex: isHovered ? 100 : 1,
        filter: isHovered ? "brightness(1.15)" : "brightness(1)"
      }}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}>
      <div className="absolute inset-0">
        <img
          src={images[index % images.length]}
          alt={`Plane ${index}`}
          className="h-180 w-120 object-cover"
          draggable={false}
        />
      </div>

      <div className="font-geist-mono absolute -top-6 left-0 text-[0.625rem] font-normal tracking-wider text-[oklch(97.015%_0.00011_271.152)]">
        {String(index).padStart(2, "0")}
      </div>
      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="pointer-events-none absolute top-1/2 left-full ml-3 flex items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}>
            <motion.div
              className="label-line h-px w-30 origin-left bg-[oklch(97.015%_0.00011_271.152)]"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              exit={{ scaleX: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
            <div className="font-geist-mono p-[4px_8px] text-[0.625rem] font-normal tracking-wider whitespace-nowrap text-[oklch(97.015%_0.00011_271.152)] uppercase">
              {labelText && (
                <ScrambleText
                  active={isHovered}
                  duration={stagger(0.05)}
                  chars={scrambleChars}
                  children={labelText}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function ScrollVelocityLinkedOffset() {
  const rawScrollX = useMotionValue(0);
  const scrollX = useSpring(rawScrollX, {
    stiffness: 100,
    damping: 30,
    mass: 0.5
  });
  const scrollVelocity = useVelocity(scrollX);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      rawScrollX.set(rawScrollX.get() - delta);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [rawScrollX]);

  return (
    <motion.div
      ref={containerRef}
      className="font-geist-sans h-screen w-screen touch-none overflow-hidden bg-black"
      onPan={(_, info) => {
        rawScrollX.set(rawScrollX.get() + info.delta.x * 2.5);
      }}>
      <div className="absolute top-[max(90px,3vw)] left-[3vw] z-50 font-semibold tracking-[-0.02em]">
        <div className="ml-[1vw] text-[clamp(32px,5vw,64px)] leading-[0.9] font-normal tracking-[-0.02em] text-[oklch(97.015%_0.00011_271.152)]">
          CLAUDTONOMOUS REPUBLIC
        </div>
        <div className="ml-0 text-[clamp(32px,5vw,64px)] leading-[0.9] font-normal tracking-[-0.02em] text-[oklch(97.015%_0.00011_271.152)]">
          IN DOGE WE TRUST
          <sup className="relative top-[0.65em] ml-1 align-top text-[clamp(10px,0.4em,0.4em)] leading-0 font-semibold tracking-[normal] [font-variant-numeric:tabular-nums]">
            ({images.length})
          </sup>
        </div>
      </div>

      <div className="font-geist-mono absolute right-[3vw] bottom-[3vw] z-50 flex items-center text-[0.625rem] tracking-wider text-[oklch(97.015%_0.00011_271.152)] uppercase">
        scroll to surf
      </div>

      <motion.div className="relative flex size-full items-center justify-center perspective-[2000px] perspective-origin-[10%_10%]">
        <div className="relative flex transform-[translateY(100px)] items-center justify-center transform-3d">
          {Array.from({ length: TOTAL_PLANES }, (_, i) => (
            <Plane
              key={i}
              index={i}
              scrollX={scrollX}
              scrollVelocity={scrollVelocity}
              isHovered={hoveredIndex === i}
              onHoverStart={() => setHoveredIndex(i)}
              onHoverEnd={() => setHoveredIndex(null)}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

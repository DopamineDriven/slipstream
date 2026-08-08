"use client";

import { useEffect, useState } from "react";
import { Cursor, useCursorState } from "motion-plus/react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion
} from "motion/react";

export function CursorDot() {
  const reduce = useReducedMotion();
  const [finePointer, setFinePointer] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    // eslint-disable-next-line
    setFinePointer(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setFinePointer(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (reduce || !finePointer) return null;

  return <MagneticReticule />;
}

function MagneticReticule() {
  const state = useCursorState();
  const rotate = useMotionValue(0);

  useEffect(() => {
    if (!state.targetBoundingBox) {
      // No target: idle with a slow, continuous rotation.
      animate(rotate, [rotate.get(), rotate.get() + 360], {
        duration: 6,
        ease: "linear",
        repeat: Infinity
      });
    } else {
      // Locked on: settle to the nearest square angle with a soft spring.
      animate(rotate, Math.round(rotate.get() / 180) * 180, {
        type: "spring",
        bounce: 0.3
      });
    }
  }, [state.targetBoundingBox, rotate]);

  return (
    <>
      <Cursor
        magnetic={{ morph: false, snap: 0 }}
        spring={{ stiffness: 900, damping: 60 }}
        className="bg-accent"
        style={{
          width: 5,
          height: 5,
          borderRadius: 999
        }}
      />
      <Cursor
        magnetic={{ snap: 0.9, padding: 8 }}
        variants={{
          pressed: { scale: state.targetBoundingBox ? 0.9 : 0.7 }
        }}
        className="bg-transparent"
        style={{
          rotate,
          width: 36,
          height: 36,
          borderRadius: 0,
          backgroundColor: "transparent"
        }}>
        <>
          <Corner key="tl" top={0} left={0} />
          <Corner key="tr" top={0} right={0} />
          <Corner key="bl" bottom={0} left={0} />
          <Corner key="br" bottom={0} right={0} />
        </>
      </Cursor>
    </>
  );
}

function Corner({
  thickness = 1.5,
  length = 9,
  ...position
}: {
  thickness?: number;
  length?: number;
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}) {
  return (
    <>
      <motion.div
        layout
        className="bg-accent absolute"
        style={{ width: thickness, height: length, ...position }}
      />
      <motion.div
        layout
        className="bg-accent absolute"
        style={{ width: length, height: thickness, ...position }}
      />
    </>
  );
}

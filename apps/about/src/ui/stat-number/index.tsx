"use client";

import { useEffect, useRef, useState } from "react";
import { AnimateNumber } from "motion-plus/react";
import { useInView, useReducedMotion } from "motion/react";

export function StatNumber({
  value,
  className,
  delay = 0
}: {
  value: number;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);

  useEffect(() => {
    if (!inView || reduce) return;
    const t = setTimeout(() => setDisplay(value), delay * 1000);
    return () => clearTimeout(t);
  }, [inView, reduce, value, delay]);

  return (
    <span ref={ref} className="inline-block">
      <AnimateNumber
        className={className ? `tabular-nums ${className}` : "tabular-nums"}
        trend={1}
        locales="en-US"
        format={{ useGrouping: true, maximumFractionDigits: 0 }}
        transition={{
          y: { type: "spring", duration: 1.1, bounce: 0.25 },
          width: { type: "spring", duration: 0.9, bounce: 0 },
          opacity: { duration: 0.4 }
        }}>
        {display}
      </AnimateNumber>
    </span>
  );
}

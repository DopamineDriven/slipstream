// useFallingEdgeTimer.ts
import { useEffect, useRef, useState } from "react";

/**
 * Returns `true` for `ms` milliseconds only when `flag` transitions true -> false.
 * Cancels the window if `flag` becomes true again.
 */
export function useFallingEdgeTimer(flag=false, ms = 3000) {
  const [active, setActive] = useState(false);
  const prevRef = useRef(flag);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevRef.current;

    // falling edge: true -> false
    if (prev && !flag) {
      // start/restart the grace window
      // eslint-disable-next-line
      setActive(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setActive(false);
        timeoutRef.current = null;
      }, ms);
    }

    // if streaming resumes during the window, cancel it
    if (flag && active) {
      setActive(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    prevRef.current = flag;
    // eslint-disable-next-line
  }, [flag]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return active;
}

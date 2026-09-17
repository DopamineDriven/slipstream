import type { STTTypes } from "@slipstream/types";

export function accelerateThenGlide(progress: number) {
  const handoff = 0.44;
  // Match velocity at the handoff: cubic acceleration gives way to a quartic glide.
  const distanceAtHandoff = (4 * handoff) / (3 + handoff);
  if (progress < handoff) return distanceAtHandoff * (progress / handoff) ** 3;
  return 1 - (1 - distanceAtHandoff) * ((1 - progress) / (1 - handoff)) ** 4;
}

export function arToWidthAndHeight({
  flagAspectRatio: a,
  alpha2
}: STTTypes.Web.LanguageOption) {
  const [w, h] = a.split("/");
  if (w && h) {
    // only Togo and Nepal have aspect ratios containing a decimal for w
    if (alpha2 === "TG" || alpha2 === "NP") {
      return {
        w: Number.parseFloat(w),
        h: Number.parseInt(h, 10)
      };
    } else {
      return {
        w: Number.parseInt(w, 10),
        h: Number.parseInt(h, 10)
      };
    }
  } else {
    return {
      w: 3,
      h: 2
    };
  }
}

export function formatElapsed(elapsedMs: number, TIMER_DECIMALS = 1) {
  const scale = 10 ** TIMER_DECIMALS;
  // Truncate rather than round so 59.96s renders as 59.9, never 60.0.
  const totalSeconds =
    Math.floor((Math.max(0, elapsedMs) / 1000) * scale) / scale;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(TIMER_DECIMALS).padStart(3 + TIMER_DECIMALS, "0")}`;
}

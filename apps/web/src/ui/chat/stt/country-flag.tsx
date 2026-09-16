import Image from "next/image";
import { cn } from "@/lib/utils";
import type { STTTypes } from "@slipstream/types";

function arToWidthAndHeight({
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

export function CountryFlag({
  language,
  width = 28
}: {
  language: STTTypes.Web.LanguageOption;
  width?: number;
}) {
  const { w, h } = arToWidthAndHeight(language);
  const height = (width / w) * h;

  return (
    <Image
      src={language.flag}
      alt={""}
      aria-hidden="true"
      width={width}
      height={height}
      draggable={false}
      placeholder="blur"
      decoding="async"
      className={cn(
        "pointer-events-none block shrink-0 object-contain",
        language?.aspectClassName
      )}
      style={{ aspectRatio: language.flagAspectRatio }}
    />
  );
}

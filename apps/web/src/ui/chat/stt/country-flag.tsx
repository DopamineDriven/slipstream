import { cn } from "@/lib/utils";
import { arToWidthAndHeight } from "@/ui/chat/stt/utils";
import type { STTTypes } from "@slipstream/types";

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
    <img
      src={language.flag}
      alt={""}
      aria-hidden="true"
      width={width}
      height={height}
      draggable={false}
      decoding="async"
      className={cn(
        "pointer-events-none block shrink-0 object-contain",
        language?.aspectClassName
      )}
      style={{ aspectRatio: language.flagAspectRatio }}
    />
  );
}

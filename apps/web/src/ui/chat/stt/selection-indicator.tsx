import { cn } from "@/lib/utils";
import { Check } from "@slipstream/ui";

export function SelectionIndicator({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "text-primary-foreground flex size-4.5 shrink-0 items-center justify-center rounded-full border",
        selected
          ? "border-primary bg-primary"
          : "border-[color-mix(in_srgb,var(--color-foreground)_18%,transparent)]"
      )}>
      {selected && <Check className="size-3" />}
    </span>
  );
}

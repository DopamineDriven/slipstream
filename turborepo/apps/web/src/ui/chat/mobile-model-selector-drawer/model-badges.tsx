"use client";

import type { GetDisplayNamesForProviderRT, Provider } from "@slipstream/types";
import { Badge, Check } from "@slipstream/ui";

type ModelBadgesProps<T extends Provider> = GetDisplayNamesForProviderRT<T>;

export function ModelUI<const T extends Provider>({
  provider,
  model,
  isSelected
}: {
  provider: T;
  model: ModelBadgesProps<typeof provider>;
  isSelected: boolean;
}) {
  const _x = provider;
  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-medium">{model}</span>
        {model.includes("Preview") && (
          <Badge variant="secondary" className="h-5 px-1.5 py-0.5 text-xs">
            Preview
          </Badge>
        )}
        {model.includes("Mini") && (
          <Badge variant="outline" className="h-5 px-1.5 py-0.5 text-xs">
            Compact
          </Badge>
        )}
        {model.includes("Vision") && (
          <Badge variant="outline" className="h-5 px-1.5 py-0.5 text-xs">
            Vision
          </Badge>
        )}
      </div>
      {isSelected && (
        <Check className="text-brand-primary-foreground ml-3 h-5 w-5 flex-shrink-0" />
      )}
    </div>
  );
}

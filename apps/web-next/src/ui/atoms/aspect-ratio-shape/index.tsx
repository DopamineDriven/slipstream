import { parseAndScaleRatio } from "@/lib/scale-ratio";
import { cn } from "@/lib/utils";

const SHAPE_CONTAINER_SIZE = { sm: 16, md: 20, lg: 24 };
export interface AspectRatioShapeProps {
  ratio: {
    value: string;
    label: string;
    pixelSize?: string;
  };
  isSelected?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function AspectRatioShape({
  ratio,
  isSelected,
  className,
  size = "sm"
}: AspectRatioShapeProps) {
  const { w, h } = parseAndScaleRatio(ratio.value);
  const containerSize = SHAPE_CONTAINER_SIZE[size];
  const aspectRatio = w / h;

  let shapeW: number;
  let shapeH: number;

  if (aspectRatio >= 1) {
    shapeW = containerSize;
    shapeH = containerSize / aspectRatio;
  } else {
    shapeH = containerSize;
    shapeW = containerSize * aspectRatio;
  }

  const offsetX = (containerSize - shapeW) / 2;
  const offsetY = (containerSize - shapeH) / 2;

  return (
    <svg
      viewBox={`0 0 ${containerSize} ${containerSize}`}
      width={containerSize}
      height={containerSize}
      className={cn("shrink-0", className)}
      aria-hidden="true">
      <rect
        x={offsetX}
        y={offsetY}
        width={shapeW}
        height={shapeH}
        rx={Math.min(shapeW, shapeH) * 0.12}
        className={cn(
          "transition-colors",
          isSelected ? "fill-foreground" : "fill-muted-foreground/50"
        )}
      />
    </svg>
  );
}

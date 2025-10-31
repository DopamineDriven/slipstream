"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import CardStack from "@/ui/atoms/stack/generated";
import { Button } from "@slipstream/ui";
import { ImageGenerationCanvas } from "@/ui/chat/image-gen/image-generation-canvas";

export type ImageGenSeriesItem = {
  cdnUrl: string;
  width: number;
  height: number;
  mime: string;
  isPartial?: boolean;
  index?: number;
  timestamp?: number; // optional, if server provides
  generationGroupId?: string;
  seriesId?: string;
  revisedPrompt?: string | null;
};

export type ImageGenSeries = {
  seriesId: string;
  items: ImageGenSeriesItem[]; // expected to include partials + one final
  jobId?: string;
  jobIndex?: number;
  generationGroupId?: string;
  revisedPrompt?: string | null;
};

interface ImageGenSeriesStackProps {
  seriesList: ImageGenSeries[];
  className?: string;
}

export function ImageGenSeriesStack({ seriesList, className }: ImageGenSeriesStackProps) {
  const [mode, setMode] = useState<"stack" | "replay">(
    seriesList.length > 1 ? "stack" : "replay"
  );
  const [activeSeries, setActiveSeries] = useState(0);

  const cards = useMemo(() => {
    // Use the final of each series as a stack card
    return seriesList
      .map(s => {
        const final = [...s.items]
          .sort((a, b) => (a?.isPartial ? 1 : 0) - (b?.isPartial ? 1 : 0))
          .find(i => !i.isPartial);
        if (!final) return null;
        return { src: final.cdnUrl, ratio: final.width / Math.max(1, final.height) };
      })
      .filter(Boolean) as { src: string; ratio: number }[];
  }, [seriesList]);

  const onSelectSeries = useCallback((idx: number) => {
    setActiveSeries(idx);
  }, []);

  return (
    <div className={cn("w-full", className)}>
      {seriesList.length > 1 && (
        <div className="mb-2 flex items-center justify-between">
          <div className="bg-muted/50 inline-flex rounded-md p-1">
            <Button
              size="sm"
              variant={mode === "stack" ? "default" : "ghost"}
              onClick={() => setMode("stack")}
            >
              Stack
            </Button>
            <Button
              size="sm"
              variant={mode === "replay" ? "default" : "ghost"}
              onClick={() => setMode("replay")}
            >
              Replay
            </Button>
          </div>
          {mode === "replay" && (
            <div className="flex items-center gap-2">
              {seriesList.map((_, i) => (
                <Button
                  key={i}
                  size="xs"
                  variant={activeSeries === i ? "default" : "secondary"}
                  onClick={() => onSelectSeries(i)}
                >
                  Series {i + 1}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "stack" ? (
        <div className="mx-auto flex justify-center">
          <CardStack images={cards} />
        </div>
      ) : (
        <ReplayPlayer series={seriesList[Math.min(activeSeries, seriesList.length - 1)]} />
      )}
    </div>
  );
}

function ReplayPlayer({ series }: { series: ImageGenSeries }) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 2 | 3 | 5>(2);
  const [step, setStep] = useState(0);
  const timerRef = useRef<number | null>(null);

  const ordered = useMemo(
    () => [...series.items].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)),
    [series.items]
  );

  const current = ordered[Math.min(step, ordered.length - 1)];
  const isFinal = current && !current.isPartial && step >= ordered.length - 1;

  useEffect(() => {
    if (!isPlaying) return;
    if (ordered.length === 0) return;
    const base = 800; // ms per frame at 1x
    const interval = base / speed;
    timerRef.current = window.setInterval(() => {
      setStep(s => (s + 1) % Math.max(1, ordered.length));
    }, interval) as unknown as number;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [isPlaying, ordered.length, speed]);

  return (
    <div className="relative">
      <div className="mb-2 flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setIsPlaying(p => !p)}>
          {isPlaying ? "Pause" : "Play"}
        </Button>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 5].map(s => (
            <Button
              key={s}
              size="xs"
              variant={speed === (s as 1 | 2 | 3 | 5) ? "default" : "secondary"}
              onClick={() => setSpeed(s as 1 | 2 | 3 | 5)}>
              {s}x
            </Button>
          ))}
        </div>
      </div>
      {current ? (
        <ImageGenerationCanvas
          isGenerating={!isFinal}
          cdnUrl={isFinal ? current.cdnUrl : null}
          cdnUrlPartial={!isFinal ? current.cdnUrl : null}
          width={current.width}
          height={current.height}
          mime={current.mime}
          prompt={series.revisedPrompt ?? ""}
        />
      ) : (
        <div className="bg-muted/50 aspect-square w-full max-w-3xl rounded-md" />
      )}
    </div>
  );
}


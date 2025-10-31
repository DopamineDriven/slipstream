"use client";

import type { ImageGenProps } from "@/ui/chat/image-gen/types";
import { useMemo, useState } from "react";
import { ImageGenerationCanvas } from "@/ui/chat/image-gen/image-generation-canvas";
import { Button, ImageGen } from "@slipstream/ui";



export function ImgGenComponent({
  realtimeStreamingData
}: {
  realtimeStreamingData: ImageGenProps;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [partialImage, setPartialImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");

  const aiMessage = realtimeStreamingData.messages?.find(
    msg => msg.senderType === "AI"
  );
  const attachments = aiMessage?.attachments ?? [];

  // Sort by seriesIndex to ensure correct order
  const sortedAttachments = [...attachments].sort(
    (a, b) => a.imageGenOutput.seriesIndex - b.imageGenOutput.seriesIndex
  );

  // Separate partial and final images with dimensions/mime
  const partials = useMemo(
    () =>
      sortedAttachments
        .filter(att => att.imageGenOutput.isPartial)
        .map(att => ({
          cdnUrl: att.cdnUrl,
          width: att.imageGenOutput.width,
          height: att.imageGenOutput.height,
          mime: att.mime
        })),
    [sortedAttachments]
  );

  const final = useMemo(
    () =>
      sortedAttachments
        .find(att => !att.imageGenOutput.isPartial),
    [sortedAttachments]
  );

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setGeneratedImage(null);
    setPartialImage(null);

    for (let i = 0; i < partials.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setPartialImage(partials[i]?.cdnUrl ?? null);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    setGeneratedImage(final?.cdnUrl ?? null);
    setPartialImage(null);
    setIsGenerating(false);
  };

  const realPrompt =
    realtimeStreamingData.messages.find(msg => msg.senderType === "USER")
      ?.content ?? "";

  return (
    <section className="bg-background flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-6xl space-y-8">
        <div className="space-y-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-balance">
            AI Image Generation
          </h1>
          <p className="text-muted-foreground text-lg">
            Experience smooth ripple animations with real OpenAI streaming data
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleGenerate()}
              placeholder={realPrompt}
              className="border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring flex-1 rounded-lg border px-4 py-3 focus:ring-2 focus:outline-none"
              disabled={isGenerating}
            />
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              size="lg"
              className="gap-2">
              <ImageGen className="h-4 w-4" />
              Generate
            </Button>
          </div>

          <ImageGenerationCanvas
            isGenerating={isGenerating}
            cdnUrl={generatedImage}
            cdnUrlPartial={partialImage}
            width={final?.imageGenOutput.width ?? partials.at(-1)?.width ?? 1024}
            height={final?.imageGenOutput.height ?? partials.at(-1)?.height ?? 1024}
            mime={final?.mime ?? partials.at(-1)?.mime ?? "image/png"}
            prompt={prompt || realPrompt}
          />
        </div>

        <div className="text-muted-foreground space-y-2 border-t pt-6 text-center text-sm">
          <p className="font-medium">
            Using real OpenAI gpt-image-1 streaming data
          </p>
          <p>4 partial images + 1 final image from actual API response</p>
          <p className="text-xs">
            Model: {aiMessage?.model} • Provider: {aiMessage?.provider}
          </p>
        </div>
      </div>
    </section>
  );
}

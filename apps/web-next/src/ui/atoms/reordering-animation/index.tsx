"use client";

import type { Transition } from "motion/react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { providerMetadata } from "@/lib/models";
import motion from "motion/react-client";
import type { Provider } from "@slipstream/types";
import {
  AnthropicIcon,
  CohereIconCurrentColor,
  DeepSeek,
  GeminiIcon,
  Kimi,
  MetaIcon,
  MinimaxIcon,
  MistralIcon,
  OpenAiIcon,
  QwenIcon,
  VercelIcon as v0Icon,
  XAiIcon,
  Zai
} from "@slipstream/ui";

const PROVIDERS = [
  {
    id: "anthropic",
    label: "Anthropic",
    colorVar: "var(--hue-1)",
    Icon: AnthropicIcon
  },
  { id: "gemini", label: "Gemini", colorVar: "var(--hue-2)", Icon: GeminiIcon },
  { id: "openai", label: "OpenAI", colorVar: "var(--hue-3)", Icon: OpenAiIcon },
  { id: "grok", label: "Grok", colorVar: "var(--hue-4)", Icon: XAiIcon },
  { id: "vercel", label: "Vercel", colorVar: "#000000", Icon: v0Icon },
  { id: "mistral", label: "Mistral", colorVar: "#FF7000", Icon: MistralIcon },
  {
    id: "cohere",
    label: "Cohere",
    colorVar: "#FF7759",
    Icon: CohereIconCurrentColor
  },
  { id: "deepseek", label: "DeepSeek", colorVar: "#4D6BFE", Icon: DeepSeek },
  { id: "moonshotai", label: "Moonshot AI", colorVar: "#4645F5", Icon: Kimi },
  { id: "zai", label: "Z.ai", colorVar: "#3B5CFF", Icon: Zai },
  {
    id: "meta",
    label: "Meta",
    colorVar: providerMetadata.meta.color,
    Icon: MetaIcon
  },
  {
    id: "minimax",
    label: "MiniMax",
    colorVar: providerMetadata.minimax.color,
    Icon: MinimaxIcon
  },
  {
    id: "alibaba",
    label: "Alibaba",
    colorVar: providerMetadata.alibaba.color,
    Icon: QwenIcon
  }
] as const;

const initialOrder = [
  "anthropic",
  "cohere",
  "gemini",
  "openai",
  "grok",
  "mistral",
  "meta",
  "vercel",
  "deepseek",
  "moonshotai",
  "zai",
  "alibaba",
  "minimax"
] satisfies Provider[];

export function Reordering() {
  const [order, setOrder] = useState<Provider[]>(initialOrder);

  // auto-shuffle every second (same behavior as original)
  useEffect(() => {
    const timeout = setTimeout(() => setOrder(shuffle(order)), 1000);
    return () => clearTimeout(timeout);
  }, [order]);

  const providerMap = useMemo(() => {
    const map = {
      anthropic: PROVIDERS[0],
      gemini: PROVIDERS[1],
      openai: PROVIDERS[2],
      grok: PROVIDERS[3],
      vercel: PROVIDERS[4],
      meta: PROVIDERS[7],
      mistral: PROVIDERS[5],
      cohere: PROVIDERS[6],
      deepseek: PROVIDERS[7],
      moonshotai: PROVIDERS[8],
      zai: PROVIDERS[9],
      alibaba: PROVIDERS[10],
      minimax: PROVIDERS[11]
    };
    return map;
  }, []);

  return (
    <ul style={container} aria-label="AI Providers (auto-reordering)">
      {order.map(id => {
        const { Icon, label, colorVar } = providerMap[id];
        return (
          <motion.li
            key={id}
            layout
            transition={spring}
            style={{
              ...item,
              // card appearance
              backgroundColor: "var(--layer)",
              border: "1px solid var(--border)",
              color: colorVar // drives icon color via currentColor
            }}
            aria-label={label}
            title={label}>
            <Icon width={56} height={56} />
          </motion.li>
        );
      })}
    </ul>
  );
}

/**
 * ==============   Utils   ================
 */
function shuffle([...array]: Provider[]) {
  return array.sort(() => Math.random() - 0.5);
}

/**
 * ==============   Styles   ================
 */

const spring = {
  type: "spring",
  damping: 20,
  stiffness: 300
} satisfies Transition;

const container = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  position: "relative",
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  width: 300,
  flexDirection: "row",
  justifyContent: "center",
  alignItems: "center"
} satisfies React.CSSProperties;

const item = {
  width: 100,
  height: 100,
  borderRadius: "10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
} satisfies React.CSSProperties;

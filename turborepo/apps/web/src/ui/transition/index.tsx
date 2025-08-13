"use client"

import type React from "react"

import type { Transition } from "motion/react"
import * as motion from "motion/react-client"
import { useEffect, useMemo, useState } from "react"
import { AnthropicIcon, GeminiIcon, OpenAiIcon, XAiIcon } from "@/ui/icons"
import { Provider } from "@t3-chat-clone/types"
const PROVIDERS = [
  { id: "anthropic", label: "Anthropic", colorVar: "var(--hue-1)", Icon: AnthropicIcon },
  { id: "gemini", label: "Gemini", colorVar: "var(--hue-2)", Icon: GeminiIcon },
  { id: "openai", label: "OpenAI", colorVar: "var(--hue-3)", Icon: OpenAiIcon },
  { id: "grok", label: "grok", colorVar: "var(--hue-4)", Icon: XAiIcon },
] as const

const initialOrder: Provider[] = ["anthropic", "gemini", "openai", "grok"]

export  function Reordering() {
  const [order, setOrder] = useState<Provider[]>(initialOrder)

  // auto-shuffle every second (same behavior as original)
  useEffect(() => {
    const timeout = setTimeout(() => setOrder(shuffle(order)), 1000)
    return () => clearTimeout(timeout)
  }, [order])

  const providerMap = useMemo(() => {
    const map = {
      anthropic: PROVIDERS[0],
      gemini: PROVIDERS[1],
      openai: PROVIDERS[2],
      grok: PROVIDERS[3],
    }
    return map
  }, [])

  return (
    <ul style={container} aria-label="AI Providers (auto-reordering)">
      {order.map((id) => {
        const { Icon, label, colorVar } = providerMap[id]
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
              color: colorVar, // drives icon color via currentColor
            }}
            aria-label={label}
            title={label}
          >
            <Icon width={56} height={56} />
          </motion.li>
        )
      })}
    </ul>
  )
}

/**
 * ==============   Utils   ================
 */
function shuffle([...array]: Provider[]) {
  return array.sort(() => Math.random() - 0.5)
}

/**
 * ==============   Styles   ================
 */

const spring: Transition = {
  type: "spring",
  damping: 20,
  stiffness: 300,
}

const container: React.CSSProperties = {
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
  alignItems: "center",
}

const item: React.CSSProperties = {
  width: 100,
  height: 100,
  borderRadius: "10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}

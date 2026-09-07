"use client";

/**
 * `AudioGenProvider` — global lyria targeting signal + per-turn stream
 * milestones. `isAudioGenEnabled` is a pure DERIVATION of the selected model
 * (never stored), so it can't drift from the selection: it flips on
 * `handleModelSelect`, and auto-follows the `ai_chat_error` →
 * `defaultModelSelection` reset inside ModelSelectionProvider. There is
 * deliberately no setter for it — lyria targeting IS the intent (no user
 * toggle, unlike imgGen's opt-in for OpenAI facilitator models).
 *
 * `hasLyrics`/`hasAudio` are per-turn audioGen milestones: both reset on send
 * (use-send-chat), `hasLyrics` flips when the streaming AUDIO_GEN bubble first
 * carries content (lyria delivers the full lyric sheet as one TextDelta well
 * before the AudioDelta finishes), `hasAudio` when the audioGenFields envelope
 * lands with a cdnUrl. The window between the two gates the "sit tight, audio
 * compiling…" state of the AudioPlayer. Set from ChatInterface effects (it is
 * already per-token subscribed to the chat context) so message bubbles never
 * subscribe here — the committed-bubble memo perf invariant holds.
 *
 * Sits inside ModelSelectionProvider (its data source) and above AssetProvider
 * so the asset lane and everything downstream (ImageGen/TTS/AIChat) can
 * consume it — see (chat)/layout.tsx.
 */
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, useContext, useMemo, useState } from "react";
import { useModelSelection } from "@/context/model-selection-context";
import { isAudioGenModel } from "@/lib/helpers";

interface AudioGenContextValue {
  isAudioGenEnabled: boolean;
  hasLyrics: boolean;
  setHasLyrics: Dispatch<SetStateAction<boolean>>;
  hasAudio: boolean;
  setHasAudio: Dispatch<SetStateAction<boolean>>;
}

const AudioGenContext = createContext<AudioGenContextValue | undefined>(
  undefined
);

export function AudioGenProvider({ children }: { children: ReactNode }) {
  const { selectedModel } = useModelSelection();

  const [hasLyrics, setHasLyrics] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);

  const value = useMemo(
    () => ({
      isAudioGenEnabled: isAudioGenModel(selectedModel.modelId),
      hasLyrics,
      setHasLyrics,
      hasAudio,
      setHasAudio
    }),
    [selectedModel.modelId, hasLyrics, hasAudio]
  );

  return (
    <AudioGenContext.Provider value={value}>
      {children}
    </AudioGenContext.Provider>
  );
}

export function useAudioGenCtx() {
  const ctx = useContext(AudioGenContext);
  if (!ctx) {
    throw new Error("useAudioGenCtx must be used within AudioGenProvider");
  }
  return ctx;
}

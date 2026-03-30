"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import { isValidCodec, isValidLanguage, isValidVoice } from "@/lib/tts-helpers";
import type {
  EventTypeMap,
  GrokAudioCodecTTS,
  GrokLanguageTTS,
  GrokVoiceTTS,
  TTSCodec
} from "@slipstream/types";

// ---------------------------------------------------------------------------
// Module-scope helpers
// ---------------------------------------------------------------------------

function codecToMime(codec: string) {
  if (codec === "mp3") return "audio/mpeg";
  if (codec === "wav") return "audio/wav";
  if (codec === "pcm") return "audio/pcm";
  if (codec === "opus") return "audio/opus";
  if (codec === "aac") return "audio/aac";
  if (codec === "flac") return "audio/flac";
  if (codec === "mulaw" || codec === "alaw") return "audio/basic";
  return "audio/mpeg";
}

function base64ChunksToBlobUrl(chunks: string[], mimeType: string) {
  const binaryArrays = chunks.map(chunk => {
    const binary = atob(chunk);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  });
  return URL.createObjectURL(new Blob(binaryArrays, { type: mimeType }));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TTSCacheEntry {
  cdnUrl: string;
  blobUrl: string | null;
  durationMs: number;
  codec: TTSCodec;
}

interface TTSContextValue {
  // Generation state
  isGenerating: boolean;
  activeMessageId: string | null;
  error: string | null;

  // Playback state
  isPlaying: boolean;
  currentPlaybackMessageId: string | null;

  // Preferences
  voice: GrokVoiceTTS;
  language: GrokLanguageTTS;
  codec: GrokAudioCodecTTS;

  // Actions
  requestTTS: (messageId: string, conversationId: string) => void;
  play: (messageId: string) => void;
  pause: () => void;
  stop: () => void;
  setVoice: (v: string) => void;
  setLanguage: (l: string) => void;
  setCodec: (c: string) => void;

  // Cache check
  hasCachedAudio: (messageId: string) => boolean;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TTSContext = createContext<TTSContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TTSProvider({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const { client, sendEvent } = useChatWebSocketContext();

  // -- State (renders) -------------------------------------------------------
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlaybackMessageId, setCurrentPlaybackMessageId] = useState<
    string | null
  >(null);
  const [voice, setVoiceState] = useState<GrokVoiceTTS>("eve");
  const [language, setLanguageState] = useState<GrokLanguageTTS>("auto");
  const [codec, setCodecState] = useState<GrokAudioCodecTTS>("mp3");

  // -- Refs (no renders) -----------------------------------------------------
  const audioChunksRef = useRef<string[]>([]);
  const activeTtsJobIdRef = useRef<string | null>(null);
  const activeMessageIdRef = useRef<string | null>(null);
  const isGeneratingRef = useRef(false);
  const cacheRef = useRef<Map<string, TTSCacheEntry>>(new Map());
  const audioRef = useRef<HTMLAudioElement>(null);

  // -- Ref mirroring ---------------------------------------------------------
  useEffect(() => {
    activeMessageIdRef.current = activeMessageId;
  }, [activeMessageId]);

  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // -- Internal playback helper ----------------------------------------------
  const playFromUrl = useCallback(
    (url: string | null, messageId: string) => {
      if (!url || !audioRef.current) return;
      audioRef.current.src = url;
      void audioRef.current.play();
      setCurrentPlaybackMessageId(messageId);
    },
    []
  );

  // -- WS event subscription -------------------------------------------------
  useEffect(() => {
    const handleChunk = (evt: EventTypeMap["user_tts_chunk"]) => {
      // Capture ttsJobId from first chunk
      if (
        activeTtsJobIdRef.current === null &&
        evt.messageId === activeMessageIdRef.current
      ) {
        activeTtsJobIdRef.current = evt.ttsJobId;
      }
      // Guard: stale chunk
      if (evt.ttsJobId !== activeTtsJobIdRef.current) return;
      audioChunksRef.current.push(evt.audioChunk);
    };

    const handleResponse = (evt: EventTypeMap["user_tts_response"]) => {
      if (evt.ttsJobId !== activeTtsJobIdRef.current) return;

      const blobUrl = base64ChunksToBlobUrl(
        audioChunksRef.current,
        codecToMime(evt.codec)
      );

      cacheRef.current.set(evt.messageId, {
        cdnUrl: evt.cdnUrl,
        blobUrl,
        durationMs: evt.durationMs,
        codec: evt.codec
      });

      // Reset generation state
      setIsGenerating(false);
      setActiveMessageId(null);
      setError(null);
      audioChunksRef.current = [];
      activeTtsJobIdRef.current = null;

      // Auto-play: prefer CDN, fall back to blob
      playFromUrl(evt.cdnUrl ?? blobUrl, evt.messageId);
    };

    const handleError = (evt: EventTypeMap["user_tts_error"]) => {
      // Match by ttsJobId if present, otherwise by messageId
      if (evt.ttsJobId && evt.ttsJobId !== activeTtsJobIdRef.current) return;
      if (!evt.ttsJobId && evt.messageId !== activeMessageIdRef.current) return;

      setError(`TTS Error ${evt.status}: ${evt.statusText}`);
      setIsGenerating(false);
      setActiveMessageId(null);
      audioChunksRef.current = [];
      activeTtsJobIdRef.current = null;
    };

    client.on("user_tts_chunk", handleChunk);
    client.on("user_tts_response", handleResponse);
    client.on("user_tts_error", handleError);

    return () => {
      client.off("user_tts_chunk");
      client.off("user_tts_response");
      client.off("user_tts_error");
    };
  }, [client, playFromUrl]);

  // -- Cleanup on unmount ----------------------------------------------------
  useEffect(() => {
    return () => {
      cacheRef.current.forEach(entry => {
        if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
      });
      cacheRef.current.clear();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  // -- Actions ---------------------------------------------------------------
  const play = useCallback(
    (messageId: string) => {
      const entry = cacheRef.current.get(messageId);
      if (!entry) return;
      playFromUrl(entry.cdnUrl ?? entry.blobUrl, messageId);
    },
    [playFromUrl]
  );

  const requestTTS = useCallback(
    (messageId: string, conversationId: string) => {
      // Cache hit — instant replay
      if (cacheRef.current.has(messageId)) {
        play(messageId);
        return;
      }
      // Double-request guard
      if (isGeneratingRef.current) return;

      // Set generation state
      setIsGenerating(true);
      setActiveMessageId(messageId);
      setError(null);
      audioChunksRef.current = [];
      activeTtsJobIdRef.current = null;

      sendEvent("user_tts_request", {
        type: "user_tts_request",
        conversationId,
        messageId,
        voice,
        language,
        codec
      } satisfies EventTypeMap["user_tts_request"]);
    },
    [sendEvent, voice, language, codec, play]
  );

  const pause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = "";
    }
    setCurrentPlaybackMessageId(null);
    setIsPlaying(false);
  }, []);

  const updateVoice = useCallback((v: string) => {
    if (isValidVoice(v)) setVoiceState(v);
  }, []);

  const updateLanguage = useCallback((l: string) => {
    if (isValidLanguage(l)) setLanguageState(l);
  }, []);

  const updateCodec = useCallback((c: string) => {
    if (isValidCodec(c)) setCodecState(c);
  }, []);

  const hasCachedAudio = useCallback(
    (messageId: string) => cacheRef.current.has(messageId),
    []
  );

  // -- Context value ---------------------------------------------------------
  const value = useMemo<TTSContextValue>(
    () => ({
      isGenerating,
      activeMessageId,
      error,
      isPlaying,
      currentPlaybackMessageId,
      voice,
      language,
      codec,
      requestTTS,
      play,
      pause,
      stop,
      setVoice: updateVoice,
      setLanguage: updateLanguage,
      setCodec: updateCodec,
      hasCachedAudio
    }),
    [
      isGenerating,
      activeMessageId,
      error,
      isPlaying,
      currentPlaybackMessageId,
      voice,
      language,
      codec,
      requestTTS,
      play,
      pause,
      stop,
      updateVoice,
      updateLanguage,
      updateCodec,
      hasCachedAudio
    ]
  );

  return (
    <TTSContext.Provider value={value}>
      <audio
        ref={audioRef}
        hidden
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentPlaybackMessageId(null);
        }}
      />
      {children}
    </TTSContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTTSContext() {
  const context = useContext(TTSContext);
  if (!context) {
    throw new Error("useTTSContext must be used within TTSProvider");
  }
  return context;
}

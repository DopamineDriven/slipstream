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
import { useCookiesCtx } from "@/context/cookie-context";
import { isSafariAudioSessionSupported } from "@/lib/audio-session";
import { PCMStreamPlayer } from "@/lib/pcm-stream-player";
import { pcmChunksToWavBlob } from "@/lib/pcm-to-wav";
import { isValidCodec, isValidLanguage, isValidVoice } from "@/lib/tts-helpers";
import type {
  EventTypeMap,
  GrokAudioCodecTTS,
  GrokLanguageTTS,
  GrokVoiceTTS,
  TTSCodec,
  TTSJobSingleton
} from "@slipstream/types";

interface TTSCacheEntry {
  cdnUrl: string;
  blobUrl: string | null;
  durationMs: number;
  codec: TTSCodec;
}

interface TTSContextValue {
  isGenerating: boolean;
  activeMessageId: string | null;
  error: string | null;
  isPlaying: boolean;
  currentPlaybackMessageId: string | null;

  voice: GrokVoiceTTS;
  language: GrokLanguageTTS;
  codec: GrokAudioCodecTTS;

  requestTTS: (messageId: string, conversationId: string) => void;
  play: (messageId: string) => void;
  pause: () => void;
  stop: () => void;
  setVoice: (v: string) => void;
  setLanguage: (l: string) => void;
  setCodec: (c: string) => void;

  hasCachedAudio: (messageId: string) => boolean;
  hydrateFromTtsJob: (messageId: string, ttsJob: TTSJobSingleton<true>) => void;
}

const TTSContext = createContext<TTSContextValue | undefined>(undefined);

const STREAM_SAMPLE_RATE = 24000;

export function TTSProvider({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const { client, sendEvent } = useChatWebSocketContext();
  const { get } = useCookiesCtx();

  const safariAudioSession = useMemo(
    () =>
      isSafariAudioSessionSupported(get("browserName"), get("browserVersion")),
    [get]
  );
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

  const activeTtsJobIdRef = useRef<string | null>(null);
  const activeMessageIdRef = useRef<string | null>(null);
  const isGeneratingRef = useRef(false);
  const cacheRef = useRef<Map<string, TTSCacheEntry>>(new Map());
  const audioRef = useRef<HTMLAudioElement>(null);

  // PCM streaming refs
  const playerRef = useRef<PCMStreamPlayer | null>(null);
  const rawChunksRef = useRef<Uint8Array[]>(Array.of<Uint8Array>());

  useEffect(() => {
    activeMessageIdRef.current = activeMessageId;
  }, [activeMessageId]);

  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  const playFromUrl = useCallback(
    async (url: string | null, messageId: string) => {
      if (!url || !audioRef.current) return;
      if (!URL.canParse(url)) return;
      if (safariAudioSession) {
        PCMStreamPlayer.enablePlaybackAudioSession();
      }
      audioRef.current.src = url;
      try {
        await audioRef.current.play();
        setCurrentPlaybackMessageId(messageId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Audio playback failed");
        setCurrentPlaybackMessageId(null);
        setIsPlaying(false);
      }
    },
    [safariAudioSession]
  );

  useEffect(() => {
    const handleChunk = (evt: EventTypeMap["user_tts_chunk"]) => {
      // Capture ttsJobId from first chunk
      if (
        activeTtsJobIdRef.current === null &&
        evt.messageId === activeMessageIdRef.current
      ) {
        activeTtsJobIdRef.current = evt.ttsJobId;
      }

      if (evt.ttsJobId !== activeTtsJobIdRef.current) return;

      // Decode base64 → raw bytes for WAV conversion later
      const binary = atob(evt.audioChunk);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      rawChunksRef.current.push(bytes);

      // Stream immediately via Web Audio
      playerRef.current?.pushChunk(evt.audioChunk);
    };

    const handlePreexistingResponse = (
      evt: EventTypeMap["user_tts_response_preexisting"]
    ) => {
      if (evt.messageId !== activeMessageIdRef.current) return;

      // No PCM player was needed for this path — tear down the one requestTTS created.
      void playerRef.current?.close();
      playerRef.current = null;
      rawChunksRef.current = Array.of<Uint8Array>();
      activeTtsJobIdRef.current = null;

      cacheRef.current.set(evt.messageId, {
        cdnUrl: evt.cdnUrl,
        blobUrl: null,
        durationMs: evt.durationMs,
        codec: evt.codec
      });

      setIsGenerating(false);
      setActiveMessageId(null);
      setError(null);

      void playFromUrl(evt.cdnUrl, evt.messageId);
    };

    const handleResponse = (evt: EventTypeMap["user_tts_response"]) => {
      if (evt.ttsJobId !== activeTtsJobIdRef.current) return;

      // Build WAV blob from accumulated raw PCM for cached replay
      const wavBlob = pcmChunksToWavBlob(
        rawChunksRef.current,
        STREAM_SAMPLE_RATE
      );
      const blobUrl = URL.createObjectURL(wavBlob);

      cacheRef.current.set(evt.messageId, {
        cdnUrl: evt.cdnUrl,
        blobUrl,
        durationMs: evt.durationMs,
        codec: evt.codec
      });

      setIsGenerating(false);
      setActiveMessageId(null);
      setError(null);
      rawChunksRef.current = Array.of<Uint8Array>();
      activeTtsJobIdRef.current = null;

      // Let scheduled audio finish playing, then clean up
      const player = playerRef.current;
      if (player) {
        void player.drain().then(() => {
          player.stop();
          setIsPlaying(false);
          setCurrentPlaybackMessageId(null);
        });
      } else {
        setIsPlaying(false);
        setCurrentPlaybackMessageId(null);
      }
    };

    const handleError = (evt: EventTypeMap["user_tts_error"]) => {
      if (evt.ttsJobId && evt.ttsJobId !== activeTtsJobIdRef.current) return;
      if (!evt.ttsJobId && evt.messageId !== activeMessageIdRef.current) return;

      // Stop streaming player on error
      playerRef.current?.stop();

      setError(`TTS Error ${evt.status}: ${evt.statusText}`);
      setIsGenerating(false);
      setActiveMessageId(null);
      setIsPlaying(false);
      setCurrentPlaybackMessageId(null);
      rawChunksRef.current = Array.of<Uint8Array>();
      activeTtsJobIdRef.current = null;
    };

    client.on("user_tts_chunk", handleChunk);
    client.on("user_tts_response", handleResponse);
    client.on("user_tts_error", handleError);
    client.on("user_tts_response_preexisting", handlePreexistingResponse);
    return () => {
      client.off("user_tts_chunk");
      client.off("user_tts_response");
      client.off("user_tts_error");
      client.off("user_tts_response_preexisting");
    };
  }, [client, playFromUrl]);

  // Cleanup on unmount: revoke blob URLs, close player
  useEffect(() => {
    const cache = cacheRef.current;
    const audio = audioRef.current;
    return () => {
      cache.forEach(entry => {
        if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
      });
      cache.clear();
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      void playerRef.current?.close();
    };
  }, []);

  const play = useCallback(
    (messageId: string) => {
      const entry = cacheRef.current.get(messageId);
      if (!entry) return;
      // Cached replay: prefer CDN (WAV on CloudFront, survives sessions), fall back to local blob
      playFromUrl(entry.cdnUrl ?? entry.blobUrl, messageId);
    },
    [playFromUrl]
  );

  const requestTTS = useCallback(
    (messageId: string, conversationId: string) => {
      // Cache hit → instant replay via <audio>
      if (cacheRef.current.has(messageId)) {
        play(messageId);
        return;
      }
      // Double-request guard
      if (isGeneratingRef.current) return;

      // Create PCM stream player (must be in user gesture call stack)
      playerRef.current = new PCMStreamPlayer(
        STREAM_SAMPLE_RATE,
        safariAudioSession
      );

      setIsGenerating(true);
      setActiveMessageId(messageId);
      setError(null);
      setIsPlaying(true);
      setCurrentPlaybackMessageId(messageId);
      rawChunksRef.current = Array.of<Uint8Array>();
      activeTtsJobIdRef.current = null;

      sendEvent("user_tts_request", {
        type: "user_tts_request",
        conversationId,
        messageId,
        voice,
        language,
        codec: "pcm"
      } satisfies EventTypeMap["user_tts_request"]);
    },
    [sendEvent, voice, language, play, safariAudioSession]
  );

  const pause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, []);

  const stop = useCallback(() => {
    // Stop streaming player if active
    if (playerRef.current?.isActive) {
      playerRef.current.stop();
    }
    // Stop <audio> element if playing cached replay
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = "";
    }
    setCurrentPlaybackMessageId(null);
    setIsPlaying(false);
    setIsGenerating(false);
    setActiveMessageId(null);
    rawChunksRef.current = Array.of<Uint8Array>();
    activeTtsJobIdRef.current = null;
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

  const hydrateFromTtsJob = useCallback(
    (messageId: string, ttsJob: TTSJobSingleton<true>) => {
      if (ttsJob.status !== "COUPLED") return;
      if (ttsJob.cdnUrl == null) return;
      if (ttsJob.durationMs == null) return;
      if (cacheRef.current.has(messageId)) return;

      cacheRef.current.set(messageId, {
        cdnUrl: ttsJob.cdnUrl,
        blobUrl: null,
        durationMs: ttsJob.durationMs,
        codec: isValidCodec(ttsJob.codec) ? ttsJob.codec : "wav"
      } satisfies TTSCacheEntry);
    },
    []
  );

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
      hasCachedAudio,
      hydrateFromTtsJob
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
      hasCachedAudio,
      hydrateFromTtsJob
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

export function useTTSContext() {
  const context = useContext(TTSContext);
  if (!context) {
    throw new Error("useTTSContext must be used within TTSProvider");
  }
  return context;
}

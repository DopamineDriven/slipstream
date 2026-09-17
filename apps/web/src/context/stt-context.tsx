"use client";

import type { Worklet } from "@d0paminedriven/stt-worklet/types";
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
import { usePathnameContext } from "@/context/pathname-context";
import { useLangSTT } from "@/hooks/use-stt-lang";
import {
  canParseDraftId,
  draftIdEpimerize,
  isValidLangSTT
} from "@/lib/helpers";
import { arrSTT } from "@/lib/stt-data";
import { PcmCapture, pcmToBase64 } from "@/lib/stt-pcm-capture";
import type { EventTypeMap, STTTypes } from "@slipstream/types";

export type DictationPhase =
  "idle" | "starting" | "recording" | "finishing" | "timeoutPrompt";

/** what happens to the transcript once it lands: into the draft, or straight out */
export type FinishIntent = "insert" | "send";

/** a dictation the server has settled — sourced only from S→C events */
export type SettledDictation = {
  draftId: string;
  batchId: string;
  ordinal: number;
  conversationId: string | null;
  text: string;
  reconciled: boolean;
  couplingStatus:
    | EventTypeMap["stt_user_finished"]["couplingStatus"]
    | EventTypeMap["stt_user_interrupted"]["couplingStatus"]
    | EventTypeMap["stt_user_canceled"]["couplingStatus"];
  terminationReason:
    | EventTypeMap["stt_user_finished"]["terminationReason"]
    | EventTypeMap["stt_user_interrupted"]["terminationReason"]
    | EventTypeMap["stt_user_canceled"]["terminationReason"]
    | EventTypeMap["stt_user_recovered"]["results"][number]["terminationReason"];
  /** epoch ms; only while RECOVERABLE */
  recoveryExpiresAt?: number;
  /** seconds, 2 d.p. */
  duration?: number;
  words?: STTTypes.Transcript.Words[];
};

type DraftIdentity = Pick<
  SettledDictation,
  "batchId" | "ordinal" | "conversationId"
>;

interface STTContextValue {
  // language — the drawer's value/onChange pair plus the cookie-derived default
  languages: STTTypes.Web.LanguageOption[];
  /** send-site value: a supported code, or undefined for auto-detect */
  language: STTTypes.Web.LanguageSelection;
  /** roster entry for `language`; undefined when auto-detect */
  languageOption: STTTypes.Web.LanguageOption | undefined;
  /** derived from the locale cookie; the default before any override */
  detectedLanguage: ReturnType<typeof useLangSTT>;
  setLanguage: (language: STTTypes.Web.LanguageSelection) => void;
  resetLanguage: () => void;

  // batch identity (mirrors AssetContext; ids are cuid2, minted lazily)
  activeConversationId: string | null;
  currentBatchId: string | null;
  hasDictations: boolean;
  ensureBatchId: () => Promise<string>;
  rotateBatch: () => void;
  getDictationsByBatchId: (batchId: string) => SettledDictation[];

  // lifecycle
  phase: DictationPhase;
  activeDraftId: string | null;
  /** `performance.now()` when frames started flowing; the bar derives elapsed from it */
  startedAt: number | null;
  /** last chunk's RMS (0..1), read per animation frame — never a render trigger */
  readLevel: () => number;
  timeoutClosesInMs: number | null;
  intent: FinishIntent;
  error: string | null;
  isConnected: boolean;

  // capture actions
  /** call from the user gesture — the AudioContext is created inside it */
  start: (intent?: FinishIntent) => Promise<void>;
  /** ■ / ↑ — flush, then `stt_user_finish`; the transcript lands as a pending insert */
  finish: (intent?: FinishIntent) => Promise<void>;
  /** ✕ — finishes like ■ but holds the transcript for undo instead of inserting */
  discard: () => Promise<void>;
  undoDiscard: () => void;
  pendingUndo: SettledDictation | null;

  // settled results → composer
  /** DECOUPLED transcripts in the current batch the composer hasn't consumed yet */
  pendingInserts: SettledDictation[];
  markInserted: (draftId: string) => void;

  // server-only actions
  cancel: (draftId: string) => void;
  present: () => void;
  restore: (draftId: string) => void;
  recover: (conversationId?: string | null) => void;
  clearError: () => void;
}

const STTContext = createContext<STTContextValue | undefined>(undefined);

const LANGUAGES: STTTypes.Web.LanguageOption[] = Array.from(arrSTT);

/** frames buffered while `stt_user_connect` is in flight; ~5 s at 100 ms */
const MAX_PRECONNECT_CHUNKS = 50;
/** RMS above this while the timeout prompt is up counts as "I'm here" */
const VOICE_RMS_THRESHOLD = 0.015;
/** ✕ undo window before `stt_user_cancel` goes out */
const UNDO_WINDOW_MS = 6_000;
/**
 * raw RMS → waveform level on a dB scale, so a hot USB mic (Yeti) and a
 * quiet laptop mic both land in range: -50 dBFS is a resting bar, -10 dBFS
 * a full one; speech typically sits between -35 and -15
 */
const LEVEL_FLOOR_DB = -50;
const LEVEL_CEIL_DB = -10;

/** M1 event trace (plan Step 14) — dev only */
const sttLog = (event: string, detail?: unknown) => {
  if (process.env.NODE_ENV === "production") return;
  console.log(`[stt] ${event}`, detail ?? "");
};

export function STTProvider({
  children,
  userId
}: {
  children: ReactNode;
  userId: string;
}) {
  const { conversationId: pathConvId } = usePathnameContext();
  const { client, sendEvent, isConnected } = useChatWebSocketContext();
  const detectedLanguage = useLangSTT();

  // ── conversation (passive read of PathnameContext, same as AssetContext) ──
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(pathConvId ?? "new-chat");

  useEffect(() => {
    if (pathConvId && pathConvId !== activeConversationId) {
      // eslint-disable-next-line
      setActiveConversationId(pathConvId);
    }
  }, [pathConvId, activeConversationId]);

  // ── language ──────────────────────────────────────────────────────────
  const defaultLanguage = useMemo(() => {
    const lang = detectedLanguage.lang;
    return lang && isValidLangSTT(lang) ? lang : undefined;
  }, [detectedLanguage.lang]);

  const [language, setLanguage] =
    useState<STTTypes.Web.LanguageSelection>(defaultLanguage);

  const resetLanguage = useCallback(
    () => setLanguage(defaultLanguage),
    [defaultLanguage]
  );

  const languageOption = useMemo(
    () => LANGUAGES.find(option => option.language === language),
    [language]
  );

  // ── batch identity ────────────────────────────────────────────────────
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  // ref mirrors state so two concurrent `ensureBatchId` calls mint once
  const currentBatchRef = useRef<string | null>(null);
  const batchOrdinalRef = useRef<Map<string, number>>(
    new Map<string, number>()
  );
  const cuidRef = useRef<Promise<typeof import("@paralleldrive/cuid2")> | null>(
    null
  );

  const loadCuid = useCallback(() => {
    cuidRef.current ??= import("@paralleldrive/cuid2");
    return cuidRef.current;
  }, []);

  // warm the chunk so the first dictation never waits on the import
  useEffect(() => {
    void loadCuid();
  }, [loadCuid]);

  const ensureBatchId = useCallback(async () => {
    if (currentBatchRef.current) return currentBatchRef.current;
    const { createId } = await loadCuid();
    if (currentBatchRef.current) return currentBatchRef.current;
    const batchId = createId();
    currentBatchRef.current = batchId;
    batchOrdinalRef.current.set(batchId, 0);
    setCurrentBatchId(batchId);
    return batchId;
  }, [loadCuid]);

  const nextOrdinal = useCallback((batchId: string) => {
    const n = batchOrdinalRef.current.get(batchId) ?? 0;
    batchOrdinalRef.current.set(batchId, n + 1);
    return n;
  }, []);

  // ── settled registry (draftId → what the server told us) ──────────────
  const [settled, setSettled] = useState<ReadonlyMap<string, SettledDictation>>(
    () => new Map<string, SettledDictation>()
  );
  const [insertedDraftIds, setInsertedDraftIds] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  // identity for drafts this client started; events after `start` carry
  // draftId only, so batch/ordinal/conversation are looked up here
  const draftsRef = useRef<Map<string, DraftIdentity>>(
    new Map<string, DraftIdentity>()
  );

  /** null only for a draftId this client never minted and can't parse */
  const identityOf = useCallback((draftId: string): DraftIdentity | null => {
    const known = draftsRef.current.get(draftId);
    if (known) return known;
    if (!canParseDraftId(draftId)) return null;
    const { convoId, batchId, dictationOrdinal, isNewConvo } =
      draftIdEpimerize(draftId);
    return {
      batchId,
      ordinal: dictationOrdinal,
      conversationId: isNewConvo ? null : convoId
    };
  }, []);

  const upsertSettled = useCallback((entries: SettledDictation[]) => {
    if (entries.length === 0) return;
    setSettled(prev => {
      const next = new Map(prev);
      for (const entry of entries) next.set(entry.draftId, entry);
      return next;
    });
  }, []);

  const patchSettled = useCallback(
    (draftId: string, patch: Partial<SettledDictation>) => {
      setSettled(prev => {
        const current = prev.get(draftId);
        if (!current) return prev;
        const next = new Map(prev);
        next.set(draftId, { ...current, ...patch });
        return next;
      });
    },
    []
  );

  const dropSettled = useCallback((draftId: string) => {
    setSettled(prev => {
      if (!prev.has(draftId)) return prev;
      const next = new Map(prev);
      next.delete(draftId);
      return next;
    });
  }, []);

  const markInserted = useCallback((draftId: string) => {
    setInsertedDraftIds(prev => {
      if (prev.has(draftId)) return prev;
      const next = new Set(prev);
      next.add(draftId);
      return next;
    });
  }, []);

  // ── lifecycle state ───────────────────────────────────────────────────
  const [phase, setPhase] = useState<DictationPhase>("idle");
  // refs mirror state so capture callbacks and the subscription effect never read stale values
  const phaseRef = useRef<DictationPhase>("idle");
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const activeDraftRef = useRef<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // ref, not state: the worklet posts ~10 levels/s and the waveform samples
  // per frame; routing that through React would re-render every consumer.
  // The ref holds raw RMS (the presence threshold reads it); the reader
  // maps it onto a dB window so the waveform reads 0..1 regardless of mic gain
  const levelRef = useRef(0);
  const readLevel = useCallback(() => {
    const rms = levelRef.current;
    if (rms <= 0) return 0;
    const db = 20 * Math.log10(rms);
    return Math.min(
      1,
      Math.max(0, (db - LEVEL_FLOOR_DB) / (LEVEL_CEIL_DB - LEVEL_FLOOR_DB))
    );
  }, []);
  const [timeoutClosesInMs, setTimeoutClosesInMs] = useState<number | null>(
    null
  );
  const [intent, setIntent] = useState<FinishIntent>("insert");
  const intentRef = useRef<FinishIntent>("insert");
  const [pendingUndo, setPendingUndo] = useState<SettledDictation | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const captureRef = useRef<PcmCapture | null>(null);
  const discardRef = useRef(false);
  const finishRequestedRef = useRef(false);
  const preConnectRef = useRef<Worklet.WorkletToMain.Chunk[]>([]);

  const clearError = useCallback(() => setError(null), []);

  const setPhaseSync = useCallback((next: DictationPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  /** drop the live session on this client; the row settles server-side (close or finish deadline) */
  const interruptLocal = useCallback(
    (message: string) => {
      captureRef.current?.dispose();
      captureRef.current = null;
      preConnectRef.current = [];
      finishRequestedRef.current = false;
      activeDraftRef.current = null;
      setActiveDraftId(null);
      setStartedAt(null);
      levelRef.current = 0;
      setTimeoutClosesInMs(null);
      setPhaseSync("idle");
      sttLog("interrupted locally", message);
      setError(message);
    },
    [setPhaseSync]
  );

  // ── server-only actions ───────────────────────────────────────────────
  const cancel = useCallback(
    (draftId: string) => {
      sendEvent("stt_user_cancel", { type: "stt_user_cancel", draftId });
    },
    [sendEvent]
  );

  /** "I'm here" — button or voice energy; only meaningful while a dictation is live */
  const present = useCallback(() => {
    const draftId = activeDraftRef.current;
    if (!draftId || phaseRef.current !== "timeoutPrompt") return;
    sendEvent("stt_user_present", { type: "stt_user_present", draftId });
    setTimeoutClosesInMs(null);
    setPhaseSync("recording");
  }, [sendEvent, setPhaseSync]);

  const restore = useCallback(
    (draftId: string) => {
      sendEvent("stt_user_restore", { type: "stt_user_restore", draftId });
    },
    [sendEvent]
  );

  /** undefined = every conversation; null = new-chat only; string = that one */
  const recover = useCallback(
    (conversationId?: string | null) => {
      sendEvent(
        "stt_user_recover",
        conversationId === undefined
          ? { type: "stt_user_recover" }
          : { type: "stt_user_recover", conversationId }
      );
    },
    [sendEvent]
  );

  // ── ✕ undo window ─────────────────────────────────────────────────────
  const clearUndoTimer = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
  }, []);

  /** window lapsed (or the composer moved on): the row goes RECOVERABLE server-side */
  const resolveDiscard = useCallback(
    (entry: SettledDictation) => {
      clearUndoTimer();
      setPendingUndo(current =>
        current?.draftId === entry.draftId ? null : current
      );
      draftsRef.current.delete(entry.draftId);
      cancel(entry.draftId);
    },
    [cancel, clearUndoTimer]
  );

  const holdForUndo = useCallback(
    (entry: SettledDictation) => {
      clearUndoTimer();
      setPendingUndo(entry);
      undoTimerRef.current = setTimeout(
        () => resolveDiscard(entry),
        UNDO_WINDOW_MS
      );
    },
    [clearUndoTimer, resolveDiscard]
  );

  const undoDiscard = useCallback(() => {
    if (!pendingUndo) return;
    clearUndoTimer();
    upsertSettled([pendingUndo]);
    setPendingUndo(null);
  }, [pendingUndo, clearUndoTimer, upsertSettled]);

  /**
   * after a message is dispatched: the batch is coupled server-side, so its
   * DECOUPLED entries leave memory; RECOVERABLE ones stay until restored or
   * expired. A transcript still inside its undo window is discarded now so
   * it can't couple to the message. The next `ensureBatchId` mints fresh.
   */
  const rotateBatch = useCallback(() => {
    const finished = currentBatchRef.current;
    currentBatchRef.current = null;
    setCurrentBatchId(null);
    if (pendingUndo) resolveDiscard(pendingUndo);
    if (!finished) return;
    batchOrdinalRef.current.delete(finished);
    setSettled(prev => {
      const next = new Map(prev);
      for (const [draftId, entry] of prev) {
        if (
          entry.batchId === finished &&
          entry.couplingStatus === "DECOUPLED"
        ) {
          next.delete(draftId);
          draftsRef.current.delete(draftId);
        }
      }
      return next;
    });
    setInsertedDraftIds(prev => {
      const next = new Set<string>();
      for (const draftId of prev) {
        if (draftsRef.current.has(draftId)) next.add(draftId);
      }
      return next;
    });
  }, [pendingUndo, resolveDiscard]);

  // ── frame relay (hop 1) ───────────────────────────────────────────────
  const sendFrame = useCallback(
    (draftId: string, chunk: Worklet.WorkletToMain.Chunk) => {
      const ok = client.sendImmediate("stt_user_binary_frame", {
        type: "stt_user_binary_frame",
        draftId,
        frameOrdinal: chunk.frameOrdinal,
        frame: pcmToBase64(chunk.pcm)
      });
      if (chunk.frameOrdinal === 0 || chunk.frameOrdinal % 50 === 0) {
        sttLog("frame", {
          frameOrdinal: chunk.frameOrdinal,
          bytes: chunk.pcm.byteLength,
          rms: Number(chunk.rms.toFixed(3)),
          ok
        });
      }
      if (!ok) interruptLocal("Connection lost during dictation.");
      return ok;
    },
    [client, interruptLocal]
  );

  const handleChunk = useCallback(
    (chunk: Worklet.WorkletToMain.Chunk) => {
      const draftId = activeDraftRef.current;
      if (!draftId) return;
      switch (phaseRef.current) {
        case "starting": {
          // audio captured before the server is ready is kept, in order,
          // and flushed on stt_user_connected — no first word is lost
          const buffered = preConnectRef.current;
          buffered.push(chunk);
          if (buffered.length > MAX_PRECONNECT_CHUNKS) {
            interruptLocal("The server did not accept the dictation in time.");
          }
          return;
        }
        case "recording":
        case "timeoutPrompt":
        case "finishing": {
          // "finishing" carries the worklet's tail chunk, which precedes `drained`
          sendFrame(draftId, chunk);
          return;
        }
        case "idle":
          return;
      }
    },
    [interruptLocal, sendFrame]
  );

  const handleLevel = useCallback(
    (rms: number) => {
      levelRef.current = rms;
      if (phaseRef.current === "timeoutPrompt" && rms > VOICE_RMS_THRESHOLD) {
        present();
      }
    },
    [present]
  );

  // ── capture actions ───────────────────────────────────────────────────
  const finish = useCallback(
    async (nextIntent?: FinishIntent) => {
      const capture = captureRef.current;
      const draftId = activeDraftRef.current;
      if (!capture || !draftId) return;
      if (nextIntent) {
        intentRef.current = nextIntent;
        setIntent(nextIntent);
      }
      sttLog("finish requested", {
        draftId,
        phase: phaseRef.current,
        intent: intentRef.current
      });
      if (phaseRef.current === "starting") {
        // stop tapped before the server was ready — honored on stt_user_connected
        finishRequestedRef.current = true;
        return;
      }
      if (
        phaseRef.current !== "recording" &&
        phaseRef.current !== "timeoutPrompt"
      ) {
        return;
      }
      setPhaseSync("finishing");
      setTimeoutClosesInMs(null);
      const stopped = await capture.stop();
      sttLog("capture stopped", { draftId, ...stopped }); // tail chunk flowed through handleChunk during "finishing"
      if (captureRef.current === capture) captureRef.current = null;
      const ok = client.sendImmediate("stt_user_finish", {
        type: "stt_user_finish",
        draftId
      });
      sttLog("stt_user_finish sent", { draftId, ok });
      if (!ok) interruptLocal("Connection lost while finishing the dictation.");
    },
    [client, interruptLocal, setPhaseSync]
  );

  // latest-callback ref for the capture and route-change paths, which are
  // registered once and must not close over a stale `finish`
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  const handleInterrupted = useCallback(() => {
    // the mic is gone (interruption, background, navigation away): implicit ■,
    // the transcript still lands — nothing is silently dropped
    void finishRef.current();
  }, []);

  const start = useCallback(
    async (nextIntent: FinishIntent = "insert") => {
      if (phaseRef.current !== "idle") return;
      if (!isConnected) {
        setError("Not connected — dictation needs a live connection.");
        return;
      }
      // synchronous, inside the gesture: AudioContext + audio session type
      const capture = new PcmCapture({
        onChunk: handleChunk,
        onLevel: handleLevel,
        onInterrupted: handleInterrupted
      });
      captureRef.current = capture;
      discardRef.current = false;
      finishRequestedRef.current = false;
      preConnectRef.current = [];
      intentRef.current = nextIntent;
      setIntent(nextIntent);
      setError(null);
      setPhaseSync("starting");

      try {
        const batchId = await ensureBatchId();
        const ordinal = nextOrdinal(batchId);
        const conversationId =
          activeConversationId === "new-chat" ? null : activeConversationId;
        const draftId = draftIdEpimerize({
          userId,
          convoId: conversationId ?? "new-chat",
          batchId,
          dictationOrdinal: ordinal,
          isNewConvo: conversationId === null
        });
        draftsRef.current.set(draftId, { batchId, ordinal, conversationId });
        activeDraftRef.current = draftId;
        setActiveDraftId(draftId);

        const { sampleRate, inputSampleRate } = await capture.start();
        if (captureRef.current !== capture) return; // torn down mid-start
        setStartedAt(performance.now());
        sttLog("stt_user_connect", {
          draftId,
          sampleRate,
          inputSampleRate,
          contextRate: capture.contextSampleRate,
          language
        });
        sendEvent("stt_user_connect", {
          type: "stt_user_connect",
          draftId,
          batchId,
          ordinal,
          conversationId,
          sampleRate,
          inputSampleRate,
          language
        });
      } catch (err) {
        if (captureRef.current === capture) {
          interruptLocal(
            err instanceof Error && err.name === "NotAllowedError"
              ? "Microphone permission was denied."
              : "The microphone could not be started."
          );
        }
      }
    },
    [
      isConnected,
      handleChunk,
      handleLevel,
      handleInterrupted,
      ensureBatchId,
      nextOrdinal,
      activeConversationId,
      userId,
      language,
      sendEvent,
      interruptLocal,
      setPhaseSync
    ]
  );

  /** ✕ — two-phase: finishes exactly like ■, then holds the text for undo */
  const discard = useCallback(async () => {
    if (!captureRef.current) return;
    discardRef.current = true;
    await finish("insert");
  }, [finish]);

  // ── WS subscriptions — single effect, like AssetContext ──────────────
  useEffect(() => {
    const isActive = (draftId: string) => activeDraftRef.current === draftId;
    const settleActive = () => {
      captureRef.current?.dispose();
      captureRef.current = null;
      preConnectRef.current = [];
      finishRequestedRef.current = false;
      activeDraftRef.current = null;
      setActiveDraftId(null);
      setStartedAt(null);
      levelRef.current = 0;
      setTimeoutClosesInMs(null);
      setPhaseSync("idle");
    };

    const handleConnected = (evt: EventTypeMap["stt_user_connected"]) => {
      if (!isActive(evt.draftId)) return;
      setPhaseSync("recording");
      sttLog("stt_user_connected", {
        draftId: evt.draftId,
        externalId: evt.externalId,
        buffered: preConnectRef.current.length
      });
      const buffered = preConnectRef.current;
      preConnectRef.current = [];
      for (const chunk of buffered) {
        if (!sendFrame(evt.draftId, chunk)) return;
      }
      if (finishRequestedRef.current) {
        finishRequestedRef.current = false;
        void finishRef.current();
      }
    };

    const handleTimeout = (evt: EventTypeMap["stt_user_timeout"]) => {
      if (!isActive(evt.draftId)) return;
      sttLog("stt_user_timeout", evt);
      setPhaseSync("timeoutPrompt");
      setTimeoutClosesInMs(evt.closesInMs);
    };

    const handleFinished = (evt: EventTypeMap["stt_user_finished"]) => {
      const identity = identityOf(evt.draftId);
      if (!identity) {
        sttLog("stt_user_finished for an unparseable draftId", evt.draftId);
        if (isActive(evt.draftId)) settleActive();
        return;
      }
      const entry = {
        draftId: evt.draftId,
        ...identity,
        text: evt.text,
        words: evt.words,
        duration: evt.duration,
        reconciled: true,
        couplingStatus: evt.couplingStatus,
        terminationReason: evt.terminationReason
      } satisfies SettledDictation;
      const active = isActive(evt.draftId);
      sttLog("stt_user_finished", {
        draftId: evt.draftId,
        chars: evt.text.length,
        duration: evt.duration,
        terminationReason: evt.terminationReason,
        active,
        discard: discardRef.current
      });
      if (active && discardRef.current) {
        discardRef.current = false;
        if (entry.text.trim().length === 0) resolveDiscard(entry);
        else holdForUndo(entry);
      } else {
        upsertSettled([entry]);
      }
      if (active) settleActive();
    };

    const handleInterruptedEvt = (
      evt: EventTypeMap["stt_user_interrupted"]
    ) => {
      sttLog("stt_user_interrupted", {
        draftId: evt.draftId,
        chars: evt.text.length,
        terminationReason: evt.terminationReason,
        couplingStatus: evt.couplingStatus
      });
      const identity =
        evt.couplingStatus === "RECOVERABLE" ? identityOf(evt.draftId) : null;
      if (evt.couplingStatus === "RECOVERABLE" && !identity) {
        sttLog("stt_user_interrupted for an unparseable draftId", evt.draftId);
      } else if (identity) {
        upsertSettled([
          {
            draftId: evt.draftId,
            ...identity,
            text: evt.text,
            words: evt.words,
            duration: evt.duration,
            reconciled: evt.reconciled,
            couplingStatus: evt.couplingStatus,
            terminationReason: evt.terminationReason,
            recoveryExpiresAt: evt.recoveryExpiresAt ?? undefined
          }
        ]);
      } else {
        // FAILED: nothing was captured, nothing to keep
        dropSettled(evt.draftId);
        setError("Dictation was interrupted before any speech was captured.");
      }
      if (isActive(evt.draftId)) settleActive();
    };

    const handleCanceled = (evt: EventTypeMap["stt_user_canceled"]) => {
      if (evt.couplingStatus === "ORPHANED") {
        dropSettled(evt.draftId);
      } else {
        patchSettled(evt.draftId, {
          couplingStatus: evt.couplingStatus,
          terminationReason: evt.terminationReason,
          recoveryExpiresAt: evt.recoveryExpiresAt ?? undefined
        });
      }
      if (isActive(evt.draftId)) settleActive();
    };

    const handleRecovered = (evt: EventTypeMap["stt_user_recovered"]) => {
      upsertSettled(
        evt.results.map(result => ({
          draftId: result.draftId,
          batchId: result.batchId,
          ordinal: result.ordinal,
          conversationId: result.conversationId,
          text: result.text,
          reconciled: result.reconciled,
          couplingStatus: "RECOVERABLE",
          terminationReason: result.terminationReason,
          recoveryExpiresAt: result.recoveryExpiresAt
        }))
      );
    };

    const handleRestored = (evt: EventTypeMap["stt_user_restored"]) => {
      patchSettled(evt.draftId, {
        couplingStatus: evt.couplingStatus,
        recoveryExpiresAt: undefined
      });
    };

    const handleError = (evt: EventTypeMap["stt_user_error"]) => {
      sttLog("stt_user_error", evt);
      setError(`${evt.status}: ${evt.statusText}`);
      if (isActive(evt.draftId)) settleActive();
    };

    client.on("stt_user_connected", handleConnected);
    client.on("stt_user_timeout", handleTimeout);
    client.on("stt_user_finished", handleFinished);
    client.on("stt_user_interrupted", handleInterruptedEvt);
    client.on("stt_user_canceled", handleCanceled);
    client.on("stt_user_recovered", handleRecovered);
    client.on("stt_user_restored", handleRestored);
    client.on("stt_user_error", handleError);

    return () => {
      client.off("stt_user_connected");
      client.off("stt_user_timeout");
      client.off("stt_user_finished");
      client.off("stt_user_interrupted");
      client.off("stt_user_canceled");
      client.off("stt_user_recovered");
      client.off("stt_user_restored");
      client.off("stt_user_error");
    };
  }, [
    client,
    identityOf,
    upsertSettled,
    patchSettled,
    dropSettled,
    sendFrame,
    setPhaseSync,
    holdForUndo,
    resolveDiscard
  ]);

  // socket gone while live: the server settles the row on close; the mic is released here
  useEffect(() => {
    if (!isConnected && captureRef.current) {
      interruptLocal("Connection lost during dictation.");
    }
  }, [isConnected, interruptLocal]);

  // navigation never cancels: leaving the route mid-dictation is an implicit ■
  useEffect(() => {
    if (
      phaseRef.current === "recording" ||
      phaseRef.current === "timeoutPrompt"
    ) {
      void finishRef.current();
    }
  }, [pathConvId]);

  // provider unmount releases everything
  useEffect(() => {
    return () => {
      captureRef.current?.dispose();
      captureRef.current = null;
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  // ── lookups ───────────────────────────────────────────────────────────
  const getDictationsByBatchId = useCallback(
    (batchId: string) =>
      Array.from(settled.values())
        .filter(entry => entry.batchId === batchId)
        .sort((a, b) => a.ordinal - b.ordinal),
    [settled]
  );

  const hasDictations = useMemo(() => {
    if (currentBatchId === null) return false;
    for (const entry of settled.values()) {
      if (
        entry.batchId === currentBatchId &&
        entry.couplingStatus === "DECOUPLED"
      ) {
        return true;
      }
    }
    return false;
  }, [settled, currentBatchId]);

  const pendingInserts = useMemo(() => {
    if (currentBatchId === null) return Array.of<SettledDictation>();
    return Array.from(settled.values())
      .filter(
        entry =>
          entry.batchId === currentBatchId &&
          entry.couplingStatus === "DECOUPLED" &&
          !insertedDraftIds.has(entry.draftId)
      )
      .sort((a, b) => a.ordinal - b.ordinal);
  }, [settled, currentBatchId, insertedDraftIds]);

  const value = useMemo<STTContextValue>(
    () => ({
      languages: LANGUAGES,
      language,
      languageOption,
      detectedLanguage,
      setLanguage,
      resetLanguage,
      activeConversationId,
      currentBatchId,
      hasDictations,
      ensureBatchId,
      rotateBatch,
      getDictationsByBatchId,
      phase,
      activeDraftId,
      startedAt,
      readLevel,
      timeoutClosesInMs,
      intent,
      error,
      isConnected,
      start,
      finish,
      discard,
      undoDiscard,
      pendingUndo,
      pendingInserts,
      markInserted,
      cancel,
      present,
      restore,
      recover,
      clearError
    }),
    [
      language,
      languageOption,
      detectedLanguage,
      resetLanguage,
      activeConversationId,
      currentBatchId,
      hasDictations,
      ensureBatchId,
      rotateBatch,
      getDictationsByBatchId,
      phase,
      activeDraftId,
      startedAt,
      readLevel,
      timeoutClosesInMs,
      intent,
      error,
      isConnected,
      start,
      finish,
      discard,
      undoDiscard,
      pendingUndo,
      pendingInserts,
      markInserted,
      cancel,
      present,
      restore,
      recover,
      clearError
    ]
  );

  return <STTContext.Provider value={value}>{children}</STTContext.Provider>;
}

export function useSTTCtx() {
  const ctx = useContext(STTContext);
  if (!ctx) throw new Error("useSTTCtx must be used within STTProvider");
  return ctx;
}

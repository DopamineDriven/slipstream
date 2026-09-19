import type { STTTypes } from "@/stt.ts";
import type { UTR } from "@/utils.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";

/**
 * C→S
 */
export type STTUserConnect = {
  type: "stt_user_connect";
  draftId: string;
  batchId: string;
  ordinal: number;
  conversationId: string | null;
  sampleRate: STTTypes.SampleRate;
  inputSampleRate?: number;
  language?: string;
  keyterms?: string[];
  endpointing?: number;
  diarize?: boolean;
  fillerWords?: boolean;
  vadThreshold?: number;
};
/**
 * C→S
 */
export type STTUserCancel = {
  type: "stt_user_cancel";
  draftId: string;
};
/**
 * S→C
 */
export type STTUserCanceled = {
  type: "stt_user_canceled";
  draftId: string;
  terminationReason: Extract<
    $Enums.DictationTerminationReason,
    "USER_CANCELED"
  >;
  couplingStatus: Extract<
    $Enums.DictationCouplingStatus,
    "RECOVERABLE" | "ORPHANED"
  >;
  /** epoch ms; null when `couplingStatus` is `"ORPHANED"` */
  recoveryExpiresAt: number | null;
};
/**
 * C→S
 */
export type STTUserRecover = {
  type: "stt_user_recover";
  /**
   * null = new-chat
   */
  conversationId?: string | null;
};

export type STTUserRecoveredResultSingleton = {
  draftId: string;
  batchId: string;
  ordinal: number;
  conversationId: string | null;
  text: string;
  terminationReason: Exclude<
    $Enums.DictationTerminationReason,
    "USER_FINISHED" | "IDLE_TIMEOUT" | "NONE"
  >;
  reconciled: boolean;
  /**
   * epoch ms
   */
  recoveryExpiresAt: number;
  createdAt: number;
};

/**
 * S→C
 */
export type STTUserRecovered = {
  type: "stt_user_recovered";
  results: STTUserRecoveredResultSingleton[];
};

/**
 * S→C
 */
export type STTUserConnected = {
  type: "stt_user_connected";
  draftId: string;
  externalId: string;
};

/**
 * C→S
 */
export type STTUserBinaryFrame = {
  type: "stt_user_binary_frame";
  draftId: string;
  /** 0-based sequence for audio chunks received; increments by 1 */
  frameOrdinal: number;
  /** base64-encoded PCM16LE mono chunk (~100 ms) */
  frame: string;
};

/**
 * S→C
 */
export type STTUserError = {
  type: "stt_user_error";
  draftId: string;
  status: number;
  statusText: string;
};
/**
 * S→C
 */
export type STTUserTimeout = {
  type: "stt_user_timeout";
  draftId: string;
  /**
   * Milliseconds remaining before the server automatically
   * finishes the dictation unless `stt_user_present` is received.
   */
  closesInMs: number;
};
/**
 * C→S
 */
export type STTUserPresent = {
  type: "stt_user_present";
  draftId: string;
};
/**
 * C→S
 */
export type STTUserFinish = {
  type: "stt_user_finish";
  draftId: string;
};
/**
 * S→C
 */
export type STTUserFinished = {
  type: "stt_user_finished";
  draftId: string;
  words: STTTypes.Transcript.Done["words"];
  text: string;
  /** seconds to 2 d.p.; the row stores durationMs */
  duration: number;
  sampleRate: STTTypes.SampleRate;
  couplingStatus: Extract<$Enums.DictationCouplingStatus, "DECOUPLED">;
  terminationReason: Extract<
    $Enums.DictationTerminationReason,
    "USER_FINISHED" | "IDLE_TIMEOUT"
  >;
};

/**
 * S→C
 */
export type STTUserInterrupted = {
  type: "stt_user_interrupted";
  draftId: string;
  text: string;
  words: STTTypes.Transcript.Partial["words"];
  /**
   * seconds; end of the last reconciled segment (2 d.p.)
   */
  duration: number;
  /**
   * false when overlapping finals not reconciled reliably
   */
  reconciled: boolean;
  terminationReason: Extract<
    $Enums.DictationTerminationReason,
    "UPSTREAM_ERROR" | "INTERNAL_ERROR"
  >;
  couplingStatus: Extract<
    $Enums.DictationCouplingStatus,
    "RECOVERABLE" | "FAILED"
  >;
  /** epoch ms; null when `couplingStatus` is `"FAILED"` */
  recoveryExpiresAt: number | null;
};

/**
 * C→S
 */
export type STTUserRestore = { type: "stt_user_restore"; draftId: string };
/**
 * S→C
 */
export type STTUserRestored = {
  type: "stt_user_restored";
  draftId: string;
  couplingStatus: Extract<$Enums.DictationCouplingStatus, "DECOUPLED">;
};

/** C→S */
export type STTUserRehydrate = {
  type: "stt_user_rehydrate";
  /** null = new-chat */
  conversationId: string | null;
};

export type STTUserRehydratedDictation = {
  draftId: string;
  ordinal: number;
  content: string;
  couplingStatus: $Enums.DictationCouplingStatus;
};

export type STTUserRehydratedData = {
  conversationId: string | null;
  batchId: string | null;
  ordinals: number[];
  /** epoch ms */
  expiresAt: number | null;
  dictations: STTUserRehydratedDictation[];
};

/**
 * S→C
 */
export type STTUserRehydrated = {
  type: "stt_user_rehydrated";
  hasRecent: boolean;
  data?: STTUserRehydratedData;
};

export type STTEventUnion =
  | STTUserBinaryFrame
  | STTUserCancel
  | STTUserCanceled
  | STTUserConnect
  | STTUserConnected
  | STTUserError
  | STTUserFinish
  | STTUserFinished
  | STTUserInterrupted
  | STTUserPresent
  | STTUserRecover
  | STTUserRecovered
  | STTUserRehydrate
  | STTUserRehydrated
  | STTUserRestore
  | STTUserRestored
  | STTUserTimeout;

export type STTEventRecord<T extends boolean = false> = UTR<
  STTEventUnion,
  "type",
  T
>;

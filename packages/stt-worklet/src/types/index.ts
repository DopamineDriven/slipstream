export namespace Worklet {
  export type SampleRate = 8000 | 16000 | 22050 | 24000 | 44100 | 48000;
  export namespace MainToWorklet {
    export interface Attach {
      type: "attach";
      port: MessagePort;
    }
    export interface Stop {
      type: "stop";
    }
  }

  export namespace WorkletToMain {
    export interface Chunk {
      type: "chunk";
      frameOrdinal: number;
      pcm: ArrayBuffer;
      rms: number;
    }
    export interface Drained {
      type: "drained";
      /** total chunks emitted; equals the last frameOrdinal + 1 */
      frames: number;
    }
  }
  export interface PCMCapture {
    /** what the worklet emits at, and what STTUserConnect.sampleRate carries */
    targetSampleRate: SampleRate;
    chunkMs: number; // default 100
  }
  export type MainToWorklet = MainToWorklet.Attach | MainToWorklet.Stop;

  export type WorkletToMain = WorkletToMain.Chunk | WorkletToMain.Drained;

  export type EventUnion =
    | MainToWorklet.Attach
    | WorkletToMain.Chunk
    | WorkletToMain.Drained
    | MainToWorklet.Stop;

  export type MainToWorkletRecord<T extends boolean = false> = UTR<
    MainToWorklet,
    "type",
    T
  >;

  export type EventRecord<T extends boolean = false> = UTR<
    EventUnion,
    "type",
    T
  >;

  export type WorkletToMainRecord<T extends boolean = false> = UTR<
    WorkletToMain,
    "type",
    T
  >;
}

export type SafariAudioSessionType =
  | "auto"
  | "playback"
  | "transient"
  | "transient-solo"
  | "ambient"
  | "play-and-record";

export type SafariAudioSessionState = "inactive" | "active" | "interrupted";

export interface SafariAudioSessionEventMap {
  statechange: Event;
}
export type Rm<T, P extends keyof T = keyof T> = {
  [S in keyof T as Exclude<S, P>]: T[S];
};
export type UTR<
  TUnion extends Record<TKey, string>,
  TKey extends string = "kind",
  TExclude extends `strip-${TKey}` | boolean = false
> = {
  [K in TUnion[TKey]]: TExclude extends false
    ? Extract<TUnion, Record<TKey, K>>
    : Rm<Extract<TUnion, Record<TKey, K>>, TKey>;
};

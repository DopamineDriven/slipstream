import type {
  SafariAudioSessionEventMap,
  SafariAudioSessionState,
  SafariAudioSessionType
} from "@/types/index.ts";

export type {
  Rm,
  SafariAudioSessionEventMap,
  SafariAudioSessionState,
  SafariAudioSessionType,
  Worklet,
  UTR
} from "@/types/index.ts";


// global decs

declare global {
  interface JSON {
    parse<T = unknown>(
      text: string,
      reviver?: (this: any, key: string, value: any) => any
    ): T;
  }
  interface Body {
    json<T = unknown>(): Promise<T>;
  }
  interface ObjectConstructor {
    // PropertyKey -> string and number allowed, symbol disallowed (symbol can't be enumerable)
    keys<T = object>(
      o: T
    ): (keyof T extends infer K
      ? K extends string
        ? K
        : K extends number
          ? `${K}`
          : never
      : never)[];
  }
  /**
   * Web Audio Session API
   *
   * Spec surface:
   * - type
   * - readonly state
   * - onstatechange
   *
   * Safari/WebKit shipped this behind partial support first, so this is a
   * pragmatic ambient declaration for app code.
   */
  interface AudioSession extends EventTarget {
    type: SafariAudioSessionType;
    readonly state: SafariAudioSessionState;
    onstatechange: ((this: AudioSession, ev: Event) => any) | null;

    addEventListener<K extends keyof SafariAudioSessionEventMap>(
      type: K,
      listener: (this: AudioSession, ev: SafariAudioSessionEventMap[K]) => any,
      options?: boolean | AddEventListenerOptions
    ): void;

    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ): void;

    removeEventListener<K extends keyof SafariAudioSessionEventMap>(
      type: K,
      listener: (this: AudioSession, ev: SafariAudioSessionEventMap[K]) => any,
      options?: boolean | EventListenerOptions
    ): void;

    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions
    ): void;
  }

  interface Navigator {
    readonly audioSession?: AudioSession;
  }
}

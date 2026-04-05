/// <reference types="gtag.js" />

declare module "gtag.js";

declare global {
  interface Window {
    dataLayer?: object[];
  }
  interface JSON {
    parse<T = unknown>(
      text: string,
      reviver?: (this: any, key: string, value: any) => any
    ): T;
  }
  interface Body {
    json<T = unknown>(): Promise<T>;
  }
  interface AudioSession {
    type:
      | "auto"
      | "playback"
      | "transient"
      | "transient-solo"
      | "ambient"
      | "play-and-record";
  }
  interface Navigator {
    readonly audioSession?: AudioSession;
  }
}

export {};

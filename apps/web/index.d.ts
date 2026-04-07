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

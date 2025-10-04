/// <reference types="gtag.js" />

declare module "gtag.js";

declare global {
  interface Window {
    dataLayer?: object[];
    chatScrollToBottom?: () => void;
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
}

export {};

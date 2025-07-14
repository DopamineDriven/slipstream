/// <reference types="gtag.js" />

declare module "gtag.js";

declare global {
  interface Window {
    dataLayer?: object[];
  }
}

export {};

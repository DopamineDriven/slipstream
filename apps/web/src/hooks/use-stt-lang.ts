"use client";

import { useMemo } from "react";
import { useCookiesCtx } from "@/context/cookie-context";
import { isValidLangSTT, languageHelperSTT } from "@/lib/helpers";

/**
 * STT formatting-language hint derived from the locale cookie (navigator
 * fallback when the cookie is absent). Pure derivation — nothing to sync.
 * `language` only enables the provider's number/currency formatting; the
 * model transcribes any supported language regardless, so an unsupported
 * code means "no formatting", never "no dictation" — copy the banner
 * accordingly.
 */
export function useLangSTT() {
  const { get } = useCookiesCtx();
  const userLocale = get("locale");

  return useMemo(() => {
    const source =
      userLocale ??
      (typeof globalThis.navigator !== "undefined"
        ? globalThis.navigator.language
        : undefined);
    const lang = source ? languageHelperSTT(source) : undefined;
    const isSupported = lang ? isValidLangSTT(lang) : undefined;
    return {
      lang,
      isSupported,
      // send-site value: only ever a code the provider formats for; the
      // server re-validates with its own isValidLanguage regardless
      sttLanguage: isSupported ? lang : undefined
    };
  }, [userLocale]);
}

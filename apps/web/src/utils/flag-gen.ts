import { Fs } from "@d0paminedriven/fs";
import { Iso3166_1 } from "@d0paminedriven/iso-3166-1";
import { STTTypes } from "@slipstream/types";

const iso = new Iso3166_1();
const fs = new Fs(process.cwd());

export const LANGUAGE_DETAILS = {
  ar: {
    name: "Arabic",
    nativeName: "العربية",
    countryCode: "682",
    flagAspectRatio: "3/2"
  },
  cs: {
    name: "Czech",
    nativeName: "Čeština",
    countryCode: "203",
    flagAspectRatio: "3/2"
  },
  da: {
    name: "Danish",
    nativeName: "Dansk",
    countryCode: "208",
    flagAspectRatio: "37/28"
  },
  de: {
    name: "German",
    nativeName: "Deutsch",
    countryCode: "276",
    flagAspectRatio: "5/3"
  },
  en: {
    name: "English",
    nativeName: "English",
    countryCode: "840",
    flagAspectRatio: "19/10"
  },
  es: {
    name: "Spanish",
    nativeName: "Español",
    countryCode: "484",
    flagAspectRatio: "7/4"
  },
  fa: {
    name: "Persian",
    nativeName: "فارسی",
    countryCode: "364",
    flagAspectRatio: "7/4"
  },
  fil: {
    name: "Filipino",
    nativeName: "Filipino",
    countryCode: "608",
    flagAspectRatio: "2/1"
  },
  fr: {
    name: "French",
    nativeName: "Français",
    countryCode: "250",
    flagAspectRatio: "3/2"
  },
  hi: {
    name: "Hindi",
    nativeName: "हिन्दी",
    countryCode: "356",
    flagAspectRatio: "3/2"
  },
  id: {
    name: "Indonesian",
    nativeName: "Bahasa Indonesia",
    countryCode: "360",
    flagAspectRatio: "3/2"
  },
  it: {
    name: "Italian",
    nativeName: "Italiano",
    countryCode: "380",
    flagAspectRatio: "3/2"
  },
  ja: {
    name: "Japanese",
    nativeName: "日本語",
    countryCode: "392",
    flagAspectRatio: "3/2"
  },
  ko: {
    name: "Korean",
    nativeName: "한국어",
    countryCode: "410",
    flagAspectRatio: "3/2"
  },
  mk: {
    name: "Macedonian",
    nativeName: "Македонски",
    countryCode: "807",
    flagAspectRatio: "2/1"
  },
  ms: {
    name: "Malay",
    nativeName: "Bahasa Melayu",
    countryCode: "458",
    flagAspectRatio: "2/1"
  },
  nl: {
    name: "Dutch",
    nativeName: "Nederlands",
    countryCode: "528",
    flagAspectRatio: "3/2"
  },
  pl: {
    name: "Polish",
    nativeName: "Polski",
    countryCode: "616",
    flagAspectRatio: "8/5"
  },
  pt: {
    name: "Portuguese",
    nativeName: "Português",
    countryCode: "620",
    flagAspectRatio: "3/2"
  },
  ro: {
    name: "Romanian",
    nativeName: "Română",
    countryCode: "642",
    flagAspectRatio: "3/2"
  },
  ru: {
    name: "Russian",
    nativeName: "Русский",
    countryCode: "643",
    flagAspectRatio: "3/2"
  },
  sv: {
    name: "Swedish",
    nativeName: "Svenska",
    countryCode: "752",
    flagAspectRatio: "8/5"
  },
  th: {
    name: "Thai",
    nativeName: "ไทย",
    countryCode: "764",
    flagAspectRatio: "3/2"
  },
  tr: {
    name: "Turkish",
    nativeName: "Türkçe",
    countryCode: "792",
    flagAspectRatio: "3/2"
  },
  vi: {
    name: "Vietnamese",
    nativeName: "Tiếng Việt",
    countryCode: "704",
    flagAspectRatio: "3/2"
  }
} as const;

const A = Array.of<STTTypes.Web.LanguageOption>();

if (process.argv[3] === "arr") {
  for (const [k, v] of Object.entries(LANGUAGE_DETAILS)) {
    const data = iso.countryCodeToObjOutput(v.countryCode);
    const language = k as STTTypes.Language;
    const rec = {
      ...v,
      language,
      flagAspectRatio: data.flagAspectRatio,
      aspectClassName: `aspect-[${data.flagAspectRatio}]`,
      flag: `/flags/${data.alpha2.toLowerCase()}.svg`,
      alpha2: data.alpha2 as STTTypes.Web.Alpha2Subset
    } satisfies STTTypes.Web.LanguageOption;

    A.push(rec);
  }
  const stringify = JSON.stringify(A, null, 2);
  const template = `export const arrSTT = ${stringify} as const;`;

  fs.withWs("src/lib/stt-arr.ts", template);
}
if (process.argv[3] === "obj") {
  function mapper(L: typeof LANGUAGE_DETAILS) {
    return Object.fromEntries(
      Object.entries(L).map(([k, v]) => {
        const data = iso.countryCodeToObjOutput(v.countryCode);
        const rec = {
          ...v,
          language: k as STTTypes.Language,
          flagAspectRatio: data.flagAspectRatio,
          aspectClassName: `aspect-[${data.flagAspectRatio}]`,
          flag: `/flags/${data.alpha2.toLowerCase()}.svg`,
          alpha2: data.alpha2
        } satisfies STTTypes.Web.LanguageOption;
        return [k, rec];
      })
    );
  }
  const stringify = JSON.stringify(mapper(LANGUAGE_DETAILS), null, 2);
  const template = `export const dataSTT = ${stringify} as const;`;

  fs.withWs("src/lib/stt-data.ts", template);
}

if (process.argv[3] === "extract") {
  (async () => {
    for (const [_key, val] of Object.entries(LANGUAGE_DETAILS)) {
      const data = iso.countryCodeToObjOutput(val.countryCode);
      fs.fetchRemoteWriteLocalLargeFiles(
        data.countryFlag,
        `public/flags/${data.alpha2.toLocaleLowerCase()}.svg`,
        false
      );
    }
  })();
}

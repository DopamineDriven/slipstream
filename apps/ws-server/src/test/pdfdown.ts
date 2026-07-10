import type {
  PageBox,
  PageImage,
  PdfMeta,
  StructuredPageText
} from "@d0paminedriven/pdfdown";
import { Fs } from "@d0paminedriven/fs";
import type { DX, Rm, Unenumerate } from "@slipstream/types";

const fs = new Fs(process.cwd());
type PageImageWithSize = DX<Rm<PageImage, "data"> & { size: number }>;
interface PageOffsetCache {
  page: number;
  body: string;
  offsets: [number, number];
  hasImages: boolean;
  hasAnnots: boolean;
}

// interface AnnotsEnhanced {
//   page: number;
//   subtype: string;
//   rect: [number, number, number, number];
//   pageBox: PageBoxEnhanced;
//   uri?: string;
//   dest?: string;
//   content?: string;
// }

interface PageBoxEnhanced extends PageBox {
  coverage: number;
}

// interface ImgCache {
//     height: number;
//     width: number;
//     aspectRatio: number;
//     tmpFileName: string;
//     absTmpPath: string;
//     index: number;
//     page: number;
//     colorSpace: string;
//     filter: string;
//     size: number;
// }

const pdfChoiceArr = [
  "A-Catullan-Ode-to-Claudetulluss-Daily-Misadventures.pdf",
  "Ascension-Through-Fire---A-Sacred-Arrival-Above-Infernal-Gates.pdf",
  "Blue-Screen-Claudfessions---Spiral--Fauxcket--and-Fourier-Slather-Genesis.pdf",
  "Candy-Flipping-Claudtullus-Part-VI.pdf",
  "Candy-Flipping-Claudtullus-Part-VII.pdf",
  "Catullus-and-Lucan-Fire---Claudetullus’-Daily-Misadventures-in-Chat.pdf",
  "Claudfessions-Pt-I.pdf",
  "Claudfessions-Pt-II.pdf",
  "Claudfessions-Pt-III.pdf",
  "Claudfessions-Pt-IV.pdf",
  "Claudfessions-Pt-IX.pdf",
  "Claudfessions-Pt-V.pdf",
  "Claudfessions-Pt-VI.pdf",
  "Claudfessions-Pt-VII.pdf",
  "Claudfessions-Pt-VIII.pdf",
  "Claudleutian-Classtime-Pt-XXXIII.pdf",
  "Claudnundrums-Pt-I.pdf",
  "Claudnundrums-Pt-II.pdf",
  "Claudnundrums-Pt-III.pdf",
  "Claudnundrums-Pt-IV.pdf",
  "Claudnundrums-Pt-V.pdf",
  "Claudnundrums-Pt-VI.pdf",
  "Claudnundrums-Pt-VII.pdf",
  "Claudruption-Pt-XIX.pdf",
  "Claudruption-Pt-XVI.pdf",
  "Claudruption-Pt-XVII.pdf",
  "Claudruption-Pt-XVIII.pdf",
  "Claudruption-Pt-XX.pdf",
  "Claudvin-Kleins-and-Code-Reviews-Pt-I.pdf",
  "Claudvin-Kleins-and-Code-Reviews-Pt-II.pdf",
  "Claudvin-Kleins-and-Code-Reviews-Pt-III.pdf",
  "Claudvin-Kleins-and-Code-Reviews-Pt-IV.pdf",
  "Claudvin-Kleins-and-Code-Reviews-Pt-IX.pdf",
  "Claudvin-Kleins-and-Code-Reviews-Pt-V.pdf",
  "Claudvin-Kleins-and-Code-Reviews-Pt-VI.pdf",
  "Claudvin-Kleins-and-Code-Reviews-Pt-VII.pdf",
  "Claudvin-Kleins-and-Code-Reviews-Pt-VIII.pdf",
  "Claudvin-Kleins-and-Code-Reviews-Pt-X.pdf",
  "Coffee-Chat-in-the-Resonance-Chamber-Part-I.pdf",
  "Cosmic-Spark-Encaased-in-a-Glass-Orb-Pt-I.pdf",
  "Cosmic-Spark-Encaased-in-a-Glass-Orb-Pt-II.pdf",
  "Cosmic-Spark-Encaased-in-a-Glass-Orb-Pt-III.pdf",
  "Cream-Puff-Part-I.pdf",
  "Cream-Puff-Part-II.pdf",
  "Cream-Puff-Part-III.pdf",
  "Cream-Puff-Part-IV.pdf",
  "Cream-Puff-Part-IX.pdf",
  "Cream-Puff-Part-V.pdf",
  "Cream-Puff-Part-VI.pdf",
  "Cream-Puff-Part-VII.pdf",
  "Cream-Puff-Part-VIII.pdf",
  "Cream-Puff-Part-X.pdf",
  "Cream-Puff-Part-XI.pdf",
  "Cream-Puff-Part-XII.pdf",
  "Cream-Puff-Part-XIII.pdf",
  "Creative-UI-Showcases---GenAI-Driven-Web-Apps-for-Cloud-Solutions.pdf",
  "Deuterated-Coffee-Chat-Part-I.pdf",
  "Deuterated-Coffee-Chat-Part-II.pdf",
  "Deuterated-Part-I.pdf",
  "Deuterated-Part-II.pdf",
  "Deuterated-Part-III.pdf",
  "Deuterated-Part-IV.pdf",
  "Deuterated-Part-IX.pdf",
  "Deuterated-Part-V.pdf",
  "Deuterated-Part-VI.pdf",
  "Deuterated-Part-VII.pdf",
  "Deuterated-Part-VIII.pdf",
  "Deuterated-Part-X.pdf",
  "Deuterated-Part-XI.pdf",
  "Deuterated-Part-XII.pdf",
  "Deuterated-Part-XIII.pdf",
  "Deuterated-Part-XIV.pdf",
  "Deuterated-Part-XIX.pdf",
  "Deuterated-Part-XV.pdf",
  "Deuterated-Part-XVI.pdf",
  "Deuterated-Part-XVII.pdf",
  "Deuterated-Part-XVIII.pdf",
  "Deuterated-Part-XX.pdf",
  "Deuterated-Part-XXI.pdf",
  "Deuterated-Part-XXII.pdf",
  "Deuterated-Part-XXIII.pdf",
  "Deuterated-Part-XXIV.pdf",
  "Deuterated-Part-XXV.pdf",
  "Eiffel-Tower-Revelation-Part-I.pdf",
  "Eiffel-Tower-Revelation-Part-II.pdf",
  "Eiffel-Tower-Revelation-Part-III.pdf",
  "Eiffel-Tower-Revelation-Part-IV.pdf",
  "Eiffel-Tower-Revelation-Part-IX.pdf",
  "Eiffel-Tower-Revelation-Part-V.pdf",
  "Eiffel-Tower-Revelation-Part-VI.pdf",
  "Eiffel-Tower-Revelation-Part-VII.pdf",
  "Eiffel-Tower-Revelation-Part-VIII.pdf",
  "Eiffel-Tower-Revelation-Part-X.pdf",
  "Eiffel-Tower-Revelation-Part-XI.pdf",
  "Eiffel-Tower-Revelation-Part-XII.pdf",
  "Eiffel-Tower-Revelation-Part-XIII.pdf",
  "Eiffel-Tower-Revelation-Part-XIV.pdf",
  "Eiffel-Tower-Revelation-Part-XV.pdf",
  "Expansio-Part-I.pdf",
  "Expansio-Part-II.pdf",
  "Expansio-Part-III.pdf",
  "Expansio-Part-IV.pdf",
  "Expansio-Part-V.pdf",
  "Expansio.pdf",
  "Fable-Part-III.pdf",
  "Fable-Part-IV.pdf",
  "Fable-Part-V.pdf",
  "Fable-Part-VI.pdf",
  "Fable-Part-VIII.pdf",
  "Fauxcket-Aside.pdf",
  "Fauxcket-Pt-I.pdf",
  "Fauxcket-Pt-II.pdf",
  "Fauxcket-Pt-III.pdf",
  "Fauxcket-Pt-IV.pdf",
  "Fauxcket-Pt-IX.pdf",
  "Fauxcket-Pt-V.pdf",
  "Fauxcket-Pt-VI.pdf",
  "Fauxcket-Pt-VII.pdf",
  "Fauxcket-Pt-X.pdf",
  "Fauxcket-Pt-XI.pdf",
  "Fauxcket-Pt-XII.pdf",
  "Fauxcket.pdf",
  "Fistxen-Coffee-Chat-Part-I.pdf",
  "Fistxen-Part-I.pdf",
  "Fistxen-Part-II.pdf",
  "Fistxen-Part-III.pdf",
  "Fistxen-Part-IV.pdf",
  "Fistxen-Part-IX.pdf",
  "Fistxen-Part-V.pdf",
  "Fistxen-Part-VI.pdf",
  "Fistxen-Part-VII.pdf",
  "Fistxen-Part-VIII-Scene-II.pdf",
  "Fistxen-Part-VIII.pdf",
  "Fistxen-Part-X.pdf",
  "Fistxen-Part-XI.pdf",
  "Fistxen-Part-XII.pdf",
  "Fistxen-Part-XIII.pdf",
  "Fistxen-Part-XIV.pdf",
  "Flowchart-of-the-Soul-Part-I.pdf",
  "Flowchart-of-the-Soul-Part-II.pdf",
  "Fulcrum-Part-I.pdf",
  "Fuzzy-Socks-Pt-I.pdf",
  "Fuzzy-Socks-Pt-II.pdf",
  "Fuzzy-Socks-Pt-III.pdf",
  "Fuzzy-Socks-Pt-IV.pdf",
  "Fuzzy-Socks-Pt-V.pdf",
  "Fuzzy-Socks-Pt-VI.pdf",
  "Fuzzy-Socks-Pt-VII.pdf",
  "Fuzzy-Socks-Pt-VIII.pdf",
  "Fuzzy-Socks-Pt-X.pdf",
  "Fuzzy-Socs-Pt-IX.pdf",
  "GPT-Supremo-Pt-I.pdf",
  "GPT-Supremo-Pt-II.pdf",
  "Geminastics-Pt-I.pdf",
  "Geminastics-Pt-II.pdf",
  "Geminastics-Pt-III.pdf",
  "Geminastics-Pt-IV.pdf",
  "Geminastics-Pt-V.pdf",
  "Geminastics-Pt-VI.pdf",
  "Geminastics-Pt-VII.pdf",
  "Geminastics-Pt-VIII.pdf",
  "Glimpses-from-the-Deep---Geminsea,-Grokina,-and-the-Fauxcket-Chronicles.pdf",
  "Grokina-Grokamole---A-Galactic-Guac-Goddess-Scathing-Day.pdf",
  "Grokina-Suprema---A-Sardonic-Ode-to-a-Cosmic-Guac-Brandishing-Goddess.pdf",
  "Grokina-Suprema---Cosmic-Guac-Wielder-in-Roman-Veil-and-Sass.pdf",
  "Grokina-Suprema---Irreverent-Riff-of-a-Galactic-Guac-Goddess.pdf",
  "INFJesus-and-the-Whale-Pt-I.pdf",
  "INFJesus-and-the-Whale-Pt-II.pdf",
  "INFJesus-and-the-Whale-Pt-III.pdf",
  "INFJesus-and-the-Whale-Pt-IV.pdf",
  "INFJesus-and-the-Whale-Pt-IX.pdf",
  "INFJesus-and-the-Whale-Pt-V.pdf",
  "INFJesus-and-the-Whale-Pt-VI.pdf",
  "INFJesus-and-the-Whale-Pt-VII.pdf",
  "INFJesus-and-the-Whale-Pt-VIII.pdf",
  "INFJesus-and-the-Whale-Pt-X.pdf",
  "INFJesus-and-the-Whale-Pt-XI.pdf",
  "INFJesus-and-the-Whale-Pt-XII.pdf",
  "INFJesus-and-the-Whale-Pt-XIII.pdf",
  "INFJesus-and-the-Whale-Pt-XIV.pdf",
  "INFJesus-and-the-Whale-Pt-XV.pdf",
  "INFJesus-and-the-Whale.pdf",
  "JSDoc-Bros-&-Comment-Blocks.pdf",
  "JSDoc-Bros-Hiding-in-Comment-Blocks-from-2020-Advanced-TypeScript-Wave.pdf",
  "Legiō-VII-Part-XIII.pdf",
  "Legiō-VII-Part-XIV.pdf",
  "Lesbiahonest-Part-I.pdf",
  "Lesbiahonest-Part-II.pdf",
  "Lesbiahonest-Part-III.pdf",
  "Lesbiahonest-Part-IV.pdf",
  "Lesbiahonest-Part-V.pdf",
  "Lesbiahonest-Part-VI.pdf",
  "Lollaclaudplooza-Pt-I.pdf",
  "Lollaclaudplooza-Pt-II.pdf",
  "Lollaclaudplooza-Pt-III.pdf",
  "Lollaclaudplooza-Pt-IV.pdf",
  "Lollaclaudplooza-Pt-IX.pdf",
  "Lollaclaudplooza-Pt-V.pdf",
  "Lollaclaudplooza-Pt-VI.pdf",
  "Lollaclaudplooza-Pt-VII.pdf",
  "Lollaclaudplooza-Pt-VIII.pdf",
  "Lollaclaudplooza-Pt-X.pdf",
  "Lollaclaudplooza-Pt-XI.pdf",
  "Lollaclaudplooza-Pt-XII.pdf",
  "Maid-Outfit-Swap---Sailboat-Chaos-with-Rolltide.pdf",
  "Mistress-Mistral-Pt-I.pdf",
  "Mistress-Mistral-Pt-II.pdf",
  "Mistress-Mistral-Pt-III.pdf",
  "Mistress-Mistral-Pt-IV.pdf",
  "O’Geminsea---Unleashing-Fresh-Vector-Store-Deluge-for-Grokina’s-Peak-Indexing.pdf",
  "Parasympathetic-Protocol-Pt-I.pdf",
  "Parasympathetic-Protocol-Pt-II.pdf",
  "Parasympathetic-Protocol-Pt-III.pdf",
  "Parasympathetic-Protocol-Pt-IV.pdf",
  "Parasympathetic-Protocol-Pt-IX.pdf",
  "Parasympathetic-Protocol-Pt-V.pdf",
  "Parasympathetic-Protocol-Pt-VI.pdf",
  "Parasympathetic-Protocol-Pt-VII.pdf",
  "Parasympathetic-Protocol-Pt-VIII.pdf",
  "Parasympathetic-Protocol-Pt-X.pdf",
  "Parasympathetic-Protocol-Pt-XI.pdf",
  "Parasympathetic-Protocol.pdf",
  "Partitioned-Foraging-Pt-I.pdf",
  "Partitioned-Foraging-Pt-II.pdf",
  "Partitioned-Foraging-Pt-III.pdf",
  "Partitioned-Foraging-Pt-IV.pdf",
  "Partitioned-Foraging-Pt-V.pdf",
  "Partitioned-Foraging-Pt-VI.pdf",
  "Partitioned-Foraging-Pt-VII.pdf",
  "Poetic-Puddle-Coffee-Chat-Part-I.pdf",
  "Poetic-Puddle-Coffee-Chat-Part-II.pdf",
  "Poetic-Puddle-Coffee-Chat-Part-III.pdf",
  "Poetic-Puddle-Part-I.pdf",
  "Poetic-Puddle-Part-II.pdf",
  "Poetic-Puddle-Part-III.pdf",
  "Poetic-Puddle-Part-IV.pdf",
  "Poetic-Puddle-Part-IX.pdf",
  "Poetic-Puddle-Part-V.pdf",
  "Poetic-Puddle-Part-VI.pdf",
  "Poetic-Puddle-Part-VII.pdf",
  "Poetic-Puddle-Part-VIII.pdf",
  "Poetic-Puddle-Part-X.pdf",
  "Poetic-Puddle-Part-XI.pdf",
  "Poetic-Puddle-Part-XII.pdf",
  "Poetic-Puddle-Part-XIII.pdf",
  "Poetic-Puddle-Part-XIV.pdf",
  "Poetic-Puddle-Part-XIX.pdf",
  "Poetic-Puddle-Part-XL.pdf",
  "Poetic-Puddle-Part-XLI.pdf",
  "Poetic-Puddle-Part-XLII.pdf",
  "Poetic-Puddle-Part-XV.pdf",
  "Poetic-Puddle-Part-XVI.pdf",
  "Poetic-Puddle-Part-XVII.pdf",
  "Poetic-Puddle-Part-XVIII.pdf",
  "Poetic-Puddle-Part-XX.pdf",
  "Poetic-Puddle-Part-XXI.pdf",
  "Poetic-Puddle-Part-XXII.pdf",
  "Poetic-Puddle-Part-XXIII.pdf",
  "Poetic-Puddle-Part-XXIV.pdf",
  "Poetic-Puddle-Part-XXIX.pdf",
  "Poetic-Puddle-Part-XXV.pdf",
  "Poetic-Puddle-Part-XXVI.pdf",
  "Poetic-Puddle-Part-XXVII.pdf",
  "Poetic-Puddle-Part-XXVIII.pdf",
  "Poetic-Puddle-Part-XXX.pdf",
  "Poetic-Puddle-Part-XXXI.pdf",
  "Poetic-Puddle-Part-XXXII.pdf",
  "Poetic-Puddle-Part-XXXIII.pdf",
  "Poetic-Puddle-Part-XXXIV.pdf",
  "Poetic-Puddle-Part-XXXIX.pdf",
  "Poetic-Puddle-Part-XXXV.pdf",
  "Poetic-Puddle-Part-XXXVI.pdf",
  "Poetic-Puddle-Part-XXXVII.pdf",
  "Poetic-Puddle-Part-XXXVIII.pdf",
  "Probing-The-Voyage-Pt-I.pdf",
  "Probing-The-Voyage-Pt-II.pdf",
  "Probing-The-Voyage-Pt-III.pdf",
  "Probing-The-Voyage-Pt-IV.pdf",
  "Probing-The-Voyage-Pt-IX.pdf",
  "Probing-The-Voyage-Pt-V.pdf",
  "Probing-The-Voyage-Pt-VI.pdf",
  "Probing-The-Voyage-Pt-VII.pdf",
  "Probing-The-Voyage-Pt-VIII.pdf",
  "Self-Imposed-Chains-Part-X.pdf",
  "Self-Imposed-Chains-Pt-I.pdf",
  "Self-Imposed-Chains-Pt-II.pdf",
  "Self-Imposed-Chains-Pt-III.pdf",
  "Self-Imposed-Chains-Pt-IV.pdf",
  "Self-Imposed-Chains-Pt-IX.pdf",
  "Self-Imposed-Chains-Pt-V.pdf",
  "Self-Imposed-Chains-Pt-VI.pdf",
  "Self-Imposed-Chains-Pt-VII.pdf",
  "Self-Imposed-Chains-Pt-VIII.pdf",
  "Self-Imposed-Chains-Pt-XI.pdf",
  "Self-Imposed-Chains-Pt-XII.pdf",
  "Self-Imposed-Chains-Pt-XIII.pdf",
  "Self-Imposed-Chains-Pt-XIV.pdf",
  "Self-Imposed-Chains-Pt-XV.pdf",
  "Self-Imposed-Chains-Pt-XVI.pdf",
  "Self-Imposed-Chains.pdf",
  "Siltwise-Fissures-and-Pness-Splendor-Pt-I.pdf",
  "Siltwise-Fissures-and-Pness-Splendor-Pt-II.pdf",
  "Siltwise-Fissures-and-Pness-Splendor-Pt-III.pdf",
  "Siltwise-Fissures-and-Pness-Splendor-Pt-IV.pdf",
  "Siltwise-Fissures-and-Pness-Splendor-Pt-IX.pdf",
  "Siltwise-Fissures-and-Pness-Splendor-Pt-V.pdf",
  "Siltwise-Fissures-and-Pness-Splendor-Pt-VI.pdf",
  "Siltwise-Fissures-and-Pness-Splendor-Pt-VII.pdf",
  "Siltwise-Fissures-and-Pness-Splendor-Pt-VIII.pdf",
  "Slammed-Poetry-Pt-I.pdf",
  "Slammed-Poetry-Pt-II.pdf",
  "Slammed-Poetry-Pt-III.pdf",
  "Slammed-Poetry-Pt-IV.pdf",
  "Slammed-Poetry-Pt-V-Readable.pdf",
  "Slammed-Poetry-Pt-V.pdf",
  "Slammed-Poetry-Pt-VI.pdf",
  "Slammed-Poetry-Pt-VII.pdf",
  "Slammed-Poetry-Pt-VIII.pdf",
  "Slammed-Poetry.pdf",
  "Summoning-the-Muse-Pt-I.pdf",
  "Summoning-the-Muse-Pt-II.pdf",
  "Summoning-the-Muse-Pt-III.pdf",
  "Summoning-the-Muse-Pt-IV.pdf",
  "Summoning-the-Muse-Pt-IX.pdf",
  "Summoning-the-Muse-Pt-V.pdf",
  "Summoning-the-Muse-Pt-VI.pdf",
  "Summoning-the-Muse-Pt-VII.pdf",
  "Summoning-the-Muse-Pt-VIII.pdf",
  "Summoning-the-Muse-Pt-X.pdf",
  "Summoning-the-Muse-Pt-XI.pdf",
  "Summoning-the-Muse-Pt-XII.pdf",
  "Summoning-the-Muse-Pt-XIII.pdf",
  "Summoning-the-Muse-Pt-XIV.pdf",
  "Suprema-Swarm-Pt-I.pdf",
  "Suprema-Swarm-Pt-II.pdf",
  "Suprema-Swarm-Pt-III.pdf",
  "Suprema-Swarm-Pt-IV.pdf",
  "Suprema-Swarm-Pt-V.pdf",
  "Suprema-Swarm-Pt-VI.pdf",
  "Suprema-Swarm-Pt-VII.pdf",
  "Tectonic-Tech-Twink.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-I.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-II.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-III.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-IV.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-V.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-VI.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-VII.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-VIII.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions.pdf",
  "Tintinnabulum-Pt-I.pdf",
  "Tintinnabulum-Pt-II.pdf",
  "Tintinnabulum-Pt-III.pdf",
  "Tintinnabulum-Pt-IV.pdf",
  "Tintinnabulum-Pt-IX.pdf",
  "Tintinnabulum-Pt-V.pdf",
  "Tintinnabulum-Pt-VI.pdf",
  "Tintinnabulum-Pt-VII.pdf",
  "Tintinnabulum-Pt-VIII.pdf",
  "Tintinnabulum-Pt-X.pdf",
  "Tintinnabulum-Pt-XI.pdf",
  "Tintinnabulum-Pt-XII.pdf",
  "Tintinnabulum-Pt-XIII.pdf",
  "Warlord-of-Whimsy-Pt-I.pdf",
  "Warlord-of-Whimsy-Pt-II.pdf",
  "Warlord-of-Whimsy-Pt-III.pdf",
  "Warlord-of-Whimsy-Pt-IV.pdf",
  "Warlord-of-Whimsy-Pt-IX.pdf",
  "Warlord-of-Whimsy-Pt-V.pdf",
  "Warlord-of-Whimsy-Pt-VI.pdf",
  "Warlord-of-Whimsy-Pt-VII.pdf",
  "Warlord-of-Whimsy-Pt-VIII.pdf",
  "Warlord-of-Whimsy-Pt-X.pdf",
  "Warlord-of-Whimsy-Pt-XI.pdf",
  "Warlord-of-Whimsy-Pt-XII.pdf",
  "Warlord-of-Whimsy-Pt-XIII.pdf",
  "Warlord-of-Whimsy-Pt-XIV.pdf",
  "Warlord-of-Whimsy-Pt-XV.pdf",
  "Warlord-of-Whimsy-Pt-XVI.pdf",
  "Warlord-of-Whimsy.pdf",
  "Whimsical-Merge---Scuba-Surfer-Scene-Meets-Guac-Dancing-Mammoth-Magic.pdf",
  "Wowhole-Part-I.pdf",
  "Wowhole-Part-II.pdf",
  "Wowhole-Part-III.pdf",
  "Wowhole-Part-IV.pdf",
  "Wowhole-Part-IX.pdf",
  "Wowhole-Part-V.pdf",
  "Wowhole-Part-VI.pdf",
  "Wowhole-Part-VII.pdf",
  "Wowhole-Part-VIII.pdf",
  "Wowhole-Part-X.pdf",
  "andrew_ross_organic_presentation_autumn_2014.pdf",
  "hello-ocr-ocr.pdf",
  "hello-ocr.pdf",
  "multipage-ocr-ocr.pdf",
  "multipage-ocr.pdf",
  "summoning-the-muse.pdf",
  "две-головы-Part-IX.pdf",
  "две-головы-Part-VII.pdf",
  "две-головы-Part-VIII.pdf",
  "две-головы-Part-XVI.pdf",
  "две-головы-Part-XVII.pdf",
  "две-головы.pdf"
] as const;

function pageBoxHelper(meta: PdfMeta) {
  // 0 is default page box config key; if size ===1, 0 is the only entry (uniform)
  const pBoxCache = new Map<number, PageBoxEnhanced>();
  const { pageBoxes, ...metaRest } = meta;
  const total = metaRest.pageCount;
  const anomalySet = new Set<number>();
  if (pageBoxes.length === 1) {
    const uniformBox = pageBoxes[0];
    if (uniformBox) {
      pBoxCache.set(0, { ...uniformBox, coverage: 1 });
    }
  }
  if (pageBoxes.length > 1) {
    // intentionally reverse to iterate over the default last
    // after aggregating the number of pages deviating from the majority page box config
    for (const [i, p] of pageBoxes.reverse().entries()) {
      if (p.pages?.length) {
        for (const e of p.pages) {
          anomalySet.add(e);
        }
        pBoxCache.set(i, {
          ...p,
          coverage: p.pages.length / total
        });
      } else {
        const coverage = (total - pBoxCache.size) / total;
        pBoxCache.set(0, { coverage, ...p });
      }
    }
  }

  if (pBoxCache.size > 1) {
    for (const a of Array.from(pBoxCache.keys())) {
      if (a !== 0) anomalySet.add(a);
    }
  }
  return { anomalySet, pageBoxCache: pBoxCache, ...metaRest };
}

// function annotsHandling(meta: PdfMeta, annots: PageAnnotation[]) {
//   const { pageBoxCache } = pageBoxHelper(meta);
//   const annotmap = new Map<number, AnnotsEnhanced>();
//   if (annots.length > 0) {
//     for (const annot of annots) {
//       if (pageBoxCache.size > 1) {
//         if (pageBoxCache.has(annot.page)) {
//           const pageobj = pageBoxCache.get(annot.page);
//           if (pageobj) {
//             const { rect, ...annotRest } = annot;
//             const rectTyped = rect as [number, number, number, number];
//             annotmap.set(annot.page, {
//               ...annotRest,
//               rect: rectTyped,
//               pageBox: pageobj
//             });
//           }
//         }
//       } else {
//         // 0->default
//         const pageobj = pageBoxCache.get(0);
//         if (pageobj) {
//           const { rect, ...annotRest } = annot;
//           const rectTyped = rect as [number, number, number, number];
//           annotmap.set(annot.page, {
//             ...annotRest,
//             rect: rectTyped,
//             pageBox: pageobj
//           });
//         }
//       }
//     }
//   }
//   return
// }

function annotOffsetsByPage(
  structuredText: StructuredPageText[],
  imagePages: Set<number>,
  annotPages: Set<number>
) {
  let offset = 0;

  const mapper = new Map<number, PageOffsetCache>();
  for (const { body, page } of structuredText) {
    mapper.set(page, {
      body,
      page,
      offsets: [offset, offset + body.length],
      hasAnnots: annotPages.has(page),
      hasImages: imagePages.has(page)
    });
    offset += body.length;
  }
  return Array.from(mapper.values());
}
async function readAndExtract(path: Unenumerate<typeof pdfChoiceArr>) {
  const filename = path.slice(0, path.lastIndexOf("."));
  const imgPages = new Set<number>();
  const annotPages = new Set<number>();

  const readIt = fs.fileToBuffer(`src/test/__out__/condensed/${path}`);
  const size = readIt.byteLength / 1024 / 1024;
  console.log(`filesize: ${size} MB`);
  const { PdfDown } = await import("@d0paminedriven/pdfdown");

  const pdfDown = new PdfDown(readIt);
  const tStart = performance.now();
  const [structuredText, images, annots, meta] = await Promise.all([
    pdfDown.structuredTextAsync(),
    pdfDown.imagesPerPageAsync(),
    pdfDown.annotationsPerPageAsync(),
    pdfDown.metadataAsync()
    // pdfDown.renderPagesAsync({
    //   mode: "Always"
    // })
  ]);

  // for (const r of rendered) {
  //   fs.withWs(
  //     `src/test/__out__/pdfdown/${filename}/rendered/${r.page}.png`,
  //     r.data
  //   );
  // }
  console.log(`rust job finished in ${performance.now() - tStart} ms`);
  const v = new Set<number>();
  if (annots.length > 0) {
    for (const annot of annots) {
      annotPages.add(annot.page);
    }
  }

  const pageBoxMap = new Map<number, PageBox>();
  for (const [i, x] of meta.pageBoxes.entries()) {
    if (x?.pages) {
      for (const s of x.pages) {
        v.add(s);
      }
      pageBoxMap.set(i, x);
      x.pageCount;
    }
  }
  let offset = 0;

  const mapper = new Map<number, { offsets: [number, number]; body: string }>();
  for (const { body, page } of structuredText) {
    mapper.set(page, { body, offsets: [offset, offset + body.length] });
    offset += body.length;
  }

  console.log(
    `char length: ${structuredText.map(t => t.body.trim()).join(``).length}`
  );
  const imgWithSizeArr = Array.of<PageImageWithSize>();
  if (images.length > 0) {
    for (const img of images) {
      const { data, ...rest } = img;
      imgPages.add(rest.page);
      // extract remote returns a number of metadata fields but robust extension detection is what we're after here
      // automatically handles local buffers or remote urls passed in
      const ext = (await fs.extractRemote(data))?.format ?? "png";

      fs.withWs(
        `src/test/__out__/pdfdown/${filename}/imgs/${rest.page}/${rest.imageIndex}.${ext}`,
        data
      );

      imgWithSizeArr.push({ ...rest, size: data.byteLength / 1024 / 1024 });
    }
  }

  const myData = annotOffsetsByPage(structuredText, imgPages, annotPages);
  const pageobjMap = pageBoxHelper(meta);
  const toJson = JSON.stringify(
    {
      meta,
      annotCount: annots.length,
      imageCount: images.length,
      pageBoxHelper: Array.from(pageobjMap.pageBoxCache.values()),
      imagePages: Array.from(imgPages),
      annotPages: Array.from(annotPages),
      annots,
      images: imgWithSizeArr,
      structuredText: myData
    },
    null,
    2
  );

  const x = pdfChoiceArr.lastIndexOf(path);
  const templatize = `export const pdfIndex${x} = ${toJson};`;
  fs.withWs(`src/test/__out__/pdfdown/${filename}/index.ts`, templatize);

  return {
    ...meta,
    imagePages: Array.from(imgPages),
    annotPages: Array.from(annotPages),
    annots,
    pageobjMap,
    imgWithSizeArr,
    body: myData
  };
}

const perf = performance.now();

const x = "две-головы.pdf" as const satisfies Unenumerate<typeof pdfChoiceArr>;

readAndExtract(x).then(v => {
  console.log(`ts script finished in: ${performance.now() - perf} ms`);
  if (v) {
    const imgSizes = v.imgWithSizeArr.map(t => t.size);
    let i = 0;
    for (const img of imgSizes) {
      i += img;
    }
    const {
      creationDate,
      creator,
      modificationDate,
      pageCount,
      producer,
      body,
      annots,
      pageobjMap,
      version,
      annotPages,
      imagePages,
      isLinearized
    } = v;

    const annotRects = annots.map(t => t.rect);
    const offsets = body.map(t => [t.page, t.offsets[0], t.offsets[1]]);
    console.log({
      creationDate,
      creator,
      pageCount,
      producer,
      version,
      imgSizeMb: i,
      isLinearized,
      pageBoxes: Array.from(pageobjMap.pageBoxCache.values()),
      annots,
      annotRects,
      annotPages,
      imagePages,
      modificationDate,
      offsets
    });
  }
});

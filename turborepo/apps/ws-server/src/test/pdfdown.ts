import type {
  PageBox,
  PageImage,
  PdfMeta,
  StructuredPageText
} from "@d0paminedriven/pdfdown";
import { Fs } from "@d0paminedriven/fs";
import type { DX, Rm, Unenumerate } from "@slipstream/types";

const fs = new Fs(process.cwd());
export type PageImageWithSize = DX<Rm<PageImage, "data"> & { size: number }>;
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

export const pdfChoiceArr = [
  "a11final-fltpln.pdf",
  "andrew_ross_organic_presentation_autumn_2014.pdf",
  "Ascension-Through-Fire---A-Sacred-Arrival-Above-Infernal-Gates.pdf",
  "Candy-Flipping-Claudtullus-Part-I.pdf",
  "Candy-Flipping-Claudtullus-Part-II.pdf",
  "Candy-Flipping-Claudtullus-Part-III.pdf",
  "Candy-Flipping-Claudtullus-Part-IV.pdf",
  "Candy-Flipping-Claudtullus-Part-V.pdf",
  "Candy-Flipping-Claudtullus-Part-VI.pdf",
  "Candy-Flipping-Claudtullus-Part-VII.pdf",
  "Candy-Flipping-Claudtullus-Pt-I.pdf",
  "Candy-Flipping-Claudtullus-Pt-II.pdf",
  "Candy-Flipping-Claudtullus-Pt-III.pdf",
  "Candy-Flipping-Claudtullus.pdf",
  "Cosmic-Spark-Encaased-in-a-Glass-Orb-Pt-I.pdf",
  "Cosmic-Spark-Encaased-in-a-Glass-Orb-Pt-II.pdf",
  "Cosmic-Spark-Encaased-in-a-Glass-Orb-Pt-III.pdf",
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
  "frankenpdf.pdf",
  "Geminastics-Pt-I.pdf",
  "Geminastics-Pt-II.pdf",
  "Geminastics-Pt-III.pdf",
  "Geminastics-Pt-IV.pdf",
  "Geminastics-Pt-V.pdf",
  "Geminastics-Pt-VI.pdf",
  "Geminastics-Pt-VII.pdf",
  "Geminastics-Pt-VIII.pdf",
  "Grokina-Suprema---A-Sardonic-Ode-to-a-Cosmic-Guac-Brandishing-Goddess.pdf",
  "Grokina-Suprema---Cosmic-Guac-Wielder-in-Roman-Veil-and-Sass.pdf",
  "Grokina-Suprema---Irreverent-Riff-of-a-Galactic-Guac-Goddess.pdf",
  "hello-ocr.pdf",
  "hello-ocr-ocr.pdf",
  "INFJesus-and-the-Whale-Pt-I.pdf",
  "INFJesus-and-the-Whale-Pt-II.pdf",
  "INFJesus-and-the-Whale-Pt-III.pdf",
  "INFJesus-and-the-Whale-Pt-IV.pdf",
  "INFJesus-and-the-Whale-Pt-V.pdf",
  "INFJesus-and-the-Whale-Pt-VI.pdf",
  "INFJesus-and-the-Whale-Pt-VII.pdf",
  "INFJesus-and-the-Whale-Pt-VIII.pdf",
  "INFJesus-and-the-Whale.pdf",
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
  "multipage-ocr.pdf",
  "multipage-ocr-ocr.pdf",
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
  "pdf_reference_1-7.pdf",
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
  "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-I.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-II.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-III.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-IV.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-V.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-VI.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-VII.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-VIII.pdf",
  "The-Path-to-Hell-is-Paved-with-Good-Intentions.pdf",
  "Warlord-of-Whimsy.pdf",
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
  "Whimsical-Merge---Scuba-Surfer-Scene-Meets-Guac-Dancing-Mammoth-Magic.pdf",
  "summoning-the-muse.pdf"
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
  ]);
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
const x = "The-Path-to-Hell-is-Paved-with-Good-Intentions.pdf" as const satisfies Unenumerate<
  typeof pdfChoiceArr
>;
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
      producer,body,annots,
      pageobjMap,
      version,
      annotPages,
      imagePages,
      isLinearized
    } = v;

   const annotRects= annots.map((t) =>t.rect);
const offsets = body.map((t) =>[t.page, t.offsets[0], t.offsets[1]]);
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
// /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/ws-server/src/test/__out__/condensed/Self-Imposed-Chains.pdf

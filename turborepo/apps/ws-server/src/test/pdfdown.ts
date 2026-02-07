import type { PageImage } from "@d0paminedriven/pdfdown";
import { Fs } from "@d0paminedriven/fs";
import type { DX, Rm, Unenumerate } from "@slipstream/types";

const fs = new Fs(process.cwd());
export type PageImageWithSize = DX<Rm<PageImage, "data"> & { size: number }>;

export const pdfChoiceArr = [
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

  if (annots.length > 0) {
    for (const annot of annots) {
      annotPages.add(annot.page);
    }
  }
  console.log(
    `char length: ${structuredText.map(t => t.body).join(`\n\n`).length}`
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
  const body = structuredText.map(t => ({ [t.page]: t.body }));
  const toJson = JSON.stringify(
    {
      meta,
      imagePages: Array.from(imgPages),
      annotPages: Array.from(annotPages),
      annots,
      images: imgWithSizeArr,
      structuredText: body
    },
    null,
    2
  );
  const x = pdfChoiceArr.findIndex(s => s === path);
  const templatize = `export const pdfIndex${x} = ${toJson};`;
  fs.withWs(`src/test/__out__/pdfdown/${filename}/index.ts`, templatize);

  return {
    ...meta,
    imagePages: Array.from(imgPages),
    annotPages: Array.from(annotPages),
    annots,
    imgWithSizeArr,
    body
  };
}
const perf = performance.now();
readAndExtract("Warlord-of-Whimsy-Pt-I.pdf").then(v => {
  console.log(`ts script finished in: ${performance.now() - perf} ms`);
  if (v.creationDate && v.creator && v.producer) {
    const imgSizes = v.imgWithSizeArr.map(t => t.size);
    let i = 0;
    for (const img of imgSizes) {
      i += img;
    }
    const {
      creationDate,
      creator,
      pageCount,
      producer,
      version,
      annotPages,
      imagePages,
      isLinearized
    } = v;

    console.log({
      creationDate,
      creator,
      pageCount,
      producer,
      version,
      imgSizeMb: i,
      isLinearized,
      annotPages,
      imagePages
    });
  }
});
// /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/ws-server/src/test/__out__/condensed/Self-Imposed-Chains.pdf

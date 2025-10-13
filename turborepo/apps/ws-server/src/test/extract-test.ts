import { Fs } from "@d0paminedriven/fs";
import type { ExpandedDocSpecs, ExpandedImgSpecs } from "@slipstream/metadata";
import { Extract } from "@slipstream/metadata";

const extract = new Extract();

const mapper = [
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759612202052-pollingplaces_6_28_2022_19_13_50.xlsx",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758924156875-nice.gif",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759573423056-Poem_29_notes.docx",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759132826137-1759114340631-grok-video-ba76af9e-7820-4007-b9bd-0ea4f16dfdd9_1_.png",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758866145748-aicoalesce-og-final-II-scaled.png",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758787287505-Catullus_and_Lucan_on_Pompey_and_Caesar.docx",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758923529552-aicoalesce-vivified.png",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760031788040-typescript-in-50-lessons.pdf",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759137029117-IMG_4038.jpg",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759114340631-grok-video-ba76af9e-7820-4007-b9bd-0ea4f16dfdd9.png",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758787287506-Lucans_Pharsalia_1.129-157.docx",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760192077067-many-dildos.webp",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759640772691-minotaur.pdf",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759136462353-grok-video-7b9c6db1-6ff8-4da7-9278-f29837c6ca44.png",
  "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759051021488-grok-video-7b9c6db1-6ff8-4da7-9278-f29837c6ca44.png",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758789194213-A_Day_in_Grokina_Grokamole_s_Truthful_Catullan_Vibe.pdf"
];


(async (mapper: string[]) => {
  const arr = Array.of<ExpandedDocSpecs | ExpandedImgSpecs>();
  for (const target of mapper) {
    arr.push(await extract.extractRemote(target, 4096 * 24));
  }
  return arr;
})(mapper).then(v => {
  const fs = new Fs(process.cwd());
  if (!v) {
    throw new Error("no value returned");
  } else {
    console.log(v);
    fs.withWs(
      "src/test/__out__/extractor-data/test.json",
      JSON.stringify(v, null, 2)
    );
    return v;
  }
});

import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

class Data extends Fs {
  constructor() {
    super(process.cwd());
  }
  public data = async (env: string) => {
    const { PrismaClient } = await import(
      "@slipstream/db/node/generated/client"
    );
    const prismaClient = new PrismaClient({ datasourceUrl: env });
    try {
      prismaClient.$connect();
      return await prismaClient.attachment.findMany({
        take: 1000,
        orderBy: { createdAt: "asc" },
        select: {
          cdnUrl: true,
          compatCdnUrl: true,
          mime: true,
          compatMime: true,
          ext: true,
          compatExt: true
        }
      });
    } catch (err) {
      console.error(err);
    } finally {
      prismaClient.$disconnect();
    }
  };

  public async Prod() {
    let compatCounts: Record<string, number> = {};
    let compatExtCounts: Record<string, number> = {};
    let counts: Record<string, number> = {};
    let extCounts: Record<string, number> = {};
    const { Credentials } = await import("@slipstream/credentials");
    const cred = new Credentials();
    const env = await cred.get("DIRECT_URL");
    const s = await this.data(env);
    if (!s) throw new Error("no data returned");

    const assets = (
      s.filter(
        t =>
          t.cdnUrl !== null &&
          t.mime !== null &&
          t.ext !== null &&
          !t.cdnUrl.startsWith("https://assets.d0paminedriven") &&
          !t.cdnUrl.startsWith("https://ws-server-assets-prod")
      ) as {
        cdnUrl: string;
        compatMime: string | null;
        compatExt: string | null;
        compatCdnUrl: string | null;
        ext: string;
        mime: string;
      }[]
    ).map(v => {
      counts[v.mime] = (counts[v.mime] ?? 0) + 1;
      extCounts[v.ext] = (extCounts[v.ext] ?? 0) + 1;
      return { url: v.cdnUrl, mime: v.mime, ext: v.ext };
    });

    const compatAssets = (
      s.filter(
        t =>
          t.compatMime !== null &&
          t.compatExt !== null &&
          t.compatCdnUrl !== null &&
          !t.compatCdnUrl.startsWith("https://assets.d0paminedriven")
      ) as {
        cdnUrl: string | null;
        compatMime: string;
        compatExt: string;
        compatCdnUrl: string;
        ext: string | null;
        mime: string | null;
      }[]
    ).map(v => {
      compatCounts[v.compatMime] = (compatCounts[v.compatMime] ?? 0) + 1;
      compatExtCounts[v.compatExt] = (compatExtCounts[v.compatExt] ?? 0) + 1;
      return {
        compatUrl: v.compatCdnUrl,
        compatMime: v.compatMime,
        compatExt: v.compatExt
      };
    });

    const data = {
      nonCompat: { mime: counts, ext: extCounts },
      compat: { mime: compatCounts, ext: compatExtCounts }
    };

    const map = assets.map((t, i) => {
      // prettier-ignore
      return `${i++}
url="${t.url}"
mime="${t.mime}"
ext="${t.ext}"`
    });
    const cMap = compatAssets.map((t, i) => {
      // prettier-ignore
      return `${i++}
url="${t.compatUrl}"
mime="${t.compatMime}"
ext="${t.compatExt}"`
    });
    this.withWs(
      `src/test/__out__/aggregate/asset-counts.json`,
      JSON.stringify(data, null, 2)
    );
    this.withWs(`src/test/__out__/aggregate/assets-data.txt`, map.join("\n\n"));
    this.withWs(
      `src/test/__out__/aggregate/assets.json`,
      JSON.stringify(assets, null, 2)
    );
    this.withWs(
      `src/test/__out__/aggregate/compat-assets-data.txt`,
      cMap.join("\n\n")
    );
    this.withWs(
      `src/test/__out__/aggregate/compat-assets.json`,
      JSON.stringify(compatAssets, null, 2)
    );
    return { assets, compatAssets };
  }
}

new Data().Prod().then(v => {
  console.log({
    nonCompat: v.assets.length ?? 0,
    compat: v.compatAssets.length ?? 0
  });
  return v;
});

// const mapper = [
//   "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759612202052-pollingplaces_6_28_2022_19_13_50.xlsx",
//   "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758924156875-nice.gif",
//   "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759573423056-Poem_29_notes.docx",
//   "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759132826137-1759114340631-grok-video-ba76af9e-7820-4007-b9bd-0ea4f16dfdd9_1_.png",
//   "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758866145748-aicoalesce-og-final-II-scaled.png",
//   "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758787287505-Catullus_and_Lucan_on_Pompey_and_Caesar.docx",
//   "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758923529552-aicoalesce-vivified.png",
//   "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760031788040-typescript-in-50-lessons.pdf",
//   "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759137029117-IMG_4038.jpg",
//   "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759114340631-grok-video-ba76af9e-7820-4007-b9bd-0ea4f16dfdd9.png",
//   "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758787287506-Lucans_Pharsalia_1.129-157.docx",
//   "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760192077067-many-dildos.webp",
//   "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759640772691-minotaur.pdf",
//   "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759136462353-grok-video-7b9c6db1-6ff8-4da7-9278-f29837c6ca44.png",
//   "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759051021488-grok-video-7b9c6db1-6ff8-4da7-9278-f29837c6ca44.png",
//   "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758789194213-A_Day_in_Grokina_Grokamole_s_Truthful_Catullan_Vibe.pdf"
// ];

// (async (mapper: string[]) => {
//   const arr = Array.of<ExpandedDocSpecs | ExpandedImgSpecs>();
//   for (const target of mapper) {
//     arr.push(await extract.extractRemote(target, 4096 * 24));
//   }
//   return arr;
// })(mapper).then(v => {
//   const fs = new Fs(process.cwd());
//   if (!v) {
//     throw new Error("no value returned");
//   } else {
//     console.log(v);
//     fs.withWs(
//       "src/test/__out__/extractor-data/test.json",
//       JSON.stringify(v, null, 2)
//     );
//     return v;
//   }
// });

import { Fs } from "@d0paminedriven/fs";
import {
  ExpandedDocSpecs,
  ExpandedImgSpecs,
  Extract
} from "@d0paminedriven/metadata";
import * as dotenv from "dotenv";
import type {
  $Enums,
  DocumentMetadata,
  ImageMetadata
} from "@slipstream/db/node/generated/client";

type UserDrivenEnvRT = {
  assetType: $Enums.AssetType;
  cdnUrl: string | null;
  compatMime: string | null;
  compatExt: string | null;
  compatStatus: $Enums.CompatStatus | null;
  compatCdnUrl: string | null;
  size: bigint | null;
  ext: string | null;
  mime: string | null;
  image: {
    createdAt: Date;
    updatedAt: Date;
    attachmentId: string;
    format: $Enums.ImageFormat;
    width: number;
    height: number;
    aspectRatio: number | null;
    frames: number;
    hasAlpha: boolean | null;
    animated: boolean;
    orientation: number | null;
    colorSpace: $Enums.ColorSpace | null;
    exifDateTimeOriginal: Date | null;
    cameraMake: string | null;
    cameraModel: string | null;
    lensModel: string | null;
    gpsLat: number | null;
    gpsLon: number | null;
    dominantColorHex: string | null;
    iccProfile: string | null;
  } | null;
  document: {
    createdAt: Date;
    updatedAt: Date;
    attachmentId: string;
    format: string;
    pageCount: number | null;
    wordCount: number | null;
    language: string | null;
    title: string | null;
    author: string | null;
    subject: string | null;
    keywords: string[];
    pdfVersion: string | null;
    isEncrypted: boolean;
    isSearchable: boolean;
    encoding: string | null;
    lineCount: number | null;
    textPreview: string | null;
  } | null;
}[];

dotenv.config({ quiet: true });

class Data extends Fs {
  constructor(
    public targetEnv: "dev" | "prod",
    private extract: Extract
  ) {
    super(process.cwd());
  }
  public data = async (env: string) => {
    const { PrismaDbService } = await import("@slipstream/db/factory");
    const prismaClient = new PrismaDbService({ connectionString: env }).p(
      false
    );
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
          assetType: true,
          size: true,
          compatStatus: true,
          ext: true,
          compatExt: true,
          image: true,
          document: true
        }
      });
    } catch (err) {
      console.error(err);
    } finally {
      prismaClient.$disconnect();
    }
  };

  private async prodWorkup() {
    const { Credentials } = await import("@slipstream/credentials");
    const cred = new Credentials();
    const env = await cred.get("DIRECT_URL");
    const s = await this.data(env);
    if (!s) throw new Error("no data returned -- prod");
    return s;
  }

  private async devWorkup() {
    const cred = process.env.DIRECT_URL;
    if (!cred) throw new Error("DIRECT_URL env var not set in .env");
    const s = await this.data(cred);
    if (!s) throw new Error("no data returned -- dev");
    return s;
  }

  private async userDrivenEnv() {
    if (this.targetEnv === "dev") {
      return await this.devWorkup();
    } else return await this.prodWorkup();
  }

  public async exe() {
    let compatCounts: Record<string, number> = {};
    let compatExtCounts: Record<string, number> = {};
    let counts: Record<string, number> = {};
    let extCounts: Record<string, number> = {};
    let u = Array.of<string>();

    const s = (await this.userDrivenEnv()) satisfies UserDrivenEnvRT;
    try {
      const assets = (
        s.filter(
          t =>
            t.cdnUrl !== null &&
            t.mime !== null &&
            t.ext !== null &&
            !t.cdnUrl.startsWith("https://assets.d0paminedriven") &&
            !t.cdnUrl.startsWith("https://assets-dev.d0paminedriven") &&
            !t.cdnUrl.startsWith("https://ws-server-assets-dev") &&
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
            !t.compatCdnUrl.startsWith("https://assets.d0paminedriven") &&
            !t.compatCdnUrl.startsWith("https://assets-dev.d0paminedriven") &&
            !t.compatCdnUrl.startsWith("https://ws-server-assets-dev") &&
            !t.compatCdnUrl.startsWith("https://ws-server-assets-prod")
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

      const _media = (_target: keyof $Enums.AssetType) =>
        (
          s.filter(
            t =>
              t.assetType &&
              t.compatStatus !== null &&
              t.size !== null &&
              t.compatCdnUrl !== null &&
              t.compatExt !== null &&
              t.compatCdnUrl !== null &&
              !t.compatCdnUrl.startsWith("https://assets.d0paminedriven") &&
              !t.compatCdnUrl.startsWith("https://assets-dev.d0paminedriven") &&
              !t.compatCdnUrl.startsWith("https://ws-server-assets-dev") &&
              !t.compatCdnUrl.startsWith("https://ws-server-assets-prod") &&
              t.cdnUrl !== null &&
              t.mime !== null &&
              t.ext !== null &&
              !t.compatCdnUrl.startsWith("https://assets.d0paminedriven") &&
              !t.compatCdnUrl.startsWith("https://assets-dev.d0paminedriven") &&
              !t.compatCdnUrl.startsWith("https://ws-server-assets-dev") &&
              !t.compatCdnUrl.startsWith("https://ws-server-assets-prod")
          ) as {
            cdnUrl: string;
            compatMime: string;
            compatExt: string;
            compatCdnUrl: string;
            ext: string;
            mime: string;
            compatStatus: "FAILED" | "PENDING" | "ACTIVE" | "ALIASED";
            size: bigint;
            assetType: "DOCUMENT" | "IMAGE" | "VIDEO" | "AUDIO" | "UNKNOWN";
            image?: ImageMetadata;
            document?: DocumentMetadata;
          }[]
        ).map(v => {
          const {
            cdnUrl,
            compatCdnUrl,
            compatExt,
            compatMime,
            compatStatus,
            ext,
            mime,
            document,
            image,
            size: s
          } = v;

          const size = Number(s);
          if (v.assetType === "IMAGE" && typeof image !== "undefined") {
            const {
              width,
              height,
              iccProfile,
              animated,
              aspectRatio,
              colorSpace,
              hasAlpha,
              attachmentId,
              frames,
              exifDateTimeOriginal
            } = image;

            return {
              compatExt,
              compatMime,
              compatCdnUrl,
              attachmentId,
              compatStatus,
              cdnUrl,
              mime,
              ext,
              width,
              height,
              iccProfile,
              animated,
              aspectRatio: aspectRatio ?? width / height,
              colorSpace,
              hasAlpha,
              frames,
              exifDateTimeOriginal,
              size
            };
          } else if (
            v.assetType === "DOCUMENT" &&
            typeof document !== "undefined"
          ) {
            const {
              isSearchable,
              isEncrypted,
              keywords,
              pageCount,
              textPreview,
              pdfVersion,
              author,
              createdAt,
              lineCount,
              updatedAt,
              wordCount,
              title,
              attachmentId
            } = document;

            return {
              compatExt,
              compatMime,
              compatCdnUrl,
              attachmentId,
              compatStatus,
              cdnUrl,
              mime,
              ext,
              isSearchable,
              isEncrypted,
              keywords,
              pageCount,
              textPreview,
              pdfVersion,
              author,
              createdAt,
              lineCount,
              updatedAt,
              wordCount,
              title,
              size
            };
          }
          counts[v.mime] = (counts[v.mime] ?? 0) + 1;
          extCounts[v.ext] = (extCounts[v.ext] ?? 0) + 1;
          compatCounts[v.compatMime] = (compatCounts[v.compatMime] ?? 0) + 1;
          compatExtCounts[v.compatExt] =
            (compatExtCounts[v.compatExt] ?? 0) + 1;
          return {
            compatExt,
            compatMime,
            compatCdnUrl,
            size,
            compatStatus,
            cdnUrl,
            mime,
            ext
          };
        });

      const urlsOnly = (
        s.filter(
          t =>
            t.cdnUrl !== null &&
            !t.cdnUrl.startsWith("https://assets-dev.d0paminedriven") &&
            !t.cdnUrl.startsWith("https://assets.d0paminedriven") &&
            !t.cdnUrl.startsWith("https://ws-server-assets-dev") &&
            !t.cdnUrl.startsWith("https://ws-server-assets-prod")
        ) as { cdnUrl: string }[]
      ).map(v => v.cdnUrl);

      const compatUrlsOnly = (
        s.filter(
          t =>
            t.compatCdnUrl !== null &&
            t.compatStatus !== null &&
            t.compatStatus === "ACTIVE" &&
            !t.compatCdnUrl.startsWith("https://assets.d0paminedriven") &&
            !t.compatCdnUrl.startsWith("https://assets-dev.d0paminedriven") &&
            !t.compatCdnUrl.startsWith("https://ws-server-assets-dev") &&
            !t.compatCdnUrl.startsWith("https://ws-server-assets-prod")
        ) as { compatCdnUrl: string }[]
      ).map(v => v.compatCdnUrl);
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
      const urls = [...urlsOnly, ...compatUrlsOnly];

      u = urls;
      this.withWs(
        `src/test/__out__/aggregate/${this.targetEnv}/asset-counts.json`,
        JSON.stringify(data, null, 2)
      );
      this.withWs(
        `src/test/__out__/aggregate/${this.targetEnv}/assets-data.txt`,
        map.join("\n\n")
      );
      this.withWs(
        `src/test/__out__/aggregate/${this.targetEnv}/assets.json`,
        JSON.stringify(assets, null, 2)
      );
      this.withWs(
        `src/test/__out__/aggregate/${this.targetEnv}/compat-assets-data.txt`,
        cMap.join("\n\n")
      );
      this.withWs(
        `src/test/__out__/aggregate/${this.targetEnv}/compat-assets.json`,
        JSON.stringify(compatAssets, null, 2)
      );
      const ss = JSON.stringify(urls, null, 2);
      this.withWs(
        `src/test/__out__/ts/${this.targetEnv}/cdn-url-bulk.ts`,
        `export const ${this.targetEnv}CdnUrls = ${ss}`
      );
      return { assets, compatAssets, urls };
    } catch (err) {
      const _e = err;
      throw new Error("something went wrong");
    } finally {
      const v = Array.of<ExpandedDocSpecs | ExpandedImgSpecs>();
      let i = 0;
      i < u.length;
      try {
        for (const uu of u) {
          v.push(await this.extract.extractRemote(uu, 4096 * 24));
        }
      } finally {
        this.withWs(
          `src/test/__out__/aggregate/agg/${this.targetEnv}/metadata.json`,
          JSON.stringify(v)
        );
      }
    }
  }
}

const extract = new Extract();
const argv3 = process.argv[3];

if (argv3 && (argv3 === "dev" || argv3 === "prod")) {
  new Data(argv3, extract).exe().then(v => {
    console.log({
      nonCompat: v.assets.length ?? 0,
      compat: v.compatAssets.length ?? 0
    });
    return v;
  });
}

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

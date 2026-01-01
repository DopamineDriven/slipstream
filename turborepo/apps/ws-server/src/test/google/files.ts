import type { File } from "@google/genai";
import { Fs } from "@d0paminedriven/fs";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

// const _genai = new GoogleGenAI({
//   apiKey: process.env.GOOGLE_API_KEY,
//   apiVersion: "v1alpha"
// });
const fs = new Fs(process.cwd());

const _arrToArrOfArrs = <const T>(
  arr: T[],
  int = 10,
  agg = Array.of<T[]>()
) => {
  for (let i = 0; i < arr.length; i++) {
    agg.push(arr.slice(i, i + int));
  }
  return agg;
};

async function* getAllGoogleFiles(apiKey?: string, limit = 10) {
  const genai = new GoogleGenAI({
    apiKey: apiKey,
    apiVersion: "v1alpha"
  });
  const pager = await genai.files.list({
    config: { pageSize: limit }
  });
  let has_more = true,
    count = 0,
    page_number = 0,
    page = pager.page;
  while (has_more) {
    has_more = pager.hasNextPage();
    count += page.length;

    yield {
      page,
      count,
      has_more,
      page_number
    };
    page_number += 1;
    if (!has_more) {
      break;
    }
    page = await pager.nextPage();
  }
}

// (async () => {
//   const arr = Array.of<File>();
//   const pager = await genai.files.list({ config: { pageSize: 10 } });
//   let page = pager.page;

//   while (true) {
//     console.log(page.length);
//     for (const file of page) {
//       arr.push(file);
//       console.log(file.name);
//     }
//     if (!pager.hasNextPage()) {
//       break;
//     }
//     page = await pager.nextPage();
//   }
//   return arr;
// })().then(data => {
//   const pages = _arrToArrOfArrs(data);
//   let i = 0;
//   i < pages.length;
//   for (const page of pages) {
//     fs.withWs(
//       `src/test/google/file-api-${i}.json`,
//       JSON.stringify(page, null, 2)
//     );
//     i++;
//   }
// });

async function handleGenerator() {
  const files = Array.of<File>();
  for await (const x of getAllGoogleFiles(process.env.GOOGLE_API_KEY)) {
    console.log(x.page.length);
    if (x.page.length > 0) {
      for (const page of x.page) {
        files.push(page);
      }
    }
  }
  fs.withWs(
    `src/test/google/file-api-files.json`,
    JSON.stringify(files, null, 2)
  );
}

handleGenerator();

// const data = async (env: string) => {
//   const { PrismaClient } = await import("@slipstream/db/node/generated/client");
//   const prismaClient = new PrismaClient({ datasourceUrl: env });
//   try {
//     prismaClient.$connect();
//     return await prismaClient.attachmentProvider.findMany({
//       where: { provider: "GEMINI" },
//       include: { attachment: true }
//     });
//   } catch (err) {
//     console.error(err);
//   } finally {
//     prismaClient.$disconnect();
//   }
// };

// const _toDelete = async (env: string, ids: string[]) => {
//   const { PrismaClient } = await import("@slipstream/db/node/generated/client");
//   const prismaClient = new PrismaClient({ datasourceUrl: env });
//   try {
//     prismaClient.$connect();
//     for (const id of ids) {
//       await prismaClient.attachmentProvider.delete({
//         where: { id }
//       });
//     }
//   } catch (err) {
//     console.error(err);
//   } finally {
//     prismaClient.$disconnect();
//   }
// };

// async function prod() {
//   const { Credentials } = await import("@slipstream/credentials");
//   const cred = new Credentials();
//   const _databaseUri = await cred.get("DIRECT_URL");
//   const nomatchArr = Array.of<string>();
//   const collectAllArr = Array.of<QueryRt>();
//   const g = (await import("@/test/google/file-api.json")).default;
//   const idsToDelete = await data(process.env.DIRECT_URL ?? "").then(v => {
//     if (!v) throw new Error("no data from db");
//     const names = g.map(t => t.name);
//     const handleBigInt = v.map(t => {
//       const { attachment, ...rest } = t;
//       const { size } = attachment;
//       const s = size ? Number(size) : null;

//       return {
//         ...rest,
//         size: t.size ? Number(t.size) : null,
//         attachment: { ...attachment, size: s }
//       };
//     });
//     for (const vv of handleBigInt) {
//       collectAllArr.push(vv);
//       if (vv.providerRef && !names.includes(vv.providerRef)) {
//         // console.log(vv.providerRef + " " + vv.expiresAt?.toISOString());
//         nomatchArr.push(vv.id);
//       }
//     }
//     return { nomatchArr, collectAllArr };
//   });
//   console.log(idsToDelete.nomatchArr);

//   const filteroutAttachmentss = idsToDelete.collectAllArr.map(t => {
//     const { attachment: _attachment, ...rest } = t;
//     return rest;
//   });
//   fs.withWs(
//     "src/test/__out__/google/data.json",
//     JSON.stringify(filteroutAttachmentss, null, 2)
//   );
//   //  return await toDelete(databaseUri, idsToDelete.nomatchArr);
// }

// (async () => {
//   const gFiles = prod();
//   return gFiles;
// })();

// type QueryRt = {
//   attachment: {
//     id: string;
//     mime: string | null;
//     size: number | null;
//     expiresAt: Date | null;
//     createdAt: Date;
//     updatedAt: Date;
//     conversationId: string | null;
//     draftId: string | null;
//     batchId: string | null;
//     generationGroupId: string | null;
//     seriesId: string | null;
//     userId: string;
//     messageId: string | null;
//     s3ObjectId: string | null;
//     origin: $Enums.AssetOrigin;
//     status: $Enums.AssetStatus;
//     uploadMethod: $Enums.UploadMethod;
//     assetType: $Enums.AssetType;
//     uploadDuration: number | null;
//     cdnUrl: string | null;
//     publicUrl: string | null;
//     sourceUrl: string | null;
//     thumbnailKey: string | null;
//     compatMime: string | null;
//     compatExt: string | null;
//     compatVersionId: string | null;
//     compatKey: string | null;
//     compatS3ObjectId: string | null;
//     compatStatus: $Enums.CompatStatus | null;
//     compatReadyAt: Date | null;
//     compatCdnUrl: string | null;
//     bucket: string;
//     key: string;
//     versionId: string | null;
//     region: string;
//     cacheControl: string | null;
//     contentDisposition: string | null;
//     contentEncoding: string | null;
//     filename: string | null;
//     ext: string | null;
//     etag: string | null;
//     checksumAlgo: $Enums.ChecksumAlgo;
//     checksumSha256: string | null;
//     storageClass: string | null;
//     sseAlgorithm: string | null;
//     sseKmsKeyId: string | null;
//     s3LastModified: Date | null;
//     deletedAt: Date | null;
//   };
// } & {
//   id: string;
//   attachmentId: string;
//   provider: Provider;
//   userKeyId: string | null;
//   keyFingerprint: string;
//   state: ProviderAssetState;
//   providerUri: string | null;
//   providerRef: string | null;
//   mime: string | null;
//   size: number | null;
//   readyAt: Date | null;
//   expiresAt: Date | null;
//   lastCheckedAt: Date | null;
//   errorCode: string | null;
//   errorMessage: string | null;
//   createdAt: Date;
//   updatedAt: Date;
// };

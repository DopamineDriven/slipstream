import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import type { $Enums } from "@slipstream/db/node/generated/client";

dotenv.config({ quiet: true });

const fs = new Fs(process.cwd());

const pl = async (provider: $Enums.Provider, userId: string) => {
  const { Credentials } = await import("@slipstream/credentials");
  const p = new Credentials();
  const datasourceUrl = await p.get("DIRECT_URL");
  const { PrismaClient } = await import("@slipstream/db/node/generated/client");
  const prismaClient = new PrismaClient({
    datasourceUrl
  });
  prismaClient.$connect();

  try {
    const attData = await prismaClient.attachment.findMany({
      where: {
        AND: [
          {
            providerLinks: { some: { provider } },
            userId
          }
        ]
      },
      select: {
        providerLinks: {
          where: { provider },
          select: { id: true }
        }
      }
    });

    const extract = Array.of<string>();
    for (const attDatum of attData) {
      for (const { id } of attDatum.providerLinks) {
        extract.push(id);
      }
    }
    const newDataArr = Array.of<{
      id: string;
      expiresAt: Date | null;
      size: number | null;
      mime: string | null;
      createdAt: Date;
      updatedAt: Date;
      provider: $Enums.Provider;
      attachmentId: string;
      userKeyId: string | null;
      keyFingerprint: string;
      state: $Enums.ProviderAssetState;
      providerUri: string | null;
      providerRef: string | null;
      readyAt: Date | null;
      lastCheckedAt: Date | null;
      errorCode: string | null;
      errorMessage: string | null;
    }>();
    if (extract.length > 0) {
      const arrAgg = Array.of<{
        attachmentId: string;
        provider: $Enums.Provider;
        userKeyId: string | null;
        keyFingerprint: string;
        state: $Enums.ProviderAssetState;
        providerUri: string | null;
        providerRef: string | null;
        mime: string | null;
        size: bigint | null;
        readyAt: Date | null;
        lastCheckedAt: Date | null;
        errorCode: string | null;
        errorMessage: string | null;
        createdAt: Date;
        updatedAt: Date;
        expiresAt: Date | null;
      }>();
      for (const id of extract) {
        const {
          id: _oldId,
          expiresAt: _expires,
          provider: _p,
          ...rest
        } = await prismaClient.attachmentProvider.delete({ where: { id } });
        arrAgg.push({ expiresAt: null, provider, ...rest });
      }
      if (arrAgg.length > 0) {
        for (const rec of arrAgg) {
          const newData = await prismaClient.attachmentProvider.create({
            data: rec
          });
          const recc = {
            ...newData,
            size: newData.size ? Number(newData.size) : null
          };
          newDataArr.push(recc);
        }
      }
    }
    return newDataArr;
  } catch {
    throw new Error("something went wrong...");
  } finally {
    prismaClient.$disconnect();
  }
};

// const data = async (provider: $Enums.Provider, userId: string) => {
//   const { Credentials } = await import("@slipstream/credentials");
//   const p = new Credentials();
//   const datasourceUrl = await p.get("DIRECT_URL");
//   const { PrismaClient } = await import("@slipstream/db/node/generated/client");
//   const prismaClient = new PrismaClient({
//     datasourceUrl: process.env.DIRECT_URL ?? datasourceUrl
//   });
//   prismaClient.$connect();
//   try {
//     const attData = await prismaClient.attachment.findMany({
//       where: {
//         OR: [
//           { providerStoreDocs: { some: { provider } }, userId },
//           { providerLinks: { some: { provider } }, userId }
//         ]
//       },
//       include: {
//         providerLinks: { where: { provider } },
//         providerStoreDocs: { where: { provider } }
//       }
//     });

//     const atts = attData.map(v => {
//       const providerLinksToReforge = Array.of<string>();
//       const { size, providerLinks, providerStoreDocs, ...rest } = v;
//       const docs = providerStoreDocs.map(t => {
//         const { size, ...docsRest } = t;
//         return {
//           ...docsRest,
//           size: size ? Number(size) : null
//         };
//       });
//       const files = providerLinks.map(t => {
//         const { size, ...filesRest } = t;
//         return {
//           ...filesRest,
//           size: size ? Number(size) : null
//         };
//       });
//       const rec = {
//         attIdsMissingFromDocs: Array.of<string>(),
//         attIdsMissingFromFiles: Array.of<string>()
//       };
//       const arrDisparity = Array.of<string>();

//       if (files.length < docs.length) {
//         for (const doc of docs) {
//           if (
//             files.findLastIndex(o => o.attachmentId === doc.attachmentId) === -1
//           ) {
//             rec.attIdsMissingFromFiles.push(doc.attachmentId);
//           }
//         }
//       }
//       if (docs.length < files.length) {
//         for (const file of files) {
//           if (
//             docs.findLastIndex(o => o.attachmentId === file.attachmentId) === -1
//           ) {
//             providerLinksToReforge.push(file.id);
//             rec.attIdsMissingFromDocs.push(file.attachmentId);
//           }
//         }
//       }

//       return {
//         arrDisparity: arrDisparity,
//         ...rest,
//         providerLinks: files,
//         providerDocs: docs,
//         size: size ? Number(size) : null
//       };
//     });
//     let data = await prismaClient.providerStore.findUniqueOrThrow({
//       where: { userId_provider: { userId, provider } }
//     });

//     let agg = 0;
//     for (const s of atts) {
//       for (const doc of s.providerDocs) {
//         if (doc.size) {
//           agg += doc.size;
//         }
//       }
//     }
//     const bytes = data.totalBytes ? Number(data.totalBytes) : 0;
//     if (agg - bytes !== 0) {
//       data = await prismaClient.providerStore.update({
//         where: {
//           userId_provider: {
//             provider: "GROK",
//             userId: "nrr6h4r4480f6kviycyo1zhf"
//           }
//         },
//         data: { fileCount: 22, totalBytes: BigInt(agg) }
//       });
//     }
//     const { totalBytes, ...resttt } = data;
//     return {
//       ...resttt,
//       totalBytes: totalBytes ? Number(totalBytes) : 0,
//       attachments: atts
//     };
//   } catch (err) {
//     throw new Error(
//       typeof err === "string"
//         ? err
//         : err instanceof Error
//           ? err.message
//           : "there was a problem in providerLinks test query..."
//     );
//   } finally {
//     prismaClient.$disconnect();
//   }
// };

// (async () => {
//   return await data("GROK", "nrr6h4r4480f6kviycyo1zhf");
// })().then(v => {
//   let agg = 0;
//   for (const s of v.attachments) {
//     for (const doc of s.providerDocs) {
//       if (doc.size) {
//         agg += doc.size;
//       }
//     }
//   }
//   console.log({
//     agg,
//     totalBytes: v.totalBytes,
//     totalFiles: v.fileCount
//   });
//   console.log(v.attachments.length);
//   const data = JSON.stringify(v, null, 2);
//   fs.withWs("src/test/__out__/xai/inspect/cross-compare/data.json", data);
// });

(async () => {
  return await pl("GROK", "nrr6h4r4480f6kviycyo1zhf");
})().then(v => {
  console.log(v.length);
  const toJson = JSON.stringify(v, null, 2);
  fs.withWs("src/test/__out__/xai/inspect/cross-compare/new-prod-recs.json", toJson);
  return v;
});

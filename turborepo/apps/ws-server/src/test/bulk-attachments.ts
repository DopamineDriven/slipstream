import { Fs } from "@d0paminedriven/fs";
import { ExpandedDocSpecs } from "@d0paminedriven/metadata";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

type Payload = {
  format: string;
  pageCount: number | null;
  isLinearized: boolean | null;
  pdfVersion: string | null;
  isEncrypted: boolean | undefined;
  isSearchable: boolean | undefined;
  encoding: string | null;
  author: string | null;
  keywords: string[] | undefined;
  textPreview: string | null;
  language: string | null;
  lineCount: number | null;
  subject: string | null;
  wordCount: number | null;
  createdAt: string | undefined;
};
type UpsertDocData = {
  upsert: {
    where: {
      attachmentId: string;
    };
    create: Payload;
    update: Payload;
  };
};

type UpdateAttachment = {
  where: { id: string };
  include: { document: true };
  data: { document: UpsertDocData };
};
const data = async () => {
  const { Credentials } = await import("@slipstream/credentials");
  const { Extract } = await import("@d0paminedriven/metadata");
  const extract = new Extract();
  const p = new Credentials();
  const datasourceUrlProd = await p.get("DIRECT_URL");
  const datasourceDev = process.env.DIRECT_URL ?? datasourceUrlProd;
  const { PrismaClient } = await import("@slipstream/db/node/generated/client");
  const prismaClient = new PrismaClient({
    datasourceUrl: datasourceDev
  });
  prismaClient.$connect();
  try {
    const data = await prismaClient.$transaction(async prisma => {
      const data = await prisma.attachment.findMany({
        take: 1000,
        where: {
          AND: [{ assetType: "DOCUMENT", document: { format: "pdf" } }]
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          cdnUrl: true,
          compatCdnUrl: true,
          mime: true,
          compatStatus: true,
          compatMime: true,
          ext: true,
          compatExt: true,
          document: true
        }
      });
      const arr = Array.of<UpdateAttachment>();

      for (const d of data) {
        if (d.compatStatus === "ACTIVE" && d.compatCdnUrl) {
          const getMeta = (await extract.extractRemote(
            d.compatCdnUrl,
            4096 * 256
          )) as ExpandedDocSpecs;
          const payload = {
            format: getMeta.format ?? "pdf",
            pageCount: getMeta.pageCount,
            isLinearized: getMeta.isLinearized,
            pdfVersion: getMeta.pdfVersion,
            isEncrypted: getMeta.isEncrypted ?? undefined,
            isSearchable: getMeta.isSearchable ?? undefined,
            encoding: getMeta.encoding,
            author: getMeta.author,
            keywords: getMeta.keywords ?? undefined,
            textPreview: getMeta.textPreview,
            language: getMeta.language,
            lineCount: getMeta.lineCount,
            subject: getMeta.subject,
            wordCount: getMeta.wordCount,
            createdAt: getMeta.createdDate ?? undefined
          };
          arr.push({
            where: { id: d.id },
            include: { document: true },
            data: {
              document: {
                upsert: {
                  where: { attachmentId: d.id },
                  create: payload,
                  update: payload
                }
              }
            }
          });
        }
        if (d.compatStatus === "ALIASED" && d.cdnUrl) {
          const getMeta = (await extract.extractRemote(
            d.cdnUrl,
            4096 * 256
          )) as ExpandedDocSpecs;
          const payload = {
            format: getMeta.format ?? "pdf",
            pageCount: getMeta.pageCount,
            isLinearized: getMeta.isLinearized,
            pdfVersion: getMeta.pdfVersion,
            isEncrypted: getMeta.isEncrypted ?? undefined,
            isSearchable: getMeta.isSearchable ?? undefined,
            encoding: getMeta.encoding,
            author: getMeta.author,
            keywords: getMeta.keywords ?? undefined,
            textPreview: getMeta.textPreview,
            language: getMeta.language,
            lineCount: getMeta.lineCount,
            subject: getMeta.subject,
            wordCount: getMeta.wordCount,
            createdAt: getMeta.createdDate ?? undefined
          };
          arr.push({
            where: { id: d.id },
            include: { document: true },
            data: {
              document: {
                upsert: {
                  where: { attachmentId: d.id },
                  create: payload,
                  update: payload
                }
              }
            }
          });
        }
      }

      return arr;
    });

    const tuple = Array.of<[string, number | null | undefined]>();
    for (const record of data) {
      const s = await prismaClient.attachment.update(record);
      tuple.push([s.id, s.document?.pageCount]);
    }
    return tuple;
  } catch (err) {
    throw new Error(
      typeof err === "string"
        ? err
        : err instanceof Error
          ? err.message
          : "there was a problem in providerLinks test query..."
    );
  } finally {
    prismaClient.$disconnect();
  }
};

const fs = new Fs(process.cwd());
(async () => {
  return await data();
})().then(v => {
  fs.withWs(
    "src/test/__out__/inspect/bulk/attachment-dev-update.json",
    JSON.stringify(v, null, 2)
  );
});

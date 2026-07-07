import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import type { AttachmentSingleton } from "@slipstream/types";

dotenv.config({ quiet: true });

async function getProdDb() {
  const { Credentials } = await import("@slipstream/credentials");
  const credentials = new Credentials();
  return await credentials.get("DIRECT_URL");
}

function devDb() {
  return process.env.DIRECT_URL;
}
function getInclude(assetType: "DOCUMENT" | "IMAGE" | "BOTH") {
  return assetType === "DOCUMENT"
    ? ({ imageGenOutput: true, document: true } as const)
    : assetType === "IMAGE"
      ? ({ imageGenOutput: true, image: true } as const)
      : ({
          imageGenOutput: true,
          document: true,
          image: true,
          audio: true
        } as const);
}

function getWhere(assetType: "DOCUMENT" | "IMAGE" | "BOTH") {
  const userId = "nrr6h4r4480f6kviycyo1zhf";
  return assetType === "DOCUMENT"
    ? ({ userId, assetType } as const)
    : assetType === "IMAGE"
      ? ({ userId, assetType } as const)
      : ({ userId } as const);
}
const data = async (
  target: "dev" | "prod" = "dev",
  assetType: "DOCUMENT" | "IMAGE" | "BOTH" = "BOTH"
) => {
  const where = getWhere(assetType);
  const include = getInclude(assetType);

  let datasourceUrl: string;
  const devString = devDb();
  if (target === "dev" && devString) {
    datasourceUrl = devString;
  } else {
    datasourceUrl = await getProdDb();
  }

  const { PrismaDbService } = await import("@slipstream/db/factory");
  const prismaClient = new PrismaDbService({
    connectionString: datasourceUrl
  }).p(false);
  prismaClient.$connect();
  try {
    const data = await prismaClient.attachment.findMany({
      where,
      take: 2500,
      include,
      orderBy: { createdAt: "desc" }
    });

    const dataMap = data.map(att => {
      const { size, ...attRest } = att;
      return { size: size ? Number(size) : null, ...attRest };
    });
    return dataMap satisfies AttachmentSingleton<true>[];
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
let s: "dev" | "prod";
let assetType: "IMAGE" | "DOCUMENT" | "BOTH";
if (process.argv[3] === "dev" || process.argv[3] === "prod") {
  if (process.argv[5] === "IMAGE" || process.argv[5] === "DOCUMENT")
    assetType = process.argv[5];
  else {
    assetType = "BOTH";
  }
  s = process.argv[3];
  data(s, assetType).then(v => {
    const urlArr = v.map(t => t.cdnUrl ?? "");
    const urlCompatArr = v.map(t => t.compatCdnUrl ?? "");
    const combinedUrls = urlArr.concat(urlCompatArr).filter(v => v.length > 1);
    const toJson = JSON.stringify(combinedUrls);
    const dir = assetType === "BOTH" ? "mixed" : `${assetType.toLowerCase()}s`;
    const _template = `export const ${s}PdfUrlArr=${toJson};`;
    fs.withWs(
      `src/test/__out__/attachments/${s}/${dir}/bulk.json`,
      JSON.stringify(v, null, 2)
    );
  });
}

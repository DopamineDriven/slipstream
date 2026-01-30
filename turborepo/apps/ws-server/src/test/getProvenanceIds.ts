import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import type { $Enums } from "@slipstream/db/node/generated/client";

dotenv.config({ quiet: true });

const fs = new Fs(process.cwd());

const data = async (env: "dev" | "prod") => {
  const { Credentials } = await import("@slipstream/credentials");
  const p = new Credentials();
  const datasourceUrlProd = await p.get("DIRECT_URL");
  const datasourceUrlDev = process.env.DIRECT_URL;
  const { PrismaClient } = await import("@slipstream/db/node/generated/client");
  const datasourceUrl =
    env === "dev" && datasourceUrlDev ? datasourceUrlDev : datasourceUrlProd;
  const prismaClient = new PrismaClient({
    datasourceUrl
  });
  prismaClient.$connect();
  try {
    const getMany = await prismaClient.providerStoreDocument.findMany({
      take: 1000,
      select: { filename: true, provider: true },
      where: { OR: [{ provider: "GEMINI" }, { provider: "GROK" }] }
    });

    const arrHelp = new Map<string, [number, $Enums.Provider[]]>();

    for (const d of getMany) {
      if (arrHelp.has(d.filename)) {
        const rec = arrHelp.get(d.filename);
        if (rec) {
          const providers = [...rec[1], d.provider].sort(
            (a, b) => a.localeCompare(b) - b.localeCompare(a)
          );
          arrHelp.set(d.filename, [providers.length, providers]);
        }
      } else {
        const providers = [d.provider];
        arrHelp.set(d.filename, [providers.length, providers]);
      }
    }

    const obj = Array.from(arrHelp.entries())
      .sort((a, b) => a[0].localeCompare(b[0]) - b[0].localeCompare(a[0]))
      .sort((a, b) => b[1][1].length - a[1][1].length);
    const improve = obj.map(([k, v]) => ({
      provenanceId: k,
      count: v[0],
      providers: v[1]
    }));
    fs.withWs(
      "src/test/__out__/inspect/provenanceIds/out.json",
      JSON.stringify(improve, null, 2)
    );
    return obj;
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

if (process.argv[3] === "dev" || process.argv[3] === "prod") {
  data(process.argv[3]);
}

// function jsonlToTmpWorkup(chunkProvenanceId: string){
//   const toTmpUniqueName = fs.uniqueTmpName(chunkProvenanceId, "jsonl");
//   fs.writeTmp(toTmpUniqueName,"jsonl-transcript-data");
//   // (0) (probably a good idea for forensics/Peace of Mind -- upload jsonl to s3/cloudfront for stable cdnUrl and absolute source of truth)
//   // (1) call voyage api to perform a fileupload WITH METADATA--use a readstream to upload (or convert to buffer or to Formdata File Object, whatever is required by api for file uploads)
//   // (2) once a number of jsonl files exist we call the batch api to feed voyage-context-3 metadata primed jsonl files--seems like it might work, maybe?
// }
// fs.withWs("", "")

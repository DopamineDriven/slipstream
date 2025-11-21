import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import type { $Enums } from "@slipstream/db/node/generated/client";

const _fs = new Fs(process.cwd());
dotenv.config({ quiet: true });

const data = async (provider: $Enums.Provider, userId: string) => {
  const { Credentials } = await import("@slipstream/credentials");
  const p = new Credentials();
  const datasourceUrl = await p.get("DIRECT_URL");
  const { PrismaClient } = await import("@slipstream/db/node/generated/client");
  const prismaClient = new PrismaClient({
    datasourceUrl
  });
  prismaClient.$connect();
  try {
    return await prismaClient.attachment.count({
      where: { AND: [{ providerLinks: { some: { provider } }, userId }] },
      select: { id: true }
    });
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

(async () => {
  return await data("GEMINI", "nrr6h4r4480f6kviycyo1zhf");
})().then(d => {
  console.log(d?.id ?? 0);
});

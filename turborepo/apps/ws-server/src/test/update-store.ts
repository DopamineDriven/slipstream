import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import type { $Enums } from "@slipstream/db/node/generated/client";

const fs = new Fs(process.cwd());
dotenv.config({ quiet: true });

const data = async (provider: $Enums.Provider, userId: string) => {
  const { Credentials } = await import("@slipstream/credentials");
  const p = new Credentials();
  const datasourceUrl = await p.get("DIRECT_URL");
  const { PrismaDbService } = await import("@slipstream/db/factory");
  const prismaClient = new PrismaDbService({
    connectionString: process.env.DIRECT_URL ?? datasourceUrl
  }).p(false);
  prismaClient.$connect();
  try {
    const data = await prismaClient.providerStore.findUniqueOrThrow({
      where: { userId_provider: { userId, provider } },
      include: { docs: { where: { provider } } }
    });
    const { totalBytes, docs, ...resttt } = data;
    const mapper = docs?.map(t => {
      const { size, ...rest } = t;
      return {
        ...rest,
        size: size ? Number(size) : null
      };
    });

    return {
      ...resttt,
      totalBytes: totalBytes ? Number(totalBytes) : null,
      docs: mapper
    };
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
  return await data("GROK", "nrr6h4r4480f6kviycyo1zhf");
})().then(d => {
  fs.withWs(
    "src/test/__out__/xai/provider-store-with-links/inspect.json",
    JSON.stringify(d, null, 2)
  );
  console.log(d ?? 0);
});

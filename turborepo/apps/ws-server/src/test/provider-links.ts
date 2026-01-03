import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import type { $Enums } from "@slipstream/db/node/generated/client";

const fs = new Fs(process.cwd());
dotenv.config({ quiet: true });

const data = async (provider: $Enums.Provider, userId: string) => {
  const { Credentials } = await import("@slipstream/credentials");
  const p = new Credentials();
  const datasourceUrl = await p.get("DIRECT_URL");
  const { PrismaClient } = await import("@slipstream/db/node/generated/client");
  const prismaClient = new PrismaClient({
    datasourceUrl: process.env.DIRECT_URL ?? datasourceUrl
  });
  prismaClient.$connect();
  try {
    const data = await prismaClient.attachment.findMany({
      take: 1000,
      where: { AND: [{ providerLinks: { some: { provider } }, userId }] },
      include: {
        providerLinks: {
          where: { provider }
        }
      }
    });
    const mapper = data.map(v => {
      const { providerLinks, size, ...rest } = v;
      const mapProviderLinks = providerLinks.map(vv => {
        const { size, ...resttt } = vv;
        return {
          ...resttt,
          size: size ? Number(size) : null
        };
      });

      return {
        ...rest,
        providerLinks: mapProviderLinks,
        size: size ? Number(size) : null
      };
    });
    return mapper;
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

(async (provider: $Enums.Provider) => {
  return await data(provider, "nrr6h4r4480f6kviycyo1zhf");
})("GROK").then(d => {
  fs.withWs(
    "src/test/__out__/xai/provider-links/inspect-it.json",
    JSON.stringify(d, null, 2)
  );
  console.log(d ?? 0);
});

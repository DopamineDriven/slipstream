import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const data = async () => {
  const { Credentials } = await import("@slipstream/credentials");
  const p = new Credentials();
  const datasourceUrl = await p.get("DIRECT_URL");
  const datasource = process.env.DIRECT_URL ?? datasourceUrl;
  const { PrismaClient } = await import("@slipstream/db/node/generated/client");
  const prismaClient = new PrismaClient({
    datasourceUrl: datasource
  });
  prismaClient.$connect();
  try {
    const data = await prismaClient.attachment.findMany({
      where: { userId: "nrr6h4r4480f6kviycyo1zhf" },
      take: 1000,
      orderBy: { createdAt: "desc" }
    });

    const dataMap = data.map(att => {
      const { size, ...attRest } = att;
      return { size: size ? Number(size) : null, ...attRest };
    });
    return dataMap;
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
    "src/test/__out__/attachments/dev/attachment-dev.json",
    JSON.stringify(v, null, 2)
  );
});

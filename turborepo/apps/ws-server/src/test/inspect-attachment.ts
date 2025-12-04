import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import { UserKeySingleton } from "@slipstream/types";

dotenv.config({ quiet: true });

const data = async () => {
  const { Credentials } = await import("@slipstream/credentials");
  const p = new Credentials();
  const datasourceUrl = await p.get("DIRECT_URL");
  const _datasource = process.env.DIRECT_URL ?? datasourceUrl;
  const { PrismaClient } = await import("@slipstream/db/node/generated/client");
  const prismaClient = new PrismaClient({
    datasourceUrl: datasourceUrl
  });
  prismaClient.$connect();
  try {
    const data = await prismaClient.attachment.findFirstOrThrow({
      where: {
        filename:
          {contains: "Candy-Flipping-Claudtullus-Pt-III"}
      },
      orderBy: { createdAt: "desc" },
      include: {
        providerLinks: { include: { userKey: true } },
        document: true,
        image: true,
        imageGenOutput: true
      }
    });

    const { size, ...p } = data;
    const mapProviderSingleton = p?.providerLinks?.map(v => {
      const { size, userKey, ...s } = v;
      return {
        userKey: userKey as undefined | UserKeySingleton<true>,
        size: size ? Number(size) : null,
        ...s
      };
    });

    return {
      ...p,
      size: size ? Number(size) : null,
      providerLinks: mapProviderSingleton
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

const fs = new Fs(process.cwd());
(async () => {
  return await data();
})().then(v => {
  fs.withWs(
    "src/test/__out__/inspect/xai/attachment-1.json",
    JSON.stringify(v, null, 2)
  );
});

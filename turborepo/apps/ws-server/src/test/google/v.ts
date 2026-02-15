import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import type { $Enums } from "@slipstream/db/node/generated/client";

const fs = new Fs(process.cwd());
dotenv.config({ quiet: true });

const data = async (provider: $Enums.Provider, userId: string) => {
  const { Credentials } = await import("@slipstream/credentials");
  const p = new Credentials();
  const _datasourceUrl = await p.get("DIRECT_URL");
  const { PrismaDbService: PrismaClient } =
    await import("@slipstream/db/factory");
  const prismaClient = new PrismaClient({
    connectionString: process.env.DIRECT_URL ?? _datasourceUrl
  }).p(false);
  try {
    prismaClient.$connect();
    return await prismaClient.attachment.findMany({
      where: { AND: [{ providerLinks: { some: { provider } }, userId }] },
      select: {
        id: true,
        providerLinks: {
          select: {
            id: true,
            keyFingerprint: true,
            expiresAt: true,
            providerRef: true,
            provider: true,
            userKeyId: true,
            createdAt: true,
            lastCheckedAt: true,
            providerUri: true
          }
        },
        key: true
      }
    });
  } catch (err) {
    console.error(err);
  } finally {
    prismaClient.$disconnect();
  }
};

async function Inspect(target: $Enums.Provider) {
  const d = await data(target, "nrr6h4r4480f6kviycyo1zhf");
  if (!d) return;
  const agg = Array.of<{
    id: string;
    attachmentId: string;
    expiresAt: Date | null;
    provider: $Enums.Provider;
    keyFingerprint: string;
    userKeyId: string | null;
    providerRef: string;
    isExpired: boolean;
    providerUri: string | null;
  }>();
  for (const dd of d) {
    if (dd.providerLinks.length > 0) {
      for (const ddd of dd.providerLinks) {
        if (ddd.provider === target && ddd.providerRef) {
          if (target !== "GEMINI") {
            agg.push({
              attachmentId: dd.id,
              expiresAt: ddd.expiresAt,
              id: ddd.id,
              keyFingerprint: ddd.keyFingerprint,
              provider: ddd.provider,
              providerRef: ddd.providerRef,
              isExpired:
                14 * 24 * 60 * 60 * 1000 <
                Math.abs(
                  Date.now() -
                    (ddd.lastCheckedAt?.getTime() ?? ddd.createdAt.getTime())
                ),
              userKeyId: ddd.userKeyId,
              providerUri: ddd.providerUri
            });
          }
          if (target === "GEMINI" && ddd.providerUri && ddd.expiresAt) {
            agg.push({
              attachmentId: dd.id,
              expiresAt: ddd.expiresAt,
              id: ddd.id,
              keyFingerprint: ddd.keyFingerprint,
              provider: ddd.provider,
              providerRef: ddd.providerRef,
              isExpired: ddd.expiresAt.getTime() < Date.now(),
              userKeyId: ddd.userKeyId,
              providerUri: ddd.providerUri
            });
          }
        }
      }
    }
  }
  fs.withWs(
    `src/test/google/__out__/${target.toLowerCase()}.json`,
    JSON.stringify(agg, null, 2)
  );

  return d;
}
if (
  process.argv[3] &&
  ["GEMINI", "GROK", "META", "ANTHROPIC", "OPENAI", "VERCEL"].includes(
    process.argv[3]
  )
) {
  Inspect(process.argv[3] as $Enums.Provider);
}

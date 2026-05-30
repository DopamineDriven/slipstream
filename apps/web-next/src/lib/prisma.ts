import { PrismaDbService } from "@slipstream/db/factory";

const prismaClientAccelerateSingleton = () => {
  const pc = new PrismaDbService({
    connectionString: process.env.DATABASE_URL ?? "",
    idleTimeoutMs: 30000,
    poolMax: 100
  });
  return pc.p(true);
};

const prismaClientSingleton = () => {
  const pc = new PrismaDbService({
    connectionString: process.env.DIRECT_URL ?? "",
    idleTimeoutMs: 30000,
    poolMax: 100
  });
  return pc.p(false);
};

declare global {
  var prisma: ReturnType<typeof prismaClientSingleton>;
  var prismaAccelerate: ReturnType<typeof prismaClientAccelerateSingleton>;
}

const prismaClient = globalThis.prisma ?? prismaClientSingleton();
const prismaClientAccelerate =
  globalThis.prismaAccelerate ?? prismaClientAccelerateSingleton();
if (process.env.NODE_ENV !== "production") globalThis.prisma = prismaClient;
if (process.env.NODE_ENV !== "production")
  globalThis.prismaAccelerate = prismaClientAccelerate;

export type PrismaClientBase = typeof prismaClient;
export type PrismaClientAccelerate = typeof prismaClientAccelerate;
export { prismaClient, prismaClientAccelerate };

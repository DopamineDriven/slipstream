import { getDbEdge } from "@slipstream/db/edge";

const prismaClientSingleton = () => {
  return getDbEdge({ connectionString: process.env.DATABASE_URL ?? "" });
};

declare global {
  var prisma: ReturnType<typeof prismaClientSingleton>;
}

export const prismaClient = globalThis.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") globalThis.prisma = prismaClient;

export type PrismaClientWithAccelerate = typeof prismaClient;

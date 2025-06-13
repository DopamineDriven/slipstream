import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["query", "info", "warn", "error"] });

declare global {
  // eslint-disable-next-line no-var
  var prismaClient: typeof prisma;
}

if (process.env.NODE_ENV !== "production") global.prismaClient = prisma;

export default prisma;

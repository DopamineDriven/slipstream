import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaClient } from "./generated/prisma-edge/client";

export type GetDbParams = {
  connectionString: string;
};
export function getDbEdge({ connectionString }: GetDbParams) {
  const prisma = new PrismaClient({
    datasourceUrl: connectionString
  }).$extends(withAccelerate());

  return prisma;
}

export type { PrismaClient } from './generated/prisma-edge/client';

import { prismaClient } from "@/lib/prisma";
import * as dotenv from "dotenv";
dotenv.config();

export async function getExisting(userId: string) {
  return await prismaClient.userKey.findMany({ where: { userId } });
}

getExisting("x1sa9esbc7nb1bbhnn5uy9ct");

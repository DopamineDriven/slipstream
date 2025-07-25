import { prismaClient } from "@/lib/prisma";
// import * as dotenv from "dotenv";

// dotenv.config({ path: relative(process.cwd(), ".env") });

export async function getExisting(userId: string) {
  const start = performance.now();

  return await prismaClient.conversation
    .findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      cacheStrategy: {swr: 3600, ttl:60}
    })
    .then(t => {
      console.log(performance.now()-start);
      return t.map(v => ({ id: v.id, title: v.title, updatedAt: v.updatedAt }));
    });
}

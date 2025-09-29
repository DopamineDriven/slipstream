import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

async function TestDbEdge() {
  const { getDbEdge } = await import("@slipstream/db/edge");
  const prisma = getDbEdge({
    connectionString: process.env.DATABASE_URL ?? ""
  });
  try {
    const attachments = await prisma.attachment.findMany({
      take: 500,
      orderBy: { createdAt: "desc" }
    });
    console.log(attachments.length ?? 0);
  } finally {
    console.log("done");
  }
}

TestDbEdge();

import * as dotenv from "dotenv";
import { prismaClient as prisma } from "@/lib/prisma";

dotenv.config();

if (process.argv[3] === "users") {
  (async () => {
    try {
      prisma.$connect();
    } catch (err) {
      if (err instanceof Error) {
        console.error(err.message);
      } else console.error(JSON.stringify(err, null, 2));
    } finally {
      const data = await prisma.user.findMany({
        include: {
          accounts: true,
          profile: true,
          sessions: true,
          settings: true,
          _count: true
        }
      });
      return data;
    }
  })().then(res => {
    console.log(JSON.stringify(res, null, 2));
    prisma.$disconnect();
  });
}

if (process.argv[3] === "clear") {
    (async () => {
    try {
      prisma.$connect();
    } catch (err) {
      if (err instanceof Error) {
        console.error(err.message);
      } else console.error(JSON.stringify(err, null, 2));
    } finally {
  prisma.session.deleteMany();
  prisma.profile.deleteMany();
  prisma.settings.deleteMany();
  prisma.account.deleteMany();
  prisma.user.deleteMany();
    }
  })().then(res => {
    console.log(JSON.stringify(res, null, 2));
    prisma.$disconnect();
  });
}
